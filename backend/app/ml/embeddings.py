"""Text embedders.

`SentenceTransformerEmbedder` is the real model. `HashingEmbedder` is a dependency-free
baseline (hashed word and character n-grams) used in tests, CI and as a fallback when
PyTorch is not installed. Both return L2-normalised 384-dimensional float32 vectors.
"""

import hashlib
from functools import lru_cache

import numpy as np

from app.config import get_settings
from app.db import EMBED_DIM
from app.ml.text import tokenize


def _bucket(feature: str) -> tuple[int, float]:
    h = int.from_bytes(hashlib.blake2b(feature.encode(), digest_size=8).digest(), "little")
    return h % EMBED_DIM, 1.0 if (h >> 32) & 1 else -1.0


class HashingEmbedder:
    name = "hashing-v1"

    def encode(self, texts: list[str]) -> np.ndarray:
        out = np.zeros((len(texts), EMBED_DIM), dtype=np.float32)
        for row, text in enumerate(texts):
            tokens = tokenize(text)
            feats: dict[str, float] = {}
            for tok in tokens:
                feats[tok] = feats.get(tok, 0.0) + 1.0
                padded = f"^{tok}$"
                for i in range(len(padded) - 2):
                    key = "#" + padded[i : i + 3]
                    feats[key] = feats.get(key, 0.0) + 0.3
            for a, b in zip(tokens, tokens[1:], strict=False):
                key = f"{a}_{b}"
                feats[key] = feats.get(key, 0.0) + 0.5
            for feat, weight in feats.items():
                idx, sign = _bucket(feat)
                out[row, idx] += sign * np.log1p(weight)
        norms = np.linalg.norm(out, axis=1, keepdims=True)
        return out / np.where(norms == 0, 1.0, norms)


class SentenceTransformerEmbedder:
    def __init__(self, model_name: str):
        from sentence_transformers import SentenceTransformer

        self.name = model_name
        self._model = SentenceTransformer(model_name)

    def encode(self, texts: list[str]) -> np.ndarray:
        return np.asarray(
            self._model.encode(texts, normalize_embeddings=True, batch_size=64, show_progress_bar=False),
            dtype=np.float32,
        )


@lru_cache
def get_embedder():
    s = get_settings()
    if s.embedder == "hashing":
        return HashingEmbedder()
    try:
        return SentenceTransformerEmbedder(s.embedding_model)
    except Exception:
        if s.embedder == "sentence-transformers":
            raise
        return HashingEmbedder()


def embedding_text(title: str, description: str, text: str) -> str:
    # The folder is deliberately left out: it is the label the tagging model predicts.
    return f"{title}. {description} {text[:1500]}".strip()


def content_hash(model_name: str, text: str) -> str:
    return hashlib.sha1(f"{model_name}\n{text}".encode()).hexdigest()
