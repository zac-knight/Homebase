"""Glue between the database and the ML modules: embedding refresh and the per-user index cache."""

from dataclasses import dataclass

import numpy as np
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db import EMBED_DIM, Bookmark, Event, SessionLocal, User, engine
from app.ml.embeddings import content_hash, embedding_text, get_embedder
from app.ml.recommend import Open
from app.ml.search import SearchIndex
from app.pipeline.urls import domain


@dataclass
class UserIndex:
    bookmarks: list[Bookmark]
    embeddings: np.ndarray
    searcher: SearchIndex
    by_id: dict[int, int]


_cache: dict[int, tuple[int, UserIndex]] = {}


def brief(b: Bookmark) -> dict:
    return {"url": b.url, "title": b.title, "folder": b.folder}


def active_bookmarks(db: Session, user_id: int) -> list[Bookmark]:
    stmt = select(Bookmark).where(Bookmark.user_id == user_id, Bookmark.deleted.is_(False)).order_by(Bookmark.id)
    return list(db.scalars(stmt))


def load_index(db: Session, user: User) -> UserIndex:
    cached = _cache.get(user.id)
    if cached and cached[0] == user.rev:
        return cached[1]
    bookmarks = active_bookmarks(db, user.id)
    emb = np.zeros((len(bookmarks), EMBED_DIM), dtype=np.float32)
    for i, b in enumerate(bookmarks):
        if b.embedding is not None:
            emb[i] = b.embedding
    keyword_texts = [f"{b.title} {b.folder} {domain(b.url)} {b.description} {b.text[:3000]}" for b in bookmarks]
    index = UserIndex(bookmarks, emb, SearchIndex(keyword_texts, emb), {b.id: i for i, b in enumerate(bookmarks)})
    _cache[user.id] = (user.rev, index)
    return index


def drop_cache(user_id: int) -> None:
    _cache.pop(user_id, None)


def embed_pending(user_id: int) -> int:
    """Embed bookmarks whose text changed since they were last embedded. Unchanged text is skipped
    (the content hash is the cache key), so re-syncing an untouched library costs nothing."""
    embedder = get_embedder()
    with SessionLocal() as db:
        todo = []
        for b in active_bookmarks(db, user_id):
            body = embedding_text(b.title, b.description, b.text)
            digest = content_hash(embedder.name, body)
            if digest != b.embed_hash:
                todo.append((b, body, digest))
        for start in range(0, len(todo), 256):
            batch = todo[start : start + 256]
            vectors = embedder.encode([body for _, body, _ in batch])
            for (b, _, digest), vec in zip(batch, vectors, strict=True):
                b.embedding = vec.tolist()
                b.embed_hash = digest
        if todo:
            user = db.get(User, user_id)
            if user:
                user.rev += 1
            db.commit()
        return len(todo)


def pgvector_rank(
    db: Session, user_id: int, query_vec: np.ndarray, index: UserIndex, depth: int = 50
) -> list[int] | None:
    """Nearest neighbours by cosine distance inside PostgreSQL. Returns None on other databases,
    in which case the caller falls back to the in-memory matrix."""
    if engine.dialect.name != "postgresql":
        return None
    rows = db.execute(
        text(
            "SELECT id FROM bookmarks WHERE user_id = :uid AND NOT deleted AND embedding IS NOT NULL "
            "ORDER BY embedding <=> CAST(:q AS vector) LIMIT :k"
        ),
        {"uid": user_id, "q": "[" + ",".join(f"{x:.6f}" for x in query_vec) + "]", "k": depth},
    )
    return [index.by_id[r[0]] for r in rows if r[0] in index.by_id]


def open_events(db: Session, user_id: int) -> list[Open]:
    stmt = select(Event).where(Event.user_id == user_id, Event.type == "open", Event.canonical_url.is_not(None))
    return [Open(e.canonical_url, e.ts, e.hour) for e in db.scalars(stmt)]  # type: ignore[arg-type]
