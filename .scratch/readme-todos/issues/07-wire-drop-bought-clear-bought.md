# 07 — Wire: Items drop `bought`, CLEAR_BOUGHT removed, DELETE_ITEM carries a snapshot

**What to build:** The sync protocol matches the check-off model (ADR-0007).
Items no longer carry a `bought` field (FULL_SYNC, PUT_ITEM, and the local store
all drop it); the `CLEAR_BOUGHT` action is removed from sync.js and main.js; and
`DELETE_ITEM` now carries the Item snapshot `{id, productId, detail, deletedAt}`
— `deletedAt` present only when the delete is a check-off (buy), absent for plain
removals. `PUT_ITEM` keeps its `createdAt`. DB schema version and the
service-worker cache name are bumped per the repo's gotchas.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Items in db.js lose the `bought` field; schema version bumped.
- [ ] `CLEAR_BOUGHT` handling removed from sync.js and main.js.
- [ ] `DELETE_ITEM` broadcasts carry `{id, productId, detail, deletedAt?}`; check-offs include the timestamp, removals omit it.
- [ ] `CACHE_NAME` bumped in sw.js.
