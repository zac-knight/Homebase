# Status

Last updated 17 Nov 2026.

## Verified by running it

- **Extension:** 20 unit tests; 36 browser tests in demo mode (keyboard-only search and
  reordering, removing a bookmark and undoing it, appearance settings, a background picture, an
  axe accessibility audit of every view and of all 17 colour themes in light and dark, a
  5,000-bookmark run); one test that loads the built extension into real Chromium and checks the
  service worker, new tab override, live bookmark updates, favicons, storage, and that remove and
  undo really delete and restore a Chrome bookmark.
- **Backend:** 36 tests covering sign in, idempotent sync, per-user isolation, search, answer
  grounding, clustering, tagging, recommendations, stats, link checks, export and delete.
- **Full stack:** a browser test signs in to a running API, syncs, searches by meaning, asks a
  question (`extension/e2e/live.spec.ts`, skipped unless `HOMEBASE_API` is set).
- **Evaluation and analysis scripts** run end to end.

## Changed since the last review

- The extension's **Organise** page, the **Right now** row and the Insights card that tested it
  were removed. The server endpoints and the recommender code behind them still exist and are
  still tested, but nothing in the extension shows them.
- The new tab page was rebuilt around folder tabs, and a **Tasks** page and animated waves were
  added. Their behaviour is covered by the browser tests; the waves were checked in screenshots
  and a short recording only.

## Written but not yet run

- **Custom accent colours are not contrast-checked.** The 17 themes are audited; a colour you
  pick yourself can make accent-coloured text hard to read. The same goes for text over a busy
  background picture, although a veil of the page colour is laid over it.
- **Animations were not reviewed in motion,** only as settled screenshots and through tests.

- **PostgreSQL + pgvector.** All runs so far used SQLite, where vectors are stored as JSON and
  compared in NumPy. The pgvector column and `<=>` query exist, and CI is configured to run the
  whole suite against `pgvector/pgvector:pg16`.
- **Docker, GitHub Actions, Fly.io deploy, Dependabot.**
- **Google sign in.** Needs an OAuth client ID; development sign in (email only) was used.
- **The link checker against a real library.** It was run against a single real site and with a
  stubbed fetcher in tests, not across hundreds of bookmarks.
- **Page text capture and the browsing-history option** in a real browser session (they need
  permission prompts). Without captured page text the server only knows titles, which limits
  search by meaning.

## Not built

- Fine-tuned transformer for tagging, calibration checks.
- Learning-to-rank or contextual bandit recommender.
- MinHash duplicates, drift monitoring, in-browser models, language detection.
- UMAP is optional and untested; HDBSCAN is wired but k-means is the default.
- Generative answers: the assistant is extractive (it quotes sentences), so no bookmark text is
  sent to a third-party model.
- Lighthouse score, Chrome Web Store listing, demo video, Firefox and Edge ports.
- A licence file: choose one before publishing.
