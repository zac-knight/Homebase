"""Keyword (BM25), vector and hybrid (reciprocal rank fusion) search over one user's bookmarks."""

from collections import Counter, defaultdict
from dataclasses import dataclass

import numpy as np

from app.ml.text import tokenize


class BM25:
    def __init__(self, docs: list[list[str]], k1: float = 1.5, b: float = 0.75):
        self.n = len(docs)
        lengths = np.array([len(d) for d in docs], dtype=np.float32)
        avg = float(lengths.mean()) if self.n and lengths.mean() > 0 else 1.0
        self._norm = k1 * (1 - b + b * lengths / avg)
        self._k1 = k1
        postings: dict[str, list[tuple[int, int]]] = defaultdict(list)
        for i, doc in enumerate(docs):
            for term, tf in Counter(doc).items():
                postings[term].append((i, tf))
        self._postings = {
            t: (np.array([i for i, _ in p]), np.array([tf for _, tf in p], dtype=np.float32))
            for t, p in postings.items()
        }

    def scores(self, query: list[str]) -> np.ndarray:
        out = np.zeros(self.n, dtype=np.float32)
        for term in set(query):
            if term not in self._postings:
                continue
            idx, tf = self._postings[term]
            idf = np.log(1 + (self.n - len(idx) + 0.5) / (len(idx) + 0.5))
            out[idx] += idf * tf * (self._k1 + 1) / (tf + self._norm[idx])
        return out


def rrf(rankings: list[list[int]], k: int = 60) -> list[tuple[int, float]]:
    """Reciprocal rank fusion: score(d) = sum over rankings of 1 / (k + rank)."""
    fused: dict[int, float] = defaultdict(float)
    for ranking in rankings:
        for rank, doc in enumerate(ranking, start=1):
            fused[doc] += 1.0 / (k + rank)
    return sorted(fused.items(), key=lambda kv: (-kv[1], kv[0]))


@dataclass
class Hit:
    index: int
    score: float
    keyword_score: float
    cosine: float


class SearchIndex:
    """`keyword_texts[i]` and `embeddings[i]` describe document i. Embeddings must be L2-normalised;
    rows may be all-zero for documents that have not been embedded yet."""

    def __init__(self, keyword_texts: list[str], embeddings: np.ndarray):
        self.bm25 = BM25([tokenize(t) for t in keyword_texts])
        self.embeddings = embeddings.astype(np.float32)
        self.n = len(keyword_texts)

    def search(
        self,
        query: str,
        query_vec: np.ndarray | None,
        mode: str = "hybrid",
        limit: int = 10,
        depth: int = 50,
        vec_rank: list[int] | None = None,
    ) -> list[Hit]:
        """`vec_rank` lets the caller supply a nearest-neighbour ranking computed elsewhere (pgvector)."""
        if self.n == 0:
            return []
        kw = self.bm25.scores(tokenize(query))
        cos = self.embeddings @ query_vec if query_vec is not None else np.zeros(self.n, dtype=np.float32)
        kw_rank = [int(i) for i in np.argsort(-kw, kind="stable")[:depth] if kw[i] > 0]
        if vec_rank is None:
            vec_rank = [int(i) for i in np.argsort(-cos, kind="stable")[:depth] if cos[i] > 0]
        if mode == "keyword":
            ranked = [(i, float(kw[i])) for i in kw_rank]
        elif mode == "vector":
            ranked = [(i, float(cos[i])) for i in vec_rank]
        else:
            ranked = rrf([kw_rank, vec_rank])
        return [Hit(i, score, float(kw[i]), float(cos[i])) for i, score in ranked[:limit]]
