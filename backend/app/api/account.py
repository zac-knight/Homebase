"""Data control: export everything, delete everything."""

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import auth
from app.db import Bookmark, Event, User, get_db
from app.services import drop_cache

router = APIRouter()


@router.get("/export", tags=["account"])
def export(user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    """Everything the server holds about you, vectors included."""
    bookmarks = [
        {c.name: getattr(b, c.name) for c in Bookmark.__table__.columns if c.name not in ("id", "user_id")}
        for b in db.scalars(select(Bookmark).where(Bookmark.user_id == user.id))
    ]
    events = [
        {c.name: getattr(e, c.name) for c in Event.__table__.columns if c.name not in ("id", "user_id")}
        for e in db.scalars(select(Event).where(Event.user_id == user.id))
    ]
    return {"email": user.email, "created_at": user.created_at, "bookmarks": bookmarks, "events": events}


@router.delete("/account", tags=["account"])
def delete_account(user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    db.execute(delete(Event).where(Event.user_id == user.id))
    db.execute(delete(Bookmark).where(Bookmark.user_id == user.id))
    db.execute(delete(User).where(User.id == user.id))
    db.commit()
    drop_cache(user.id)
    return {"deleted": True}
