<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.svg">
    <img src="docs/assets/banner-light.svg" alt="Homebase: an intelligent bookmark hub for your new tab page" width="100%">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/zac-knight/Homebase/actions/workflows/ci.yml"><img src="https://github.com/zac-knight/Homebase/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <img src="https://img.shields.io/badge/Chrome-Manifest%20V3-0f6b5c" alt="Chrome Manifest V3">
  <img src="https://img.shields.io/badge/TypeScript-React%20%C2%B7%20Vite%20%C2%B7%20Tailwind-2a78d6" alt="TypeScript, React, Vite, Tailwind">
  <img src="https://img.shields.io/badge/Python-FastAPI%20%C2%B7%20pgvector-2a78d6" alt="Python, FastAPI, pgvector">
  <img src="https://img.shields.io/badge/privacy-local%20first-0f6b5c" alt="Local first">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#features">Features</a> ·
  <a href="#how-it-fits-together">Architecture</a> ·
  <a href="docs/evaluation.md">Evaluation</a> ·
  <a href="docs/status.md">Status</a> ·
  <a href="docs/threat-model.md">Privacy</a>
</p>

<br>

Homebase replaces Chrome's new tab page with a clean, searchable home for your bookmarks: your
folders as tabs, your favourites one click away, a to-do list for the day and slow waves drifting
along the bottom. An optional server adds search by meaning and answers drawn only from what you
have saved.

It works fully offline. Nothing leaves your browser unless you turn sync on.

<p align="center">
  <img src="docs/assets/screenshots/demo.gif" alt="Animated tour: switching between folders, searching, adding and completing a task" width="86%">
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshots/home-dark.png">
    <img src="docs/assets/screenshots/home.png" alt="The Homebase new tab page: greeting, search bar, favourites, folder tabs and the links of the open folder" width="92%">
  </picture>
</p>

<table>
  <tr>
    <td width="50%"><img src="docs/assets/screenshots/search.png" alt="Search palette showing results found by meaning and an answer with sources"></td>
    <td width="50%"><img src="docs/assets/screenshots/tasks.png" alt="Tasks page: a to-do list ordered by due date, with an overdue task and a done list"></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Search and grounded answers</b><br>Every line cites the bookmark it came from</sub></td>
    <td align="center"><sub><b>Tasks</b><br>Soonest due first, overdue ones flagged, kept on your device</sub></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="docs/assets/screenshots/insights.png" alt="Insights dashboard with activity charts, a weekly digest and link health from the server" width="62%"></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><sub><b>Insights</b><br>Usage charts, intervals instead of bare averages, a weekly digest, link health when synced</sub></td>
  </tr>
</table>

### Make it yours

Seventeen colour themes in light and dark, any accent colour, eight backgrounds (including your
own picture) with optional animated waves, glass, solid or outline cards, five typefaces, three
corner styles, adjustable spacing, eight one-click looks, and animations you can turn up, down or
off.

<table>
  <tr>
    <td width="33%"><img src="docs/assets/screenshots/theme-neon.png" alt="Neon theme with an aurora background, glass cards, a clock and rounded type"></td>
    <td width="33%"><img src="docs/assets/screenshots/theme-ocean.png" alt="Ocean theme with a gradient background and glass cards"></td>
    <td width="33%"><img src="docs/assets/screenshots/theme-sunset.png" alt="Sunset theme in dark mode with dots, outline cards, sharp corners and monospace type"></td>
  </tr>
  <tr>
    <td align="center"><sub>Neon · aurora · glass · clock</sub></td>
    <td align="center"><sub>Ocean · gradient · glass</sub></td>
    <td align="center"><sub>Sunset · dots · outline · mono · compact</sub></td>
  </tr>
  <tr>
    <td width="33%"><img src="docs/assets/screenshots/theme-blossom.png" alt="Blossom look: light rose theme with an aurora background and editorial type"></td>
    <td width="33%"><img src="docs/assets/screenshots/theme-stargazer.png" alt="Stargazer look: dark purple theme with a starfield background"></td>
    <td width="33%"><img src="docs/assets/screenshots/theme-teahouse.png" alt="Tea house look: light green theme with dots, outline cards and sharp corners"></td>
  </tr>
  <tr>
    <td align="center"><sub>Blossom · aurora · glass · editorial</sub></td>
    <td align="center"><sub>Stargazer · stars · glass · rounded</sub></td>
    <td align="center"><sub>Tea house · dots · outline · sharp</sub></td>
  </tr>
</table>

## Quick start

**Extension only** (no server needed)

```bash
make setup build        # or: cd extension && npm install && npm run build
```

Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and pick
`extension/dist`. Open a new tab.

No install? `make dev` serves the same page in a normal browser tab with a sample library.

**With the server**

```bash
make api                # SQLite, development sign in, http://localhost:8000/docs
```

Then in the extension: **Settings → Sync with a Homebase server**, and sign in. For PostgreSQL
with pgvector, run `docker compose up --build` instead.

## Features

<table>
  <tr>
    <th width="33%">In the browser</th>
    <th width="33%">With the server</th>
    <th width="33%">Under your control</th>
  </tr>
  <tr valign="top">
    <td>
      <b>Folder tabs</b> with the links of the open folder below, pinned favourites, drag and drop, and one-click remove with undo<br><br>
      <b>Tasks</b>: a to-do list with due dates, kept on your device<br><br>
      <b>Command palette</b> on <kbd>⌘K</kbd>, <kbd>Ctrl K</kbd> or <kbd>/</kbd>, tolerant of typos<br><br>
      <b>Looks</b>: themes, backgrounds, animated waves, card styles, typefaces and animations<br><br>
      <b>Insights</b> on what you use and ignore, including exact duplicates<br><br>
      <b>One screen</b>: the home page fits the window, so there is nothing to scroll
    </td>
    <td>
      <b>Search by meaning</b>: embeddings and BM25, fused by rank<br><br>
      <b>Ask your bookmarks</b>: quoted answers with sources, or an honest “nothing relevant”<br><br>
      <b>Link health</b>: finds dead links, shown in Insights<br><br>
      <b>Suggested folders and topic groups</b> from clustering, available from the API (the extension no longer has a page for them)
    </td>
    <td>
      <b>Local first</b>: sync is off until you turn it on<br><br>
      <b>Minimal permissions</b>: page reading, history and identity are requested only when used<br><br>
      <b>Export everything</b> in one click<br><br>
      <b>Delete everything</b> in one click, vectors included
    </td>
  </tr>
</table>

## How it fits together

```mermaid
flowchart LR
  subgraph ext[Chrome extension]
    api_c[Chrome APIs<br/>bookmarks · storage · favicons · alarms] --> sw[Service worker<br/>sync · link-check schedule · page text]
    api_c --> tab[New tab page<br/>React · local search · local recommender]
  end
  subgraph srv[Backend service]
    rest[REST API<br/>FastAPI · sign in · sync] --> pg[(PostgreSQL + pgvector<br/>bookmarks · events · embeddings)]
    crawl[Crawler<br/>link health · page text] --> pg
  end
  subgraph ml[Data and ML]
    pipe[Pipeline<br/>canonicalise · features · Parquet] --> models[Models<br/>search · clusters · tagging · recommender · Q&A]
    pipe --> evals[Evaluation<br/>baselines and metrics]
  end
  sw -- changed bookmarks and events --> rest
  pg --> pipe
  models --> rest
  rest -- search · answers · suggestions --> tab
```

## Repository map

```
Homebase
├── extension/          Chrome extension (TypeScript, React, Vite, Tailwind)
│   ├── src/lib/          search, recommender, stats, sync, themes, the one chrome.* wrapper
│   ├── src/components/   home view, search palette, Tasks, Insights, Settings, Appearance, Waves
│   ├── src/background/   Manifest V3 service worker
│   └── e2e/              Playwright: UI, accessibility, real extension, live server
├── backend/            API and ML (Python, FastAPI)
│   ├── app/api/          one router per area: login, sync, search, organise, insights, jobs, account
│   ├── app/ml/           embeddings, BM25 + rank fusion, clustering, tagging, recommender, Q&A
│   ├── app/pipeline/     URL cleaning, feature engineering, statistics
│   ├── scripts/          evaluate.py, export_parquet.py
│   └── tests/
├── analysis/           Reproducible usage notebook over the Parquet export
├── sample-data/        Made-up bookmarks and labelled queries, safe to publish
├── docs/               Evaluation, status, design decisions, threat model
└── Makefile            setup · dev · api · build · lint · test · e2e · eval · check
```

Your own exports go in `data/`, which is git-ignored along with secrets, local databases and
build output. See [`.gitignore`](.gitignore).

## Status

> [!NOTE]
> The extension, API, evaluation and analysis all run and are covered by tests (20 unit, 36 API,
> 37 browser). **PostgreSQL with pgvector, Docker, the CI workflow, the Fly.io deploy and Google
> sign in are written but have not been run yet**: development so far used SQLite and an
> email-only sign in. Full list in [docs/status.md](docs/status.md).

Evaluation numbers are from a small demo dataset and should be read as a smoke test. On it,
hybrid search beat keyword search, but plain vector search beat both.
Details in [docs/evaluation.md](docs/evaluation.md).

## Documentation

| | |
| --- | --- |
| [Evaluation](docs/evaluation.md) | Every ML feature against its baseline, with caveats |
| [Status](docs/status.md) | What is verified, what is untested, what is not built |
| [Design decisions](docs/decisions.md) | The trade-offs worth explaining |
| [Threat model](docs/threat-model.md) | What data exists, where it lives, who can see it |
| [Extension](extension/README.md) · [Backend](backend/README.md) | Working on each half |
