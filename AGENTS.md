# AGENTS.md

## What this is
Zero-build PWA: a shared grocery list. `index.html` is markup/shell only; app logic
lives in ES modules under `js/` (loaded via `<script type="module">`), split by
concern: `main.js` (bootstrap, app state, single write path for all mutations),
`db.js` (IndexedDB), `sync.js` (ntfy.sh SSE), `catalog.js` (Product resolution +
Item revive), `ui.js` (rendering + delegated events; never touches DB or network
directly). `sw.js` is the service worker, `manifest.json` the PWA manifest. No
build step, no npm, no tests — keep it that way.

## Status
Early development — no deployed users, no backwards-compatibility guarantees.
Breaking changes (schema, protocol, storage, UI) are expected and welcome; don't
build migration mechanisms.

## Run & verify
- Serve statically, e.g. `pixi run test-server` — service worker and
  IndexedDB don't work from `file://`.
- There are no tests, linters, or typechecks. Verify changes manually in the browser.

## Gotchas
- Sync is off by default (`ENABLE_SYNC` near the top of `js/main.js`, `false`),
  and users can flip it per device via the drawer toggle (persisted in
  `pwa_grocery_sync`). While off, no ntfy.sh network calls happen — the app runs
  local-only. The drawer also shows a per-device "messages sent today" counter.
- Undo is off by default (`ENABLE_UNDO` near the top of `js/main.js`, `false`).
  Set it to `false` to test the event store without Undo classification — every
  re-add then records a plain add event.
- Service worker is cache-first with hardcoded `CACHE_NAME = "grocery-v18"` in `sw.js`.
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
- Backup/restore lives in `js/backup.js` (configured from `main.js`): a single
  versioned JSON file exports a List's Catalog + event history (add and purchase
  events — format v2, see ADR-0008); restoring merges local-only — never
  broadcast — with Products deduped by normalized spelling (existing wins,
  aliases/presets fold in) and events deduped by event key; cross-List restores
  remap IDs (see ADR-0006, ADR-0008).
  Caveat: restoring into an empty DB before the first Sync connection suppresses
  the automatic fresh-join catch-up pull, so hit the drawer's Refresh afterwards
  to still fetch live Items/Products from Peers.
- IndexedDB is `GroceryDB` (version bumps freely in early development, currently
  v5): `items`, `products`, and `events` stores, each with a `byList` index —
  `events` (ADR-0008) is the device-local add/purchase history replacing the old
  `purchaseHistory` store. Item/Product/event IDs are prefixed with the List name
  (`${listName}::…`) so one DB can hold several Lists without cross-talk; on List
  switch, reads are scoped by `listName` and nothing carries over.
- Tailwind comes from the CDN (`cdn.tailwindcss.com`), not a build pipeline.
  The app is dark-mode only (slate-950 base); there is no theme switcher and no
  `dark:` variant usage. Don't reintroduce a light theme or a toggle.
- Domain vocabulary lives in `CONTEXT.md`, architectural decisions in `docs/adr/`.
  Use that language in code and discussions. The bought shelf and Clearing are
  gone: checking off removes the Item and records a Purchase (ADR-0007), and the
  device-local `events` store derives add/purchase history from the message
  stream with a 10-minute Undo (ADR-0008). Suggestion ranking is soft-priority
  (issues 05, 09, 11): fresh check-offs during a trip (60-minute window) top the
  strip, restock-due prompts fill in, and an add briefly pivots the strip to its
  added-together companions (≥3 co-occurring sessions, 30-minute session gap).
  Catalog merge on import is
  decided (spelling-dedupe, existing wins — see ADR-0006), while general
  peer-meeting reconciliation of duplicate Products remains undecided (see
  ADR-0003).

## Agent skills

### Issue tracker

Issues live as markdown tickets under `.scratch/<feature-slug>/issues/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
