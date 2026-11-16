# Threat model

A short account of what data exists, where it lives and who can see it.

## Data

| Data | Where | Leaves the device? |
| --- | --- | --- |
| Bookmarks (title, URL, folder, date) | Chrome; mirrored on the server if sync is on | Only with sync on |
| Usage log (links opened, searches typed, time) | `chrome.storage.local`; server if sync is on | Only with sync on |
| Settings, favourites, card order | `chrome.storage.local` | No |
| Appearance choices and your background picture | `localStorage` of the extension page | No |
| Captured page text | `chrome.storage.local`; server if sync is on | Only with capture **and** sync on |
| Browsing history (optional) | Read in the page, never stored | Never |
| Embeddings | Server database | Derived on the server |
| Sign-in tokens | `chrome.storage.local` | Sent to your server only |

With sync off the extension makes no network requests at all: favicons come from Chrome's local
cache and the demo library is bundled.

## Who can see what

- **Other websites:** nothing. The extension has no content script running on pages; page text
  capture injects one function into the single tab you just bookmarked, and only if enabled.
- **The server operator:** everything synced for every account. Run your own server if that matters.
- **Other users of the same server:** nothing. Every query filters on the authenticated user ID,
  and a test asserts one user cannot read, search, export or delete another's data.
- **Third-party AI services:** nothing. Embeddings are computed by a local model and answers are
  extractive. If a hosted model is ever added it must be opt in.

## Controls in place

- Short-lived access tokens (15 minutes) with a refresh token; Google ID tokens are verified
  against the configured client ID. No passwords are stored.
- Secrets come from environment variables; `.env` is git-ignored.
- CORS only allows Chrome extension origins and localhost.
- The crawler refuses loopback, private and link-local addresses and re-checks every redirect hop.
- Request sizes are bounded by schema limits.
- Export returns everything held about you; delete removes the account, bookmarks, events and vectors.

## Known gaps

- **Tokens in `chrome.storage.local` are not encrypted**, and neither is the usage log. Anything
  with access to your Chrome profile can read them.
- **Encryption in transit and at rest is the deployment's job**: put the API behind HTTPS and use
  an encrypted database volume. The local dev setup uses plain HTTP.
- **Refresh tokens cannot be revoked individually**; rotating `HOMEBASE_JWT_SECRET` signs everyone out.
- **No rate limiting** on any endpoint.
- **Development sign in (`HOMEBASE_DEV_AUTH`) lets anyone sign in as any email.** It is off by
  default and must stay off on any reachable server.
- **The crawler's address check is subject to DNS rebinding** (the name is resolved once for the
  check and again for the request).
- Search queries you type are logged locally and synced. Turn sync off if that is too much.
