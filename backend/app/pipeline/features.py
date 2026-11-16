"""Feature engineering shared by the stats endpoint, the Parquet export and the notebooks."""

from collections import Counter, defaultdict

from app.pipeline.urls import domain, path_depth

DAY_MS = 86_400_000


def bookmark_features(bookmarks: list[dict], events: list[dict], now_ms: int) -> list[dict]:
    """One row per bookmark. `bookmarks`/`events` are plain dicts so this also works on Parquet rows."""
    opens: dict[str, list[dict]] = defaultdict(list)
    for e in events:
        if e["type"] == "open" and e.get("canonical_url"):
            opens[e["canonical_url"]].append(e)
    rows = []
    for b in bookmarks:
        evs = opens.get(b["canonical_url"], [])
        last = max((e["ts"] for e in evs), default=None)
        hours = Counter(e["hour"] for e in evs)
        dows = Counter(e["dow"] for e in evs)
        rows.append(
            {
                "canonical_url": b["canonical_url"],
                "domain": domain(b["url"]),
                "path_depth": path_depth(b["url"]),
                "folder": b.get("folder", ""),
                "title_length": len(b.get("title", "")),
                "text_length": len(b.get("text", "")),
                "age_days": max(0.0, (now_ms - b["added_at"]) / DAY_MS) if b.get("added_at") else None,
                "open_count": len(evs),
                "days_since_last_open": (now_ms - last) / DAY_MS if last else None,
                "modal_hour": hours.most_common(1)[0][0] if hours else None,
                "modal_dow": dows.most_common(1)[0][0] if dows else None,
                "link_status": b.get("link_status"),
            }
        )
    return rows
