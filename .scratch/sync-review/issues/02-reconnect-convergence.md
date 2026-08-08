# 02 — Reconnect convergence: broadcast state + offline removals

**What to build:** when a Peer comes back online (network returns, Sync re-enabled after
being off, or app open) it pushes its current state to the topic so every Peer converges
to the same List — including changes made while it was offline or while Sync was off.

The reconnecting Peer broadcasts its current Items + Products in one message. The same
message also carries the removals this device made while disconnected — its own
check-offs and plain removals whose `DELETE_ITEM` was never published. Those removals
are remembered locally (a small persistent tombstone set, per List, flushed once the
broadcast succeeds) and cleared on successful broadcast.

Receiving Peers apply the broadcast:
- Items and Products are written idempotently (derived IDs already make re-puts safe).
- Carried removals are applied *after* Items, and a removal is skipped if the incoming
  Items already contain that ID (a re-add before reconnect wins over its own tombstone).
- A check-off removal carries its `deletedAt` so Peers derive the Purchase event too —
  history converges, not just the Item List.

A device whose List is empty on connect does not broadcast (nothing to share) — the
fresh-join `REQUEST_SYNC` for an empty DB stays unchanged. Broadcasts must respect the
relay's size cap via ticket `01`; an oversized catalog shows the "too large" status
instead of failing silently.

**Blocked by:** `01` — Budget & size protection for publishes (the broadcast must be
budget-honest and size-guarded before this ships).

**Status:** ready-for-agent

- [ ] After a reconnect with local state, the Peer publishes one broadcast of current Items + Products; Peers apply it without echoing it back.
- [ ] Items added or edited while offline, or with Sync off, appear on every other Peer after this device reconnects or Sync is re-enabled.
- [ ] Items removed (plain removal or check-off) while offline, or with Sync off, disappear from every other Peer after reconnect, via the removals carried in the broadcast.
- [ ] A check-off carried as a removal includes its `deletedAt`, so other Peers derive the Purchase event and history converges.
- [ ] A removal is applied only if the incoming broadcast's Items don't already contain the same ID (re-add before reconnect wins).
- [ ] A removal's tombstone is cleared once the broadcast succeeds, and does not fire again on later reconnects.
- [ ] A device with an empty List on connect does not broadcast; the fresh-join `REQUEST_SYNC` for an empty DB still works.
- [ ] An oversized broadcast surfaces the "too large" status from ticket `01` rather than failing silently or burning budget.
