"""Keyword, vector and hybrid search, plus grounded question answering."""

import time
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import current_user
from app.db import User, get_db
from app.ml import qa
from app.ml.embeddings import get_embedder
from app.services import brief, load_index, pgvector_rank

router = APIRouter()


@router.get("/search", tags=["search"])
def search(
    q: str,
    mode: Literal["hybrid", "keyword", "vector"] = "hybrid",
    limit: int = 10,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    start = time.perf_counter()
    index = load_index(db, user)
    embedder = get_embedder()
    qvec = None if mode == "keyword" else embedder.encode([q])[0]
    vec_rank = pgvector_rank(db, user.id, qvec, index) if qvec is not None else None
    hits = index.searcher.search(q, qvec, mode, min(limit, 50), vec_rank=vec_rank)
    hits = [h for h in hits if qa.worth_showing(h, embedder.name)]
    results = [
        {
            **brief(index.bookmarks[h.index]),
            "score": round(h.score, 5),
            "keyword_score": round(h.keyword_score, 3),
            "cosine": round(h.cosine, 3),
        }
        for h in hits
    ]
    return {
        "results": results,
        "mode": mode,
        "embedder": embedder.name,
        "took_ms": round((time.perf_counter() - start) * 1000, 1),
    }


class Question(BaseModel):
    question: str = Field(min_length=2, max_length=500)


@router.post("/ask", tags=["search"])
def ask(body: Question, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Answers only from your own bookmarks. Every line of the answer cites the bookmark it was
    taken from; if nothing relevant is saved, `grounded` is false and no answer is invented."""
    index = load_index(db, user)
    embedder = get_embedder()
    qvec = embedder.encode([body.question])[0]
    hits = index.searcher.search(body.question, qvec, "hybrid", 8, vec_rank=pgvector_rank(db, user.id, qvec, index))
    docs = [(b.title, f"{b.description}\n{b.text}") for b in index.bookmarks]
    evidence = qa.answer(body.question, hits, docs, embedder.name)
    if not evidence:
        return {
            "grounded": False,
            "answer": None,
            "sources": [],
            "message": "Nothing in your bookmarks looks relevant to that question.",
        }
    sources = [{**brief(index.bookmarks[e.index]), "n": n, "excerpt": e.sentence} for n, e in enumerate(evidence, 1)]
    answer = "\n".join(
        f"{s['title'] or s['url']}{': ' + s['excerpt'] if s['excerpt'] else ''} [{s['n']}]" for s in sources
    )
    return {"grounded": True, "answer": answer, "sources": sources, "generated_by": "extractive (no language model)"}
