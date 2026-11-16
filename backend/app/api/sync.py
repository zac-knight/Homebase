"""Idempotent push of bookmark changes and usage events from the extension."""

from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import auth, crawler
from app.db import Bookmark, Event, User, get_db
from app.pipeline.urls import canonicalise
from app.services import active_bookmarks, embed_pending

router = APIRouter()


class BookmarkIn(BaseModel):
    url: str = Field(max_length=2000)
    title: str = Field(default="", max_length=1000)
    folder: str = Field(default="", max_length=1000)
    added_at: int = 0
    updated_at: int = 0
    # Only sent when the user has turned on page text capture.
    description: str | None = Field(default=None, max_length=1000)
    text: str | None = Field(default=None, max_length=20000)


class EventIn(BaseModel):
    id: str = Field(max_length=64)
    type: Literal["open", "search", "impression"]
    url: str | None = Field(default=None, max_length=2000)
    source: str | None = Field(default=None, max_length=32)
    query: str | None = Field(default=None, max_length=500)
    variant: str | None = Field(default=None, max_length=16)
    ts: int
    hour: int = Field(ge=0, le=23)
    dow: int = Field(ge=0, le=6)


class SyncIn(BaseModel):
    upserts: list[BookmarkIn] = Field(default=[], max_length=20000)
    deletes: list[str] = Field(default=[], max_length=20000)
    events: list[EventIn] = Field(default=[], max_length=20000)


@router.post("/sync", tags=["sync"])
def sync(body: SyncIn, tasks: BackgroundTasks, user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    """Idempotent push of local changes. Bookmarks are keyed by canonical URL, so replaying a
    batch after a dropped connection is safe; the newest `updated_at` wins."""
    existing = {b.canonical_url: b for b in db.scalars(select(Bookmark).where(Bookmark.user_id == user.id))}
    upserted = deleted = 0
    for item in body.upserts:
        key = canonicalise(item.url)
        b = existing.get(key)
        if b is None:
            b = Bookmark(user_id=user.id, url=item.url, canonical_url=key)
            db.add(b)
            existing[key] = b
        elif item.updated_at < (b.updated_at or 0):
            continue
        b.url, b.title, b.folder = item.url, item.title, item.folder
        b.added_at, b.updated_at = item.added_at, item.updated_at
        if item.description is not None:
            b.description = item.description
        if item.text is not None:
            b.text = item.text
        upserted += 1
    for url in body.deletes:
        b = existing.pop(canonicalise(url), None)
        if b is not None:
            db.delete(b)  # hard delete: the row, its text and its vector all go
            deleted += 1

    incoming = {e.id: e for e in body.events}
    known = set()
    if incoming:
        known = set(
            db.scalars(
                select(Event.client_event_id).where(Event.user_id == user.id, Event.client_event_id.in_(incoming))
            )
        )
    for e in incoming.values():
        if e.id not in known:
            db.add(
                Event(
                    user_id=user.id,
                    client_event_id=e.id,
                    type=e.type,
                    url=e.url,
                    canonical_url=canonicalise(e.url) if e.url else None,
                    source=e.source,
                    query=e.query,
                    variant=e.variant,
                    ts=e.ts,
                    hour=e.hour,
                    dow=e.dow,
                )
            )
    if upserted or deleted:
        user.rev += 1
    db.commit()
    if upserted:
        tasks.add_task(embed_pending, user.id)
    return {
        "upserted": upserted,
        "deleted": deleted,
        "events": len(incoming) - len(known),
        "bookmarks": len(existing),
        "rev": user.rev,
    }


def bookmark_out(b: Bookmark) -> dict:
    return {
        "url": b.url,
        "title": b.title,
        "folder": b.folder,
        "added_at": b.added_at,
        "link_state": crawler.link_state(b.link_status),
        "link_checked_at": b.link_checked_at,
    }


@router.get("/bookmarks", tags=["bookmarks"])
def list_bookmarks(user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    return [bookmark_out(b) for b in active_bookmarks(db, user.id)]
