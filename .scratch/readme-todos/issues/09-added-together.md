# 09 — Added-together suggestions from adding sessions

**What to build:** Co-occurrence suggestions over the add events: group adds
into adding sessions (bursts separated by a time gap), count how often two
Products were added in the same session, and treat a pair as "added-together"
only after ≥3 co-occurring sessions (noise guard). When an Item is added, chips
for its added-together companions jump to the top of the suggestions strip for a
short window; with no data the ranking is unchanged — a silent no-op. Shares the
session-segmentation idea with the deferred purchase-order work (06).

**Blocked by:** 04 — Add-time consumers (Catalog last-added, merged History view, backup v2).

**Status:** ready-for-agent

- [ ] Adds are grouped into adding sessions by a time-gap heuristic.
- [ ] Pair counts accumulate per session; pairs need ≥3 co-occurring sessions to surface.
- [ ] Adding an Item pivots the chips to its added-together companions for a short window.
- [ ] No-data case is a silent no-op.
