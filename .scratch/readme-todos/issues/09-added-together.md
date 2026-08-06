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

- [x] Adds are grouped into adding sessions by a time-gap heuristic.
- [x] Pair counts accumulate per session; pairs need ≥3 co-occurring sessions to surface.
- [x] Adding an Item pivots the chips to its added-together companions for a short window.
- [x] No-data case is a silent no-op.

## Comments

Implemented together with 11 (soft-priority ranking shares the pivot). Add events are
segmented into adding sessions in `groupAddingSessions` (gap 30 min), pairs counted per
session in `coOccurrenceCounts`/`addedTogetherWith` (noise guard ≥3). `computeSuggestions`
pivots on the most recent add event within a 2-minute window — derived from the event
store, so remote adds pivot too and an Undo re-add (which records no event) never does.
Co-occurrence counting runs only while a pivot is active. Suggestion shape gains
`kind: "pivot" | "fresh" | "restock"` (11 extends the same function).

Review refinements: the pivot requires the triggering Item to still be on the
List (a check-off ends it — the fresh regime in 11 takes over instead), and
`computeSuggestions` returns an `expiresAt` so `main.js` re-renders exactly when
the pivot window lapses instead of waiting for the next user action.
