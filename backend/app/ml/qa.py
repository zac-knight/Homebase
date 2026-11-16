"""Grounded question answering without a generative model.

The answer is assembled only from sentences found in retrieved bookmarks, each tagged with the
bookmark it came from. If retrieval finds nothing above the evidence bar, we say so rather than
guess. No text leaves the server: there is no third-party model call here.
"""

from dataclasses import dataclass

from app.ml.search import Hit
from app.ml.text import split_sentences, tokenize

MIN_COSINE = {"hashing-v1": 0.22}
DEFAULT_MIN_COSINE = 0.35
# Looser bar for showing a search result at all (a vector index always has a "nearest" item,
# however unrelated, so results with no keyword match need some minimum similarity).
SEARCH_MIN_COSINE = {"hashing-v1": 0.15}
DEFAULT_SEARCH_MIN_COSINE = 0.25


def worth_showing(hit: Hit, embedder_name: str) -> bool:
    return hit.keyword_score > 0 or hit.cosine >= SEARCH_MIN_COSINE.get(embedder_name, DEFAULT_SEARCH_MIN_COSINE)


@dataclass
class Evidence:
    index: int
    sentence: str


def has_evidence(hit: Hit, embedder_name: str, best_keyword: float) -> bool:
    """A bookmark counts as evidence if it is semantically close to the question, or if it is one
    of the stronger keyword matches and at least loosely related in meaning (one shared common
    word is not enough)."""
    strong_keyword = hit.keyword_score > 0 and hit.keyword_score >= 0.5 * best_keyword
    loosely_related = hit.cosine >= SEARCH_MIN_COSINE.get(embedder_name, DEFAULT_SEARCH_MIN_COSINE)
    return (strong_keyword and loosely_related) or hit.cosine >= MIN_COSINE.get(embedder_name, DEFAULT_MIN_COSINE)


def best_sentence(question: str, body: str) -> str:
    """The sentence of the saved page text that best matches the question, or "" when the
    bookmark has no text (only its title was synced)."""
    q = set(tokenize(question))
    sentences = split_sentences(body)
    best, best_score = "", 0.0
    for sentence in sentences:
        toks = set(tokenize(sentence))
        score = len(q & toks) / (len(toks) ** 0.5 or 1)
        if score > best_score:
            best, best_score = sentence, score
    return (best or (sentences[0] if sentences else ""))[:300]


def answer(
    question: str, hits: list[Hit], docs: list[tuple[str, str]], embedder_name: str, max_sources: int = 4
) -> list[Evidence]:
    """`docs[i]` is (title, body) for document i. Returns evidence in rank order, possibly empty."""
    out = []
    best_keyword = max((h.keyword_score for h in hits), default=0.0)
    for hit in hits:
        if len(out) == max_sources:
            break
        if has_evidence(hit, embedder_name, best_keyword):
            out.append(Evidence(hit.index, best_sentence(question, docs[hit.index][1])))
    return out
