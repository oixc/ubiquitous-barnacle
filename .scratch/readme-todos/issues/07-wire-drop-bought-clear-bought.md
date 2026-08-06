# 07 — Wire: Items drop `bought`, CLEAR_BOUGHT removed, DELETE_ITEM carries a snapshot

**What to build:** The sync protocol matches the check-off model (ADR-0007).
Items no longer carry a `bought` field (FULL_SYNC, PUT_ITEM, and the local store
all drop it); the `CLEAR_BOUGHT` action is removed from sync.js and main.js; and
`DELETE_ITEM` now carries the Item snapshot `{id, productId, detail, deletedAt}`
— `deletedAt` present only when the delete is a check-off (buy), absent for plain
removals. `PUT_ITEM` keeps its `createdAt`. The service-worker cache name is
bumped per the repo's gotchas. The DB schema stays at v4 in M1 — dropping
`bought` is a record-field change, not a schema change; the single v5 bump ships
with M2's `events` store (issue 01).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] Items lose the `bought` field (FULL_SYNC, PUT_ITEM, and the local store).
- [x] `CLEAR_BOUGHT` handling removed from sync.js and main.js.
- [x] `DELETE_ITEM` broadcasts carry `{id, productId, detail, deletedAt?}`; check-offs include the timestamp, removals omit it.
- [x] `CACHE_NAME` bumped in sw.js.
- [x] DB schema bump deferred to M2's v5 (`events` store, issue 01).
