import numpy as np


def near_duplicates(
    embeddings: np.ndarray, threshold: float = 0.9, max_pairs: int = 200
) -> list[tuple[int, int, float]]:
    """Pairs (i, j, cosine) with i < j whose embeddings are at least `threshold` similar.
    Exact duplicates never reach this point: bookmarks are keyed by canonical URL."""
    n = len(embeddings)
    pairs: list[tuple[int, int, float]] = []
    for start in range(0, n, 512):
        sims = embeddings[start : start + 512] @ embeddings.T
        for di, j in zip(*np.where(sims >= threshold), strict=True):
            i = start + int(di)
            if i < j and np.any(embeddings[i]):
                pairs.append((i, int(j), float(sims[di, j])))
    pairs.sort(key=lambda p: -p[2])
    return pairs[:max_pairs]
