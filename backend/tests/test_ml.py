import numpy as np

from app.ml import clustering, duplicates, qa, tagging
from app.ml.embeddings import HashingEmbedder
from app.ml.recommend import Open, recent_baseline, recommend
from app.ml.search import BM25, SearchIndex, rrf
from app.ml.text import tokenize

DAY = 86_400_000
embedder = HashingEmbedder()


def test_tokenize_drops_stopwords_and_plurals():
    assert tokenize("How do the Indexes work in databases?") == ["index", "work", "database"]


def test_bm25_prefers_rarer_matching_terms():
    docs = [tokenize(t) for t in ["postgres index tuning", "postgres backup guide", "sourdough bread"]]
    scores = BM25(docs).scores(tokenize("postgres index"))
    assert scores[0] > scores[1] > scores[2] == 0


def test_rrf_rewards_agreement_between_rankers():
    fused = rrf([[1, 2, 3], [3, 2, 1], [2, 9]])
    assert fused[0][0] == 2


def test_hashing_embedder_is_normalised_and_deterministic():
    a = embedder.encode(["vector similarity search", "vector similarity search", ""])
    assert np.allclose(a[0], a[1]) and np.isclose(np.linalg.norm(a[0]), 1.0) and not a[2].any()
    related, unrelated = embedder.encode(["searching vectors by similarity", "sourdough bread baking"])
    assert a[0] @ related > a[0] @ unrelated


def test_search_modes(demo):
    index = SearchIndex(
        [f"{b['title']} {b['description']}" for b in demo],
        embedder.encode([f"{b['title']}. {b['description']}" for b in demo]),
    )
    q = "sql index performance"
    for mode in ("keyword", "vector", "hybrid"):
        hits = index.search(q, embedder.encode([q])[0], mode, limit=5)
        assert "use-the-index-luke" in demo[hits[0].index]["url"], mode
    assert index.search("zzzz qqqq", None, "keyword") == []


def test_clusters_get_distinctive_names():
    texts = [
        "pizza dough recipe",
        "bread baking recipe",
        "pasta sauce recipe",
        "postgres index query",
        "sqlite query planner",
        "sql join query",
    ] * 2
    labels, sil = clustering.cluster_embeddings(embedder.encode(texts), k=2)
    names = clustering.ctfidf_names(texts, labels)
    assert len(set(labels)) == 2 and sil is not None and sil > 0
    assert {"recipe", "query"} == {names[0][0], names[1][0]}
    assert labels[0] == labels[1] == labels[2] != labels[3]


def test_near_duplicates_finds_same_article_on_two_sites():
    emb = embedder.encode(
        [
            "How database indexes work: a guide to B-trees",
            "How database indexes work - a guide to B-trees",
            "Sourdough for beginners",
        ]
    )
    pairs = duplicates.near_duplicates(emb, threshold=0.9)
    assert [(i, j) for i, j, _ in pairs] == [(0, 1)]


def test_recommend_uses_time_of_day_and_cold_start():
    now = 400 * DAY
    keys = ["morning-news", "evening-recipes", "brand-new", "never-used-old"]
    emb = embedder.encode(["daily news headlines", "dinner recipes", "new thing", "old thing"])
    added = [now - 300 * DAY, now - 300 * DAY, now - 2 * DAY, now - 300 * DAY]
    opens = [Open("morning-news", now - d * DAY, 8) for d in range(1, 8)] + [
        Open("evening-recipes", now - d * DAY, 19) for d in range(1, 8)
    ]
    morning = [keys[i] for i, _, _ in recommend(keys, emb, added, opens, now, hour=8)]
    evening = [keys[i] for i, _, _ in recommend(keys, emb, added, opens, now, hour=19)]
    assert morning[0] == "morning-news" and evening[0] == "evening-recipes"
    assert morning.index("brand-new") < morning.index("never-used-old")  # cold-start boost
    just_opened = opens + [Open("morning-news", now - 60_000, 8)]
    assert "morning-news" not in [keys[i] for i, _, _ in recommend(keys, emb, added, just_opened, now, hour=8)]
    assert recent_baseline(keys, just_opened)[0] == 0


def test_tag_suggestions_follow_existing_folders():
    texts = [
        "pizza recipe",
        "bread recipe",
        "pasta recipe",
        "sql query index",
        "postgres query",
        "sqlite query",
        "soup recipe dinner",
    ]
    labels = ["Cooking"] * 3 + ["Databases"] * 3 + [None]
    out = tagging.suggest(embedder.encode(texts), labels)
    assert len(out) == 1 and out[0].index == 6 and out[0].folder == "Cooking" and 0 <= out[0].margin <= 1
    assert tagging.suggest(embedder.encode(texts[:3]), ["Cooking", "Cooking", None]) == []


def test_qa_refuses_without_evidence(demo):
    docs = [(b["title"], b["description"]) for b in demo]
    index = SearchIndex([f"{t} {d}" for t, d in docs], embedder.encode([f"{t}. {d}" for t, d in docs]))

    def ask(question):
        return qa.answer(
            question, index.search(question, embedder.encode([question])[0], "hybrid", 8), docs, embedder.name
        )

    evidence = ask("what did I save about database indexing?")
    assert evidence and any("index" in docs[e.index][1].lower() for e in evidence)
    assert all(e.sentence in docs[e.index][1] or e.sentence == docs[e.index][0] for e in evidence)
    assert ask("xylophone quokka zeppelin") == []
