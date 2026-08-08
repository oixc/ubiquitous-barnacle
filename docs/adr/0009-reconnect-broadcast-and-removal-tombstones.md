# Reconnect broadcast with removal tombstones

The `since=12h` SSE replay pulls what a Peer missed while away, but nothing
pushes what it did while offline — or with Sync toggled off. The response is a
**reconnect broadcast**: on every SSE connect where the device already holds
state, it publishes its current Items + Products in one message, plus the
removals it made while disconnected. Receiving Peers merge and converge.

## Broadcast

On `onopen` with local state — Items, Products, or pending removals — the device
publishes one `STATE_SYNC` message:

```
{ type: "STATE_SYNC", items, products, removals }
```

A device with an empty List and no removals does not broadcast; it keeps the
fresh-join `REQUEST_SYNC`/`FULL_SYNC` path unchanged. The broadcast is throttled
to one per 60s unless removal tombstones are pending (a flapping SSE connection
must not burn the daily budget); pending tombstones always retry.

## Removal tombstones

A local check-off or plain removal whose `DELETE_ITEM` never reached Peers —
Sync off, offline, rate-limited, or rejected — is remembered as a tombstone in
the `tombstones` store (`{id, list, productId, detail, deletedAt?}`). Tombstones
flush once the reconnect broadcast publishes OK, so they do not fire again on
later reconnects.

## Merge

Receiving Peers apply the broadcast without echoing it (the wire face never
re-broadcasts):

1. Products, then Items — idempotent re-puts via derived IDs.
2. Removals, after Items. A removal is **skipped if the broadcast's Items still
   contain the same ID** — a re-add before reconnect wins over its own
   tombstone. A check-off removal carries its `deletedAt`, so Peers derive the
   Purchase event and history converges too (ADR-0008).

## Budget honesty (prerequisite)

This only ships on top of budget-honest publishes: only a 2xx counts as sent and
clears a publish-failure status (`offline` is SSE-connection state, cleared on
reconnect, not by a publish); an oversized payload (relay caps messages at 4096
bytes) is refused before sending with a "Too large to sync" status and the
tombstones stay for retry; the status pill distinguishes the burst 429 from the
daily 429, and a `limited` status is sticky — a later failure never displaces
it, only a 2xx does.

## Considered options

- **Plain `FULL_SYNC` on every reconnect**: rejected — it would rebuild catalog
  membership from scratch each time and has no way to express removals.
- **Sending `DELETE_ITEM` per pending removal on reconnect**: rejected — `N`
  messages instead of one, and each would still need the snapshot the tombstone
  already carries.
- **No throttle**: rejected — SSE reconnects can flap every few seconds; each
  would cost a full-state publish.

## Consequences

IndexedDB schema moves to v6 with a `tombstones` store. `STATE_SYNC` joins the
protocol. Conflict resolution remains last-writer-wins per record (ADR-0003
undecided); an item re-added via the 12h replay after its tombstone broadcast
may temporarily diverge until the next broadcast — accepted.
