"""Folder suggestions: logistic regression on embeddings, with uncertainty for active learning."""

from collections import Counter
from dataclasses import dataclass

import numpy as np
from sklearn.linear_model import LogisticRegression

MIN_PER_CLASS = 3


@dataclass
class Suggestion:
    index: int
    folder: str
    confidence: float
    margin: float


def trainable(labels: list[str | None]) -> list[str]:
    counts = Counter(label for label in labels if label)
    return sorted(label for label, c in counts.items() if c >= MIN_PER_CLASS)


def fit(embeddings: np.ndarray, labels: list[str]) -> LogisticRegression:
    return LogisticRegression(class_weight="balanced", max_iter=1000, C=10.0).fit(embeddings, labels)


def suggest(embeddings: np.ndarray, labels: list[str | None]) -> list[Suggestion]:
    """Train on rows with a usable label, predict a folder for every row without one."""
    classes = set(trainable(labels))
    train = [i for i, label in enumerate(labels) if label in classes]
    todo = [i for i, label in enumerate(labels) if not label]
    if len(classes) < 2 or not todo:
        return []
    model = fit(embeddings[train], [labels[i] for i in train])  # type: ignore[misc]
    proba = model.predict_proba(embeddings[todo])
    out = []
    for row, i in enumerate(todo):
        order = np.argsort(-proba[row])
        top, second = proba[row, order[0]], proba[row, order[1]]
        out.append(Suggestion(i, str(model.classes_[order[0]]), float(top), float(top - second)))
    return out
