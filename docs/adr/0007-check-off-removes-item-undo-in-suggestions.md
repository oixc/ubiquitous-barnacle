# Check-off removes the Item; undo and suggestions replace the bought shelf

The "Ideal User Experience" redesign drops the bought state entirely: buying an
Item (checking it off) deletes it from the List instead of moving it to a
struck-through shelf, so there is never anything to clear. The checked-off
Product becomes a fresh one-tap suggestion, and re-adding it within the undo
window (10 minutes) silently cancels the matching Purchase-history record. A
trash deletion is distinct from a check-off and records no Purchase. Purchase
history stays device-local and self-healing: every Peer derives it from the
shared `PUT_ITEM`/`DELETE_ITEM` stream — `DELETE_ITEM` carries the Item snapshot
with a `deletedAt` timestamp only for check-offs — deduped by
(productId, deletedAt, detail), so all Peers' histories converge without any
dedicated history messages or broadcasts.

## Considered options
- **Keep the bought shelf** (the shelf-of-recurring-staples mental model):
  rejected — the suggestion strip now does that job with less clutter, and
  keeping struck-through rows forces a separate clearing gesture and a
  `CLEAR_BOUGHT` wire action that no longer has anything to act on.
- **Broadcast Purchase history (or history edits)**: rejected — the message
  stream already carries the timestamps needed for every Peer to rebuild the
  same local history, and local-only history keeps the sync budget untouched
  and makes undo-cleaning trivially local.
- **Undo as a toggle-back state**: rejected — a transient Bought state to
  support un-checking re-introduces exactly the shelf this design removes.
  The delete-then-re-add-within-the-window heuristic covers the same need with
  less state.

Consequences: a device offline longer than the 12h SSE replay window starts its
history cold; undo-classification slightly undercounts genuine double-buys
(check off → re-add within the window → check off again counts as one Purchase);
Items no longer carry a `bought` field and `CLEAR_BOUGHT` is removed from the
wire.
