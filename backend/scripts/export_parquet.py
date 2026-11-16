"""Ingest step of the analysis pipeline: database -> cleaned Parquet files.

    uv run --extra data python scripts/export_parquet.py --email you@example.com --out ../data

Writes bookmarks.parquet, events.parquet and features.parquet (one row per bookmark with the
engineered features). Embeddings are left out; the files are for analysis, not for serving.
"""

import argparse
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.crawler import link_state  # noqa: E402
from app.db import Bookmark, Event, SessionLocal, User, now_ms  # noqa: E402
from app.pipeline.features import bookmark_features  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True, help="account to export")
    parser.add_argument("--out", default="../data")
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == args.email.lower()))
        if user is None:
            sys.exit(f"No account for {args.email}")
        skip = {"id", "user_id", "embedding", "embed_hash"}
        bookmarks = [
            {c.name: getattr(b, c.name) for c in Bookmark.__table__.columns if c.name not in skip}
            for b in db.scalars(select(Bookmark).where(Bookmark.user_id == user.id, Bookmark.deleted.is_(False)))
        ]
        events = [
            {c.name: getattr(e, c.name) for c in Event.__table__.columns if c.name not in ("id", "user_id")}
            for e in db.scalars(select(Event).where(Event.user_id == user.id))
        ]

    features = bookmark_features(bookmarks, events, now_ms())
    for row in features:
        row["link_state"] = link_state(row.pop("link_status"))
    pd.DataFrame(bookmarks).to_parquet(out / "bookmarks.parquet", index=False)
    pd.DataFrame(events).to_parquet(out / "events.parquet", index=False)
    pd.DataFrame(features).to_parquet(out / "features.parquet", index=False)
    print(f"Wrote {len(bookmarks)} bookmarks, {len(events)} events and {len(features)} feature rows to {out.resolve()}")


if __name__ == "__main__":
    main()
