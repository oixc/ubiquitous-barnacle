# AGENTS.md

## What this is
Zero-build, single-file PWA: a shared grocery list. All app logic (IndexedDB storage,
ntfy.sh SSE sync, UI rendering) lives in one inline `<script>` in `index.html`.
`sw.js` is the service worker, `manifest.json` the PWA manifest. No build step, no
npm, no tests — keep it that way.

## Run & verify
- Serve statically, e.g. `python3 -m http.server 8000` — service worker and
  IndexedDB don't work from `file://`.
- There are no tests, linters, or typechecks. Verify changes manually in the browser.

## Gotchas
- `DISABLE_SYNC` flag near the top of the script in `index.html` is currently `true`
  (dev mode). While true, no ntfy.sh network calls happen. Set to `false` to test sync.
- Service worker is cache-first with hardcoded `CACHE_NAME = "grocery-v1"` in `sw.js`.
  Bump the version when shipping changes, or installed clients keep stale assets.
  ntfy.sh requests deliberately bypass the cache.
- Sync protocol: ntfy.sh topic == room name (from `#room=` URL hash, else
  localStorage `pwa_grocery_room`, else generated). Actions: `PUT_ITEM`,
  `DELETE_ITEM`, `REQUEST_SYNC`, `FULL_SYNC`; own messages filtered via `SENDER_ID`.
  Rooms have no auth — anyone who knows the topic can read/write.
- Tailwind comes from the CDN (`cdn.tailwindcss.com`), not a build pipeline.
- Domain vocabulary lives in `CONTEXT.md`, architectural decisions in `docs/adr/`.
  Use that language in code and discussions; note the model is ahead of the code
  (Catalog, Products, clearing, and revival are not implemented yet).
