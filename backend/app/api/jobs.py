"""Background jobs: link health checks and opt-in page text fetching."""

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import select

from app import auth, crawler
from app.db import Bookmark, SessionLocal, User, now_ms
from app.services import embed_pending

router = APIRouter()


def check_links(user_id: int, limit: int, fetch_text: bool) -> int:
    with SessionLocal() as db:
        stmt = (
            select(Bookmark)
            .where(Bookmark.user_id == user_id, Bookmark.deleted.is_(False))
            .order_by(Bookmark.link_checked_at.is_not(None), Bookmark.link_checked_at)
            .limit(limit)
        )
        rows = list(db.scalars(stmt))
        results = [crawler.fetch(b.url, fetch_text) for b in rows]
        if len(results) >= 3 and all(status == 0 for status, _ in results):
            return 0  # every request failed: the server is probably offline, so record nothing
        for b, (status, html) in zip(rows, results, strict=True):
            b.link_status, b.link_checked_at = status, now_ms()
            if html:
                page = crawler.extract(html)
                b.title = b.title or page["title"]  # fill missing titles only
                b.description = b.description or page["description"]
                b.text = b.text or page["text"]
        user = db.get(User, user_id)
        if user and rows:
            user.rev += 1
        db.commit()
    if fetch_text:
        embed_pending(user_id)
    return len(rows)


@router.post("/jobs/check-links", tags=["jobs"])
def start_link_check(
    tasks: BackgroundTasks, limit: int = 50, fetch_text: bool = False, user: User = Depends(auth.current_user)
):
    """Checks the `limit` least recently checked links. `fetch_text=true` also stores page text
    for bookmarks that have none; the extension only sets it when the user opted in."""
    tasks.add_task(check_links, user.id, min(limit, 500), fetch_text)
    return {"queued": min(limit, 500)}
