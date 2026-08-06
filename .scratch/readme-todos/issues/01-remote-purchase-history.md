# 01 — Every Peer derives the same local event history (adds + purchases) from the shared stream

**What to build:** The device-local event store replaces `purchaseHistory`: every
device derives add and purchase events from the shared message stream, with no
dedicated history messages. A new `PUT_ITEM` (an Item this device hasn't seen)
records an `add` event from its `createdAt`; a `DELETE_ITEM` that carries a
`deletedAt` timestamp (a check-off) records a `purchase` event from `deletedAt`;
a later `PUT_ITEM` for the same Product within the 10-minute undo window
classifies as an Undo and removes the most recent matching purchase event while
keeping its paired add event (matched by Item id) as the last independent add.
Recording is idempotent — the 12h SSE
replay and FULL_SYNC never double-count — via derived event ids
(`add::<itemId>`, `purchase::<itemId>`). See ADR-0008.

**Blocked by:** 07 — Wire changes.

**Status:** ready-for-agent

- [x] A new `PUT_ITEM` records exactly one `add` event (from `createdAt`); re-puts of an already-known Item record nothing.
- [x] A check-off `DELETE_ITEM` (with `deletedAt`) records exactly one `purchase` event on the receiving device; plain removals record none.
- [x] A `PUT_ITEM` for the same Product within 10 minutes of its most recent check-off (an Undo) removes that matching `purchase` event and keeps its paired `add` event (the last independent add); the re-add records nothing itself.
- [x] A later re-check-off records a fresh `purchase` event; genuine double-buys undercount by one by design.
- [ ] Re-delivery of the same events (12h SSE replay, FULL_SYNC) does not duplicate or double-remove records.
- [ ] Own and remote events record identically; two Peers on the same stream converge to the same history.
- [x] `purchaseHistory` store is replaced by the `events` store; DB schema version and `CACHE_NAME` bumped.
