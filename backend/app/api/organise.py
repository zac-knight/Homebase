"""Suggested folders (clusters), near duplicates and folder suggestions with active learning."""

from collections import defaultdict
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import current_user
from app.db import Bookmark, User, get_db
from app.ml import clustering, duplicates, tagging
from app.pipeline.urls import canonicalise
from app.services import brief, load_index

router = APIRouter()


@router.get("/clusters", tags=["organise"])
def clusters(
    method: Literal["kmeans", "hdbscan"] = "kmeans",
    k: int | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Suggested folders: groups of similar bookmarks named by their most distinctive terms."""
    index = load_index(db, user)
    rows = [i for i in range(len(index.bookmarks)) if index.embeddings[i].any()]
    if len(rows) < 6:
        return {"clusters": [], "silhouette": None, "method": method}
    labels, sil = clustering.cluster_embeddings(index.embeddings[rows], method, k)
    texts = [f"{index.bookmarks[i].title} {index.bookmarks[i].description}" for i in rows]
    names = clustering.ctfidf_names(texts, labels)
    groups: dict[int, list[int]] = defaultdict(list)
    for i, label in zip(rows, labels, strict=True):
        groups[int(label)].append(i)
    out = [
        {
            "name": " · ".join(names.get(label, [])) or "misc",
            "terms": names.get(label, []),
            "size": len(members),
            "bookmarks": [brief(index.bookmarks[i]) for i in members],
        }
        for label, members in sorted(groups.items(), key=lambda kv: -len(kv[1]))
        if label >= 0
    ]
    return {"clusters": out, "silhouette": sil, "method": method, "unclustered": len(groups.get(-1, []))}


@router.get("/duplicates", tags=["organise"])
def near_duplicates(threshold: float = 0.9, user: User = Depends(current_user), db: Session = Depends(get_db)):
    index = load_index(db, user)
    pairs = duplicates.near_duplicates(index.embeddings, threshold)
    return {
        "pairs": [
            {"a": brief(index.bookmarks[i]), "b": brief(index.bookmarks[j]), "similarity": round(s, 3)}
            for i, j, s in pairs
        ]
    }


def _labels(bookmarks: list[Bookmark]) -> list[str | None]:
    return [b.label or b.folder or None for b in bookmarks]


@router.get("/tags/suggestions", tags=["organise"])
def tag_suggestions(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Folder suggestions for unfiled bookmarks. `ask_me` holds the least certain ones: confirming
    those teaches the model the most (active learning)."""
    index = load_index(db, user)
    suggestions = tagging.suggest(index.embeddings, _labels(index.bookmarks))
    rows = [
        {
            **brief(index.bookmarks[s.index]),
            "suggested_folder": s.folder,
            "confidence": round(s.confidence, 3),
            "margin": round(s.margin, 3),
        }
        for s in suggestions
    ]
    rows.sort(key=lambda r: -r["confidence"])
    return {"suggestions": rows, "ask_me": sorted(rows, key=lambda r: r["margin"])[:5]}


class Confirm(BaseModel):
    url: str
    folder: str = Field(min_length=1, max_length=1000)


@router.post("/tags/confirm", tags=["organise"])
def confirm_tag(body: Confirm, user: User = Depends(current_user), db: Session = Depends(get_db)):
    b = db.scalar(select(Bookmark).where(Bookmark.user_id == user.id, Bookmark.canonical_url == canonicalise(body.url)))
    if b is None:
        raise HTTPException(404, "No such bookmark")
    b.label = body.folder
    user.rev += 1
    db.commit()
    return {"ok": True}
