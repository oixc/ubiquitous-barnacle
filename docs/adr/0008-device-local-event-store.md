# One device-local event store for adds and purchases

Add-times and purchase-times are two readings of the same signal: both are
device-local, both derive from the shared `PUT_ITEM`/`DELETE_ITEM` stream, both
are cancelled by a single undo, and both must render together in chronological
order in the History view. They therefore live in **one** IndexedDB store,
`events`, replacing `purchaseHistory`. Each record carries a `kind`
(`"add"` | `"purchase"`), its Item's id, the Product, the Detail, and the
timestamp (`createdAt` for an add, `deletedAt` for a check-off).

## Record shape

```
{
  id:      "<list>::add::<itemId>"      // or "<list>::purchase::<itemId>"
  list,    kind,   itemId,   productId,   detail,   at
}
```

The id is derived, not generated, so redelivery is idempotent: an Item is added
once and check-off-deleted once, so `add::<itemId>` / `purchase::<itemId>` each
collide with themselves on the 12h SSE replay and FULL_SYNC re-puts and simply
overwrite. Every Peer observes the same `DELETE_ITEM` (which carries the Item
id), so the ids converge across devices.

## Derivation

- **Add event**: written when an Item that is new to this device is observed —
  a local add, a remote `PUT_ITEM`, or a FULL_SYNC delivery of an unknown Item.
  The timestamp is the Item's `createdAt`, so a fresh-join FULL_SYNC back-fills
  add events without inventing times. Re-puts of an already-known Item (detail
  edits, re-broadcasts) write nothing.
- **Purchase event**: written for every check-off `DELETE_ITEM` (the delete that
  carries a `deletedAt` timestamp; plain trash removals record nothing). The
  timestamp is `deletedAt`.

Neither kind is ever broadcast; the daily sync budget is untouched.

## Undo

The re-add (`PUT_ITEM` for a Product whose most recent purchase is inside the
10-minute Undo window) is the **trigger**, not a fresh add-time event. Matching
is by Product to find that purchase; the purchase is then cancelled and its
paired add event (matched by the purchase's `itemId`) is **kept** — "last added"
shows the last independent add, and an undo re-add records no event itself, so
the timestamp never moves and an on-list Product never reads "never added".
Mistaken check-offs therefore never pollute buy counts or the event-store restock
intervals. The restock stats stored on the Product (ticket 05) are refreshed
only when a purchase is recorded; an undone check-off leaves them as-is until
the next purchase recomputes them from the cleaned event history — a one-interval
self-heal, accepted by design. "Last added" stays truthful. The re-added Item (a
fresh Item id) carries no event until it is itself checked off.

## Consumers

All read one store and filter by `kind`:

- History view: chronological merge of both kinds by `at` (kind badge).
- Catalog stats: `purchase` → buy count / last-bought; `add` → last-added.
- Restock intervals: gaps between consecutive `purchase` events, stored on the
  Product (`restockInterval`/`lastPurchase`) and refreshed only when a purchase
  is recorded (ticket 05).
- Added-together: session grouping over `add` events.
- Backup/restore (format v2): export both kinds; cross-List restore remaps
  `productId` via the Catalog merge and `itemId` by deterministic List-prefix
  swap (`src::item_x` → `dst::item_x`), so re-importing the same file is
  idempotent — the derived event id is the dedup key.

## Considered options

- **Two stores** (`purchaseHistory` + a new add-times store): rejected — every
  consumer must join them, every undo touches two write paths, and the always-
  together History view forces a merge everywhere. The current `purchaseHistory`
  is being reworked anyway (stream-derived, `deletedAt`, undo-cancelled), so
  keeping it untouched buys nothing.
- **A separate add-times store while leaving `purchaseHistory` alone**: rejected
  — see above; the two signals are symmetric in every dimension that matters
  (origin, locality, undo, display, idempotency).
- **Generated event ids**: rejected — a random id at write time is not
  idempotent across the SSE replay, so redelivery would double-count.

## Consequences

IndexedDB schema moves to v5 with stores `items`, `products`, `events`; the
service-worker cache name is bumped when shipped (see AGENTS.md). Backup format
moves to v2 (a single `events` array) — v1 files are not migrated (early
development). This supersedes ADR-0006's Purchase-history handling: the Catalog
merge (spelling-dedupe, existing wins) is unchanged, but history is now a unified
event list.
