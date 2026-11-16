"""Rerunnable evaluation: every ML feature against its simple baseline.

    uv run python scripts/evaluate.py            # prints a table, writes eval/results.json (git-ignored)
    uv run --extra embeddings python scripts/evaluate.py   # also evaluates the real embedding model

The dataset is the 58-bookmark demo library plus 50 hand-written queries (both in ../sample-data).
It is small and was written by the project author, so treat the numbers as a smoke test of the
pipeline, not as evidence about anyone's real bookmarks. Recommendation numbers use a
simulated click log (see `simulate_opens`) and say even less. Replace both with real data.
"""

import json
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.dummy import DummyClassifier
from sklearn.metrics import f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.ml import clustering, tagging  # noqa: E402
from app.ml.embeddings import HashingEmbedder, embedding_text  # noqa: E402
from app.ml.recommend import Open, frequent_baseline, recent_baseline, recommend  # noqa: E402
from app.ml.search import SearchIndex  # noqa: E402
from app.pipeline.stats import bootstrap_ci  # noqa: E402
from app.pipeline.urls import domain  # noqa: E402

SEED = 0
DAY = 86_400_000
SAMPLE = ROOT.parent / "sample-data"
BOOKMARKS = json.loads((SAMPLE / "bookmarks.json").read_text())
QUERIES = json.loads((SAMPLE / "search-queries.json").read_text())


def embedders():
    out = [HashingEmbedder()]
    try:
        from app.ml.embeddings import SentenceTransformerEmbedder

        out.append(SentenceTransformerEmbedder("sentence-transformers/all-MiniLM-L6-v2"))
    except Exception as exc:  # not installed, or model download unavailable
        print(f"(sentence-transformers unavailable: {type(exc).__name__}; evaluating the hashing embedder only)\n")
    return out


def eval_search(embedder, emb) -> dict:
    index = SearchIndex([f"{b['title']} {b['folder']} {domain(b['url'])} {b['description']}" for b in BOOKMARKS], emb)
    urls = [b["url"] for b in BOOKMARKS]
    qvecs = embedder.encode([q["q"] for q in QUERIES])
    out = {}
    for mode in ("keyword", "vector", "hybrid"):
        recalls, rrs = [], []
        for q, qvec in zip(QUERIES, qvecs, strict=True):
            ranked = [urls[h.index] for h in index.search(q["q"], qvec, mode, limit=10)]
            relevant = set(q["relevant"])
            recalls.append(len(relevant & set(ranked)) / len(relevant))
            rrs.append(next((1 / r for r, u in enumerate(ranked, 1) if u in relevant), 0.0))
        out[mode] = {
            "recall@10": float(np.mean(recalls)),
            "recall@10_ci95": bootstrap_ci(recalls),
            "mrr": float(np.mean(rrs)),
            "mrr_ci95": bootstrap_ci(rrs),
        }
    return out


def eval_clustering(emb) -> dict:
    labels, sil = clustering.cluster_embeddings(emb, seed=SEED)
    names = clustering.ctfidf_names([f"{b['title']} {b['description']}" for b in BOOKMARKS], labels)
    k_true = len({b["folder"] for b in BOOKMARKS if b["folder"]})
    _, sil_at_true_k = clustering.cluster_embeddings(emb, k=k_true, seed=SEED)
    return {
        "k_chosen": len(set(labels)),
        "silhouette": sil,
        f"silhouette_at_k={k_true}": sil_at_true_k,
        "names": [" / ".join(v) for _, v in sorted(names.items())],
    }


def eval_tagging(emb) -> dict:
    rows = [i for i, b in enumerate(BOOKMARKS) if b["folder"]]
    x, y = emb[rows], np.array([BOOKMARKS[i]["folder"] for i in rows])
    folds = StratifiedKFold(n_splits=4, shuffle=True, random_state=SEED)
    majority = cross_val_predict(DummyClassifier(strategy="most_frequent"), x, y, cv=folds)
    model = cross_val_predict(
        tagging.fit(x, list(y)).__class__(class_weight="balanced", max_iter=1000, C=10.0), x, y, cv=folds
    )
    return {
        "n": len(rows),
        "classes": len(set(y)),
        "macro_f1_majority": float(f1_score(y, majority, average="macro")),
        "macro_f1_logreg": float(f1_score(y, model, average="macro")),
    }


def simulate_opens(rng: np.random.Generator, n_days: int = 60) -> list[Open]:
    """A made-up user with habits: a few favourite links per part of the day, plus random browsing
    inside one folder per session. This only exercises the evaluation code path."""
    by_folder: dict[str, list[int]] = {}
    for i, b in enumerate(BOOKMARKS):
        by_folder.setdefault(b["folder"] or "Unfiled", []).append(i)
    folders = sorted(by_folder)
    habits = {
        8: rng.choice(len(BOOKMARKS), 3, replace=False),
        14: rng.choice(len(BOOKMARKS), 3, replace=False),
        21: rng.choice(len(BOOKMARKS), 3, replace=False),
    }
    opens = []
    for day in range(n_days):
        for hour, favourites in habits.items():
            ts = day * DAY + hour * 3_600_000
            if rng.random() < 0.8:
                opens.append(Open(BOOKMARKS[int(rng.choice(favourites))]["url"], ts, hour))
            if rng.random() < 0.5:
                folder = folders[int(rng.integers(len(folders)))]
                for n, i in enumerate(rng.choice(by_folder[folder], min(2, len(by_folder[folder])), replace=False)):
                    opens.append(Open(BOOKMARKS[int(i)]["url"], ts + (n + 1) * 2_400_000, hour))
    return sorted(opens, key=lambda o: o.ts)


def eval_recommendations(emb) -> dict:
    opens = simulate_opens(np.random.default_rng(SEED))
    keys = [b["url"] for b in BOOKMARKS]
    index = {k: i for i, k in enumerate(keys)}
    added = [0] * len(keys)
    ranks: dict[str, list[float]] = {"recommender": [], "recent": [], "frequent": []}
    hits: dict[str, list[float]] = {"recommender": [], "recent": [], "frequent": []}
    for n in range(len(opens) // 3, len(opens)):  # first third is warm-up history only
        target, history = opens[n], opens[:n]
        lists = {
            "recommender": [i for i, _, _ in recommend(keys, emb, added, history, target.ts, target.hour)],
            "recent": recent_baseline(keys, history),
            "frequent": frequent_baseline(keys, history),
        }
        for name, top in lists.items():
            rank = top.index(index[target.key]) + 1 if index[target.key] in top else 0
            hits[name].append(1.0 if rank else 0.0)
            ranks[name].append(1 / rank if rank else 0.0)
    return {
        name: {
            "hit_rate@5": float(np.mean(hits[name])),
            "hit_rate@5_ci95": bootstrap_ci(hits[name]),
            "mrr": float(np.mean(ranks[name])),
        }
        for name in hits
    } | {"events": len(opens), "data": "simulated"}


def eval_latency(n: int = 5000) -> dict:
    rng = np.random.default_rng(SEED)
    vocab = sorted({w for b in BOOKMARKS for w in f"{b['title']} {b['description']}".lower().split()})
    texts = [" ".join(rng.choice(vocab, 14)) for _ in range(n)]
    embedder = HashingEmbedder()
    index = SearchIndex(texts, embedder.encode(texts))
    times = []
    for q in QUERIES:
        start = time.perf_counter()
        index.search(q["q"], embedder.encode([q["q"]])[0], "hybrid")
        times.append((time.perf_counter() - start) * 1000)
    return {
        "bookmarks": n,
        "embedder": embedder.name,
        "p50_ms": float(np.percentile(times, 50)),
        "p95_ms": float(np.percentile(times, 95)),
    }


def main() -> None:
    results: dict = {"dataset": {"bookmarks": len(BOOKMARKS), "queries": len(QUERIES)}, "embedders": {}}
    for embedder in embedders():
        emb = embedder.encode([embedding_text(b["title"], b["description"], "") for b in BOOKMARKS])
        results["embedders"][embedder.name] = {
            "search": eval_search(embedder, emb),
            "clustering": eval_clustering(emb),
            "tagging": eval_tagging(emb),
            "recommendations": eval_recommendations(emb),
        }
    results["latency_hybrid_search"] = eval_latency()

    for name, r in results["embedders"].items():
        print(f"== {name} ==")
        print("search          recall@10   MRR")
        for mode, m in r["search"].items():
            lo, hi = m["recall@10_ci95"]
            print(f"  {mode:<12}  {m['recall@10']:.3f} [{lo:.2f}, {hi:.2f}]   {m['mrr']:.3f}")
        c, t = r["clustering"], r["tagging"]
        print(f"clustering      k={c['k_chosen']}  silhouette={c['silhouette']:.3f}")
        print(
            f"tagging         macro-F1 majority={t['macro_f1_majority']:.3f}  logreg={t['macro_f1_logreg']:.3f}  (n={t['n']})"
        )
        print("recommendations (simulated clicks)  hit@5   MRR")
        for who in ("recent", "frequent", "recommender"):
            m = r["recommendations"][who]
            print(f"  {who:<12}  {m['hit_rate@5']:.3f}   {m['mrr']:.3f}")
        print()
    lat = results["latency_hybrid_search"]
    print(
        f"hybrid search latency at {lat['bookmarks']} bookmarks: p50 {lat['p50_ms']:.1f} ms, p95 {lat['p95_ms']:.1f} ms"
    )

    (ROOT / "eval").mkdir(exist_ok=True)
    (ROOT / "eval/results.json").write_text(json.dumps(results, indent=2) + "\n")
    try:
        import mlflow

        mlflow.set_experiment("homebase-eval")
        with mlflow.start_run():
            for name, r in results["embedders"].items():
                tag = name.split("/")[-1].replace("-", "_")
                for mode, m in r["search"].items():
                    mlflow.log_metric(f"{tag}.search.{mode}.recall_at_10", m["recall@10"])
                    mlflow.log_metric(f"{tag}.search.{mode}.mrr", m["mrr"])
                mlflow.log_metric(f"{tag}.tagging.macro_f1", r["tagging"]["macro_f1_logreg"])
                mlflow.log_metric(f"{tag}.recs.hit_rate_at_5", r["recommendations"]["recommender"]["hit_rate@5"])
            mlflow.log_artifact(str(ROOT / "eval/results.json"))
    except ImportError:
        pass


if __name__ == "__main__":
    main()
