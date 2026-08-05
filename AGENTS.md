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
- Service worker is cache-first with hardcoded `CACHE_NAME = "grocery-v4"` in `sw.js`.
  Bump the version when shipping changes, or installed clients keep stale assets.
  ntfy.sh requests deliberately bypass the cache.
- Sync protocol: ntfy.sh topic == List name (from `#list=` URL hash, else
  localStorage `pwa_grocery_list`, else generated). Actions: `PUT_ITEM`,
  `DELETE_ITEM`, `PUT_PRODUCT`, `DELETE_PRODUCT`, `CLEAR_BOUGHT`,
  `REQUEST_SYNC`, `FULL_SYNC` (sends `{items, products}`); own messages
  filtered via `PEER_ID`/`peerId`. Lists have no auth — anyone who knows the
  topic can read/write. `CLEAR_BOUGHT` carries no payload: each Peer removes
  its own bought Items. Purchase history is device-local (never synced). Items
  carry a `bought` boolean field.
- IndexedDB is `GroceryDB` v3: `items`, `products`, and `purchaseHistory` stores,
  each with a `byList` index. Item/Product IDs are prefixed with the List name
  (`${listName}::…`) so one DB can hold several Lists without cross-talk; on List
  switch, reads are scoped by `listName` and nothing carries over.
- Tailwind comes from the CDN (`cdn.tailwindcss.com`), not a build pipeline.
- Domain vocabulary lives in `CONTEXT.md`, architectural decisions in `docs/adr/`.
  Use that language in code and discussions. Note: Clearing and the
  Purchase-history record (boughtAt timestamp per buy, device-local) are
  implemented; Catalog merge semantics remain undecided (see ADR-0003).
