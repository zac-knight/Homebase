# Extension

Manifest V3 extension built with TypeScript, React, Vite and Tailwind.

```bash
npm install
npm run dev        # demo mode in a normal tab, sample library from ../sample-data
npm run build      # output in dist/, load it unpacked at chrome://extensions
npm run lint && npm run typecheck && npm test
npm run e2e        # Playwright against the build (run `npm run build` first)
```

| Path | What lives there |
| --- | --- |
| `src/lib/platform.ts` | The only wrapper around `chrome.bookmarks` and `chrome.storage`; serves demo data outside the extension |
| `src/lib/` | Search, recommender, stats, sync diff, API client, URL canonicalisation (mirrors the backend's) |
| `src/components/` | Home view, search palette, Tasks, Insights, Settings, Appearance, Waves |
| `src/lib/themes.ts`, `theme.ts`, `index.css` | Colour themes, and how a look is applied (CSS variables and data attributes) |
| `src/background/` | Service worker: sync scheduling, link-check requests, page text capture |
| `src/content/` | The function injected into a page to read its text (opt in) |
| `public/manifest.json` | Permissions: four always on, the rest optional |
| `e2e/` | `newtab` (demo UI and accessibility), `extension` (real Chromium), `live` (needs `HOMEBASE_API`) |

Append `?n=5000` to the dev URL to pad the library for performance testing.

## Refreshing the README pictures

The pictures come from the demo library, so nothing private can end up in them.

```bash
npm run build
HOMEBASE_SHOTS=../docs/assets/screenshots npm run e2e -- screenshots   # home, tasks, themes, demo.gif (needs ffmpeg)
```

The search and insights pictures need a running server; see the comment at the top of
`e2e/live.spec.ts`.
