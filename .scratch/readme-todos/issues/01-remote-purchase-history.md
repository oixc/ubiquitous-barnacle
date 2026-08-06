# 01 — Remote purchases land in local Purchase history

**What to build:** When a Peer buys an Item, every Peer's local Purchase history records the purchase — so the History view and everything that reads it (suggestions, purchase-order model) stay complete even when the buy happened on another device. Bought Items must carry their purchase time (`boughtAt`) so receiving Peers know when the buy happened, and recording must be idempotent so SSE replays and FULL_SYNC never double-count a single purchase.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Toggling an Item bought locally records exactly one Purchase-history entry, and the broadcast PUT_ITEM carries the purchase time.
- [ ] A remote PUT_ITEM for a bought Item records a Purchase-history entry with the remote buyer's timestamp on the receiving Peer.
- [ ] Re-delivery of the same purchase (12h SSE replay, FULL_SYNC) does not create duplicates — dedupe by (productId, boughtAt, detail), the identity Backup already uses.
- [ ] Reviving an Item back to to-buy leaves its recorded history intact; CLEAR_BOUGHT and DELETE_ITEM never erase history.
