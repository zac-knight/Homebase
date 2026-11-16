# Design decisions and trade-offs

**Bookmarks are identified by canonical URL, not Chrome's ID.**
Chrome IDs differ on every device, so the server keys each bookmark on its cleaned URL. Sync
becomes an idempotent upsert that is safe to retry. The cost: the same page saved in two folders
is one row on the server.

**Sync sends a diff against a local snapshot, not a change log.**
Any amount of offline editing reconciles in one request, and a failed request changes nothing
because the snapshot only advances on success.

**Homebase only changes your bookmarks when you tell it to.**
The one write it makes is deleting a bookmark when you press its remove button, with an undo that
restores it to the same folder and position. It never moves, renames or files anything by
itself: Chrome already syncs bookmarks between devices, the server is a read-only mirror for
analysis, and suggested folders stay suggestions.

**Appearance is CSS variables and data attributes, nothing more.**
Themes set colour tokens on `<html>`; backgrounds, card styles, corners, typefaces and motion are
attributes that the stylesheet keys off. Components do not know which theme is active, so adding a
theme is one line in `lib/themes.ts`. The choices are mirrored in `localStorage` so the right look
is applied before first paint.

**Two recommenders.**
The new tab page uses a local one with no embeddings, so it is instant and private. The server
has an embedding-based one that is evaluated offline before it is trusted.

**Baselines first.**
A dependency-free hashing embedder runs in tests and CI, and doubles as the baseline the real
model has to beat. The same goes for "most recent" and "most frequent" against the recommender.

**One database.**
PostgreSQL with pgvector holds relational data and vectors, which avoids running and syncing a
separate vector store. SQLite with in-memory vectors stands in for local development.

**Extractive answers.**
Quoting sentences is less fluent than a language model but cannot invent anything and sends
nothing to a third party.

**Minimal permissions.**
Reading pages, browsing history and identity are optional permissions, requested only when the
matching feature is switched on, even though asking for everything up front would be simpler.
