"""Group bookmarks by embedding and name each group with class-based TF-IDF terms."""

import re
from collections import Counter

import numpy as np
from sklearn.cluster import HDBSCAN, KMeans
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
from sklearn.metrics import silhouette_score

from app.ml.text import tokenize

# Words too generic to name a group, on top of the tokenizer's own short stopword list.
NAME_STOPWORDS = ENGLISH_STOP_WORDS | {"getting", "started", "learn", "guide", "know", "way", "new", "free", "online"}


def ctfidf_names(texts: list[str], labels: np.ndarray, top_n: int = 3) -> dict[int, list[str]]:
    """Top terms per cluster by class-based TF-IDF: frequent inside the cluster, rare outside it.
    Scoring uses stemmed tokens; names show the most common original spelling of each stem."""
    per_class: dict[int, Counter] = {}
    surface: dict[str, Counter] = {}
    for text, label in zip(texts, labels, strict=True):
        if label < 0:
            continue
        counts = per_class.setdefault(int(label), Counter())
        for word in re.findall(r"[a-z0-9]+", text.lower()):
            for stem in tokenize(word):
                counts[stem] += 1
                surface.setdefault(stem, Counter())[word] += 1
    total: Counter = Counter()
    for counts in per_class.values():
        total.update(counts)
    avg_words = sum(total.values()) / max(1, len(per_class))
    names = {}
    for label, counts in per_class.items():
        size = sum(counts.values()) or 1
        scored = {
            t: (tf / size) * np.log(1 + avg_words / total[t])
            for t, tf in counts.items()
            if len(t) > 2 and not t.isdigit() and surface[t].most_common(1)[0][0] not in NAME_STOPWORDS
        }
        top = sorted(scored.items(), key=lambda kv: (-kv[1], kv[0]))[:top_n]
        names[label] = [surface[t].most_common(1)[0][0] for t, _ in top]
    return names


def cluster_embeddings(
    embeddings: np.ndarray, method: str = "kmeans", k: int | None = None, seed: int = 0
) -> tuple[np.ndarray, float | None]:
    """Returns (labels, silhouette). Label -1 means noise (HDBSCAN only)."""
    n = len(embeddings)
    if n < 6:
        return np.zeros(n, dtype=int), None
    if method == "hdbscan":
        x = embeddings
        try:  # UMAP is optional; HDBSCAN on raw embeddings still works, just less well.
            import umap

            x = umap.UMAP(
                n_components=min(10, n - 2), n_neighbors=min(15, n - 1), metric="cosine", random_state=seed
            ).fit_transform(embeddings)
        except ImportError:
            pass
        labels = HDBSCAN(min_cluster_size=max(3, n // 40)).fit_predict(x)
    elif k is not None:
        labels = KMeans(n_clusters=min(k, n - 1), n_init=10, random_state=seed).fit_predict(embeddings)
    else:
        best: tuple[float, np.ndarray] | None = None
        # Between sqrt(n)/2 and sqrt(n) groups. Silhouette alone tends to pick two giant groups,
        # which is no use as a folder suggestion, so the range starts above that.
        upper = max(3, min(20, round(n**0.5)))
        for candidate in range(max(2, upper // 2), upper + 1):
            cand_labels = KMeans(n_clusters=candidate, n_init=10, random_state=seed).fit_predict(embeddings)
            score = silhouette_score(embeddings, cand_labels, metric="cosine")
            if best is None or score > best[0]:
                best = (score, cand_labels)
        assert best is not None
        labels = best[1]
    mask = labels >= 0
    n_labels = len(set(labels[mask]))
    sil = None
    if 2 <= n_labels < mask.sum():
        sil = float(silhouette_score(embeddings[mask], labels[mask], metric="cosine"))
    return labels, sil
