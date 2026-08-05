# AGENTS.md

## What this is
Zero-build PWA: a shared grocery list. `index.html` is markup/shell only; app logic
lives in ES modules under `js/` (loaded via `<script type="module">`), split by
concern: `main.js` (bootstrap, app state, single write path for all mutations),
`db.js` (IndexedDB), `sync.js` (ntfy.sh SSE), `catalog.js` (Product resolution +
Item revive), `ui.js` (rendering + delegated events; never touches DB or network
directly). `sw.js` is the service worker, `manifest.json` the PWA manifest. No
build step, no npm, no tests — keep it that way.

## Run & verify
- Serve statically, e.g. `pixi run test-server` — service worker and
  IndexedDB don't work from `file://`.
- There are no tests, linters, or typechecks. Verify changes manually in the browser.

## Gotchas
- Sync is on by default (`ENABLE_SYNC` near the top of `js/main.js`, `true`),
  and users can flip it per device via the drawer toggle (persisted in
  `pwa_grocery_sync`). While off, no ntfy.sh network calls happen — the app runs
  local-only. The drawer also shows a per-device "messages sent today" counter.
- Service worker is cache-first with hardcoded `CACHE_NAME = "grocery-v16"` in `sw.js`.
  Bump the version AND add any new `js/*.js` file to `ASSETS` when shipping changes,
  or installed clients keep stale assets. ntfy.sh requests deliberately bypass the
  cache.
- Sync protocol: ntfy.sh topic == List name (from `#list=` URL hash, else
  localStorage `pwa_grocery_list`, else generated). Actions: `PUT_ITEM`,
  `DELETE_ITEM`, `PUT_PRODUCT`, `DELETE_PRODUCT`, `CLEAR_BOUGHT`,
  `REQUEST_SYNC`, `FULL_SYNC` (sends `{items, products}`); own messages
  filtered via `PEER_ID`/`peerId`. Lists have no auth — anyone who knows the
  topic can read/write. `CLEAR_BOUGHT` carries no payload: each Peer removes
  its own bought Items. Purchase history is device-local (never synced). Items
  carry a `bought` boolean field.
- Sync is budget-conscious (ntfy.sh free tier: 250 messages/day per IP).
  `PUT_ITEM` always carries its Product (aliases + presets) so Product creation,
  alias-confirm, and preset-learning ride along instead of separate `PUT_PRODUCT`
  messages. Standalone `PUT_PRODUCT` is only broadcast for product-only edits
  (rename, delete, delete-preset, alias-confirm when the Product is already a
  to-buy Item). Catch-up is on-demand: `REQUEST_SYNC` fires only on a fresh join
  (empty local DB) or the drawer's Refresh action; steady-state reconnects rely on
  the free `since=12h` SSE replay. A 429 publish sets the status pill to
  "Sync limited" until the next success or midnight UTC.
- IndexedDB is `GroceryDB` v3: `items`, `products`, and `purchaseHistory` stores,
  each with a `byList` index. Item/Product IDs are prefixed with the List name
  (`${listName}::…`) so one DB can hold several Lists without cross-talk; on List
  switch, reads are scoped by `listName` and nothing carries over.
- Tailwind comes from the CDN (`cdn.tailwindcss.com`), not a build pipeline.
  The app is dark-mode only (slate-950 base); there is no theme switcher and no
  `dark:` variant usage. Don't reintroduce a light theme or a toggle.
- Domain vocabulary lives in `CONTEXT.md`, architectural decisions in `docs/adr/`.
  Use that language in code and discussions. Note: Clearing and the
  Purchase-history record (boughtAt timestamp per buy, device-local) are
  implemented; Catalog merge semantics remain undecided (see ADR-0003).
