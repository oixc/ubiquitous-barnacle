# 01 — Check-offs and undos land in every Peer's local Purchase history

**What to build:** Every device derives its own local Purchase history from the
shared message stream, with no dedicated history messages. A `DELETE_ITEM` that
carries a `deletedAt` timestamp (a check-off) records a Purchase entry locally;
a later `PUT_ITEM` for the same Product within the 10-minute undo window
classifies as an Undo and removes the matching entry. Recording is idempotent —
the 12h SSE replay and FULL_SYNC never double-count — via dedupe by
(productId, deletedAt, detail). See ADR-0007.

**Blocked by:** 07 — Wire changes.

**Status:** ready-for-agent

- [ ] A check-off `DELETE_ITEM` (with `deletedAt`) records exactly one Purchase-history entry on the receiving device.
- [ ] An observed `PUT_ITEM` for the same Product within 10 minutes of its most recent check-off removes that matching Purchase entry (undo).
- [ ] A later re-check-off records a fresh Purchase; genuine double-buys undercount by one by design.
- [ ] Re-delivery of the same events (12h SSE replay, FULL_SYNC) does not duplicate or double-remove entries.
- [ ] Own and remote check-offs record identically; two Peers on the same stream converge to the same history.
