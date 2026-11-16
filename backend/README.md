# Backend

FastAPI service with the data pipeline and ML code in the same language.

```bash
uv sync                          # add --extra embeddings for the real model (PyTorch)
HOMEBASE_DEV_AUTH=true uv run uvicorn app.main:app --reload     # http://localhost:8000/docs
uv run ruff check . && uv run pytest
uv run --extra embeddings python scripts/evaluate.py
```

Configuration is by environment variable; see `.env.example`. Without `HOMEBASE_DATABASE_URL`
it uses a local SQLite file. Without the `embeddings` extra it falls back to a hashing embedder.

| Path | What lives there |
| --- | --- |
| `app/api/` | One router per area: `login`, `sync`, `search`, `organise`, `insights`, `jobs`, `account` |
| `app/ml/` | Embeddings, BM25 and rank fusion, clustering, tagging, duplicates, recommender, Q&A |
| `app/pipeline/` | URL canonicalisation, feature engineering, confidence intervals |
| `app/services.py` | Embedding refresh and the per-user search index cache |
| `app/crawler.py` | Link checks and page text extraction, with an SSRF guard |
| `scripts/evaluate.py` | Every ML feature against its baseline; writes `eval/results.json` (git-ignored) |
| `scripts/export_parquet.py` | Database to Parquet for `../analysis` |

Analysis:

```bash
uv run --extra data python scripts/export_parquet.py --email you@example.com --out ../data
uv run --extra data python ../analysis/usage_analysis.py ../data
```
