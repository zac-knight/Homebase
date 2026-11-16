"""Recommendations and usage statistics."""

from collections import Counter
from datetime import UTC, datetime

import numpy as np
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import crawler
from app.auth import current_user
from app.db import Event, User, get_db, now_ms
from app.ml import recommend
from app.pipeline.stats import bootstrap_ci, wilson_interval
from app.pipeline.urls import domain
from app.services import brief, load_index, open_events

router = APIRouter()


@router.get("/recommendations", tags=["recommend"])
def recommendations(
    hour: int | None = None, limit: int = 5, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    """`hour` is the caller's local hour (0-23); the server does not know your time zone."""
    index = load_index(db, user)
    if hour is None:
        hour = datetime.now(UTC).hour
    recs = recommend.recommend(
        [b.canonical_url for b in index.bookmarks],
        index.embeddings,
        [b.added_at for b in index.bookmarks],
        open_events(db, user.id),
        now_ms(),
        hour % 24,
        min(limit, 20),
    )
    return {
        "results": [
            {**brief(index.bookmarks[i]), "score": round(score, 4), "reason": reason} for i, score, reason in recs
        ]
    }


@router.get("/stats", tags=["stats"])
def stats(user: User = Depends(current_user), db: Session = Depends(get_db)):
    index = load_index(db, user)
    events = list(db.scalars(select(Event).where(Event.user_id == user.id)))
    opens = [e for e in events if e.type == "open"]
    opened = {e.canonical_url for e in opens}
    never = np.array([b.canonical_url not in opened for b in index.bookmarks], dtype=float)
    now = now_ms()

    by_hour, by_dow, by_day = [0] * 24, [0] * 7, Counter()
    for e in opens:
        by_hour[e.hour] += 1
        by_dow[e.dow] += 1
        by_day[datetime.fromtimestamp(e.ts / 1000, UTC).date().isoformat()] += 1

    age_buckets = [
        ("under 30 days", 0, 30),
        ("1 to 3 months", 30, 90),
        ("3 to 12 months", 90, 365),
        ("over a year", 365, 10**6),
    ]
    decay = []
    for name, lo, hi in age_buckets:
        members = [b for b in index.bookmarks if b.added_at and lo <= (now - b.added_at) / 86_400_000 < hi]
        hit = sum(b.canonical_url in opened for b in members)
        decay.append(
            {
                "age": name,
                "bookmarks": len(members),
                "opened_share": hit / len(members) if members else None,
                "ci95": wilson_interval(hit, len(members)) if members else None,
            }
        )

    ab = []
    for variant in sorted({e.variant for e in events if e.type == "impression" and e.variant}):
        shown = sum(1 for e in events if e.type == "impression" and e.variant == variant)
        clicks = sum(1 for e in opens if e.source == "rightnow" and e.variant == variant)
        clicks = min(clicks, shown)
        ab.append(
            {
                "variant": variant,
                "impressions": shown,
                "clicks": clicks,
                "ctr": clicks / shown if shown else None,
                "ci95": wilson_interval(clicks, shown),
            }
        )

    return {
        "bookmarks": len(index.bookmarks),
        "opens": len(opens),
        "never_opened_share": float(never.mean()) if len(never) else None,
        "never_opened_ci95": bootstrap_ci(never) if len(never) else None,
        "opens_by_hour": by_hour,
        "opens_by_dow": by_dow,
        "opens_by_day": dict(sorted(by_day.items())),
        "top_domains": Counter(domain(b.url) for b in index.bookmarks).most_common(10),
        "interest_by_age": decay,
        "link_health": dict(Counter(crawler.link_state(b.link_status) for b in index.bookmarks)),
        "ab_test": ab,
    }
