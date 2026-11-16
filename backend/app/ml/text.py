import re

STOPWORDS = frozenset(
    "a an and are as at be but by for from has have how i in is it its my of on or that the this to was what "
    "when where which who why with you your about did do does me into than then there these those "
    "can all use using not get".split()
)
_TOKEN = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    out = []
    for tok in _TOKEN.findall(text.lower()):
        if tok in STOPWORDS:
            continue
        # Crude plural stripping so "indexes"/"index" and "databases"/"database" meet.
        if len(tok) > 4 and tok.endswith("es") and not tok.endswith("ses"):
            tok = tok[:-2] if tok.endswith(("xes", "ches", "shes")) else tok[:-1]
        elif len(tok) > 3 and tok.endswith("s") and not tok.endswith("ss"):
            tok = tok[:-1]
        if len(tok) > 6 and tok.endswith("ing"):
            tok = tok[:-3]  # indexing -> index, training -> train
        out.append(tok)
    return out


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if len(s.strip()) > 20]
