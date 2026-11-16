"""Content-based "Right now" recommender plus the baselines it has to beat."""

from collections import defaultdict
from dataclasses import dataclass

import numpy as np

DAY_MS = 86_400_000
WEIGHTS = {"similar": 0.35, "time_of_day": 0.30, "frequency": 0.15, "neglected": 0.10, "new": 0.10}


@dataclass
class Open:
    key: str
    ts: int
    hour: int


def _hour_distance(a: int, b: int) -> int:
    d = abs(a - b) % 24
    return min(d, 24 - d)


def recommend(
    keys: list[str],
    embeddings: np.ndarray,
    added_at: list[int],
    opens: list[Open],
    now_ms: int,
    hour: int,
    limit: int = 5,
    weights: dict[str, float] = WEIGHTS,
) -> list[tuple[int, float, str]]:
    """Returns (index, score, reason) for the top `limit` bookmarks.

    Signals: similarity to what was opened recently, how often this link is opened around this
    hour, overall frequency, how long a once-used link has been neglected, and a cold-start
    boost so brand-new bookmarks get shown before they have any click history.
    """
    index = {k: i for i, k in enumerate(keys)}
    by_key: dict[str, list[Open]] = defaultdict(list)
    for o in opens:
        if o.key in index:
            by_key[o.key].append(o)

    recent_keys: list[str] = []
    for o in sorted(opens, key=lambda o: -o.ts):
        if o.key in index and o.key not in recent_keys and now_ms - o.ts < 7 * DAY_MS:
            recent_keys.append(o.key)
        if len(recent_keys) == 5:
            break
    centroid = None
    if recent_keys:
        centroid = embeddings[[index[k] for k in recent_keys]].mean(axis=0)
        norm = np.linalg.norm(centroid)
        centroid = centroid / norm if norm else None

    max_opens = max((len(v) for v in by_key.values()), default=0)
    scored = []
    for i, key in enumerate(keys):
        evs = by_key.get(key, [])
        last = max((o.ts for o in evs), default=None)
        if last is not None and now_ms - last < 30 * 60_000:
            continue  # just opened; showing it again is noise
        parts = {
            "similar": max(0.0, float(embeddings[i] @ centroid))
            if centroid is not None and key not in recent_keys
            else 0.0,
            "time_of_day": sum(1 for o in evs if _hour_distance(o.hour, hour) <= 1) / (len(evs) + 2),
            "frequency": np.log1p(len(evs)) / np.log1p(max_opens) if max_opens else 0.0,
            "neglected": min(1.0, (now_ms - last) / (30 * DAY_MS)) if last else 0.0,
            "new": 1.0 if not evs and added_at[i] and now_ms - added_at[i] < 14 * DAY_MS else 0.0,
        }
        score = sum(weights[name] * value for name, value in parts.items())
        if score > 0:
            reason = max(parts, key=lambda name: weights[name] * parts[name])
            scored.append((i, float(score), reason))
    scored.sort(key=lambda s: (-s[1], s[0]))
    return scored[:limit]


def recent_baseline(keys: list[str], opens: list[Open], limit: int = 5) -> list[int]:
    """The plain list the recommender is compared against: most recently opened first."""
    index = {k: i for i, k in enumerate(keys)}
    seen: list[int] = []
    for o in sorted(opens, key=lambda o: -o.ts):
        if o.key in index and index[o.key] not in seen:
            seen.append(index[o.key])
        if len(seen) == limit:
            break
    return seen


def frequent_baseline(keys: list[str], opens: list[Open], limit: int = 5) -> list[int]:
    index = {k: i for i, k in enumerate(keys)}
    counts: dict[int, int] = defaultdict(int)
    for o in opens:
        if o.key in index:
            counts[index[o.key]] += 1
    return [i for i, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]]
