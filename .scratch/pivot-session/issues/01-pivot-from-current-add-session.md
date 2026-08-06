# 01 — Pivot from the current adding session

**What to build:** When building the List, the suggestions strip pivots to the
added-together companions of the whole current adding session — every Item added
in this session — instead of only the last one added. A mixed batch (e.g.
Reisessig then Tomaten, or Kaffebohnen + Mehl + Zitronen together) surfaces the
companions learned for each on-List session Item, deduped, so the strip stays
relevant for the whole build instead of only reflecting the final add.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] Adding a single Item still pivots to its added-together companions for the 2-minute window, unchanged from today (regression guard).
- [x] When several Items are added within one adding session, the strip shows the union of every on-List session Item's added-together companions (≥3 co-occurring sessions), each companion shown once.
- [x] A checked-off (purchased) session Item stops contributing its companions immediately; the pivot survives while at least one session Item remains on the List.
- [x] A companion reachable via several session Items shows the average of its per-Item co-occurrence counts, rounded to the nearest integer, and ranks among pivot chips by that average (highest first).
- [x] Companions already on the List are not suggested; an Undo re-add (records no event) never contributes.
- [x] The pivot drops when the latest add ages past the 2-minute window or no session Item remains on the List; the expiry-driven re-render timing is unchanged.
- [x] Pivot chips keep outranking fresh and restock; cross-regime dedupe and the 20-chip cap are unchanged.
- [x] Remote adds in the session pivot too, since both derive from the event store.

## Comments

Implemented in `computeSuggestions` (`js/catalog.js`). The pivot now uses the whole
current adding session — the burst holding the latest add (30-minute session gap) —
instead of only the last add. `sessionPivotCompanions` unions the added-together
companions of every on-List session Item (noise guard ≥3 per pair), excludes
companions already on the List, and reports a companion reachable via several
session Items as the rounded average of its per-Item counts, ranking pivot chips
by that average (highest first). The activation window and `expiresAt` are
unchanged (latest add + 2 minutes); the pivot also drops when no session Item
stays on the List. Both local and remote adds pivot since the pivot reads the
event store. `addedTogetherWith` was replaced by `sessionPivotCompanions`; the
co-occurrence counting still runs only while a pivot is active.
