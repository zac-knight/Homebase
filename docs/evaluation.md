# Evaluation

Rerun with `cd backend && uv run --extra embeddings python scripts/evaluate.py`. Raw output is
written to `backend/eval/results.json`, which is git-ignored because timings change on every run
(and logged to MLflow when it is installed). The dataset is in `sample-data/`.

## Read this first

These numbers come from a **58-bookmark demo library and 50 queries written by the same person
who wrote the bookmarks' descriptions**. They show the pipeline works and the baselines are wired
correctly. They are not evidence about a real bookmark collection:

- The set is tiny, so the intervals are wide and most differences are within noise.
- Every demo bookmark has a description. A real library only has titles unless page text
  capture is on, and search by meaning is noticeably weaker on titles alone.
- The recommendation numbers use a **simulated** click log.

Replace the dataset with your own labelled queries and real usage before quoting any of this.

## Results (15 Nov 2026)

### Search: 50 queries, recall at 10 and mean reciprocal rank

| Embedder | Method | Recall@10 (95% interval) | MRR |
| --- | --- | --- | --- |
| n/a | Keyword (BM25) | 0.907 (0.82 to 0.98) | 0.900 |
| Hashing baseline | Vector | 0.957 (0.90 to 0.99) | 0.898 |
| Hashing baseline | Hybrid (RRF) | 0.963 (0.91 to 1.00) | 0.932 |
| all-MiniLM-L6-v2 | Vector | 0.993 (0.98 to 1.00) | 1.000 |
| all-MiniLM-L6-v2 | Hybrid (RRF) | 0.993 (0.98 to 1.00) | 0.965 |

Hybrid beats keyword alone, which was the target. But with the real embedding model, **pure
vector search ranked better than hybrid** (MRR 1.000 against 0.965): fusing in BM25 occasionally
pulls a keyword-only match above the right answer. On this set the honest conclusion is that
hybrid is not automatically better; it needs testing on real queries, where exact names and
codes (which favour keywords) are more common than in these paraphrase-style queries.

### Clustering

k-means, with k chosen by silhouette from between √n/2 and √n, picked 8 clusters with MiniLM
(silhouette 0.067) and 7 with the hashing baseline (0.013). Both are low: 58 short texts do not
form tight clusters. The range starts above 2 because silhouette alone preferred two giant
groups, which are useless as folder suggestions.

Informal look at the names, not a structured review: with descriptions the groups are
recognisable ("javascript · web · browser", "cook · dinners · absorption", "index · hash · rank");
with titles only, which is what the server has unless page text capture is on, several are not
("crack · excalidraw · hostelworld").

### Folder suggestions: 52 filed bookmarks, 8 folders, 4-fold cross-validation

| Model | Macro F1 |
| --- | --- |
| Majority class | 0.040 |
| Logistic regression on hashing embeddings | 0.178 |
| Logistic regression on MiniLM embeddings | 0.682 |

Clear improvement over the majority baseline. The spec's fine-tuned transformer comparison and
calibration checks are not done.

### Recommendations: simulated clicks, leave-one-out over the last two thirds of events

| Method | Hit rate@5 | MRR |
| --- | --- | --- |
| Most recent | 0.160 | 0.046 |
| Most frequent | 0.409 | 0.191 |
| Recommender (MiniLM) | 0.413 | 0.286 |

The recommender ranks the right link higher (MRR) but is level with "most frequent" on hit rate.
Since the simulated user was built with time-of-day habits, which is exactly what the recommender
models, this mostly checks the code path. The live A/B comparison in the extension is the real test.

### Performance

| Measure | Result | Target |
| --- | --- | --- |
| Server hybrid search, 5,000 bookmarks, hashing embedder, index cached | p50 0.4 ms, p95 0.4 ms | under 100 ms |
| Local keyword search, 5,000 bookmarks (unit test) | under 100 ms per query | under 100 ms |

The server figure excludes the network and the embedding model's own time to encode the query
(a few milliseconds for MiniLM on CPU). New tab render time has not been measured with a
profiler; the 5,000-bookmark browser test only checks that the DOM stays small and search responds.

### Not measured

Duplicate detection precision and recall (needs a hand-checked sample), Lighthouse accessibility
score (the automated axe audit passes with no violations), live click-through.
