# 06 — Order the List by typical purchase order

**What to build:** The to-buy Items sort in the order the household usually buys them during a shopping trip, so the List reads like a walk through the store and gets checked off in a predictable top-to-bottom order. The app learns each Product's typical position in a trip from Purchase history: segment history into trips (e.g. by time gaps between purchases), derive each Product's typical position, and sort the to-buy section accordingly. Products without enough history fall back to the current recency order, appended after learned ones. The bought section keeps its own grouping.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Purchase history is segmented into trips by a time-gap heuristic, and each Product's typical position within a trip is derived.
- [ ] To-buy Items are sorted by learned typical position; Products with no reliable history sort by current recency behaviour after the learned ones.
- [ ] The bought section's grouping/order is unchanged.
- [ ] Demoable: after a few trips with a consistent buy order, a freshly re-added list orders itself the same way.
