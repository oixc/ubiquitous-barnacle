# 06 — Order the List by typical purchase order

**Deferred → done:** Superseded by the suggestion-centric vision (ADR-0007); unblocked once the suggestions work (issues 01, 04, 05, 07-10) landed. Implemented in the same pass that finished 09/11.

**What to build:** The to-buy Items sort in the order the household usually buys them during a shopping trip, so the List reads like a walk through the store and gets checked off in a predictable top-to-bottom order. The app learns each Product's typical position in a trip from Purchase history: segment history into trips (e.g. by time gaps between purchases), derive each Product's typical position, and sort the to-buy section accordingly. Products without enough history fall back to the current recency order, appended after learned ones. The bought section keeps its own grouping.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] Purchase history is segmented into trips by a time-gap heuristic, and each Product's typical position within a trip is derived.
- [x] To-buy Items are sorted by learned typical position; Products with no reliable history sort by current recency behaviour after the learned ones.
- [x] ~~The bought section's grouping/order is unchanged.~~ **N/A** — the bought shelf was removed (issues 07, 08); the List shows only to-buy Items.
- [x] Demoable: after a few trips with a consistent buy order, a freshly re-added list orders itself the same way.

## Comments

Implemented after the suggestions work (09, 11) landed, as its deferral note asked.
`computeTripPositions` (catalog.js) segments purchase events into trips by a 1-hour gap
(`segmentEvents`, shared with 09's adding sessions), takes each Product's first
check-off per trip, normalizes its position to `index / tripSize`, and uses the median
(mean of the two central values on an even count) across trips — learned only after
≥2 trips (single-product trips contribute nothing). `ui.js renderList` sorts learned
Products by position ascending, then unlearned ones by recency (newest first), ties
broken by recency. No data → sort unchanged. A shared `median` helper was extracted
for trip positions; `medianGap` keeps its own upper-middle for even counts so restock
intervals (05) are unchanged. Cache bumped to v27.
