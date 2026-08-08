# Spec — Reconnect convergence for sync

**Parent context:** the sync review (findings + re-design questions, since removed from
disk) found that a peer's local changes made while offline — or with Sync toggled off —
never reach other peers. The SSE `since=12h` replay covers *pulling* what you missed;
nothing *pushes* what you did. The decided response is a reconnect broadcast.

**Priority order (decided 2026-08-08):** convergence first — the list of Items must be
the same on all Peers. Message budget second, as an *indirect* priority: once the
250-msg/day per-IP budget is exhausted, convergence stops, so budget must be protected.

## The design

On every SSE connect where the device already holds state, it broadcasts its current
Items + Products to the topic. The same broadcast also carries the removals this device
made while disconnected (a small persistent tombstone set, flushed once broadcast
succeeds). Receiving Peers merge: Items/Products apply idempotently (derived IDs), and
carried removals delete locally — the removal wins only when the incoming Items don't
already contain the same ID (re-add before reconnect).

This fires on reconnect after network loss, on Sync re-enable after being off, and on
app open. Fresh-join `REQUEST_SYNC` for an empty DB is unchanged.

Budget protection (blocking ticket) ensures a publish the relay would reject (over
size cap, or a non-429 error) is neither counted as sent nor silently treated as
success, and that burst vs daily 429s are distinguished in the status.

## Tickets

- `issues/01-budget-size-protection.md` — budget & size protection (no blockers)
- `issues/02-reconnect-convergence.md` — reconnect broadcast + offline removals (blocked by 01)

## Non-goals (reconfirmed)

- No membership/permissions (ADR-0002) — the unguessable-List-name model.
- No migration mechanisms (early development, breaking changes welcome).
- No conflict resolution — last-writer-wins per record stays (ADR-0003 undecided).
- No change to fresh-join `REQUEST_SYNC`/`FULL_SYNC` beyond what the tickets specify.
