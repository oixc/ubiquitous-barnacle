# 02 — Split recommendations into a separate module

**What to build:** The recommendation engine — gathering the pivot, fresh, and
restock signals, normalizing and fusing them into the flat weighted score,
ranking, and the expiry-driven re-render timing — moves out of the Catalog
module into its own module. The Catalog keeps Product resolution, Item
creation, and the restock-stat bookkeeping it already owns; the new module
reads events and Products through the storage layer and hands ranked
recommendations to the render layer. The bootstrap wires the new module in
place of the old entry point, and the strip renders identically.

Pure structural refactor: signal weights, saturation, windows, the sort order,
the 20-chip cap, the tooltip reasons, and chip colours are unchanged. The
module boundary is the seam: whatever the ranking logic needs as inputs (event
stream, on-List Products, the current adding session) must be passed in or
read via the storage layer — the new module does not take on write-path
responsibilities that belong in the bootstrap.

Shared helpers are **duplicated into the new module**: `segmentEvents`,
`median`, and `latestEvent` are also used by Catalog code that stays behind
(`computeTripPositions`, and `cancelUndoIfFresh` for undo classification), so
copy them rather than create new cross-module coupling. The ranking constants
(`MAX_SUGGESTIONS`, `SESSION_GAP_MS`, `MIN_COOCCUR_SESSIONS`, `PIVOT_WINDOW_MS`,
`TRIP_WINDOW_MS`, the three weights, `PIVOT_SATURATION`) move with the ranking
code. Note: `cancelUndoIfFresh` stays in the Catalog (it is separately slated
for removal by `.scratch/undo/issues/01` — the split doesn't wait for that, but
doesn't move it either).

**Blocked by:** 01 — Rename "suggestions" to "recommendations" (migrating the
code mid-rename would double the work).

**Status:** ready-for-agent

- [ ] A dedicated module exists that exports the recommendation entry point and
      imports cleanly; the bootstrap calls it instead of the Catalog's.
- [ ] The Catalog no longer computes or ranks recommendations; it keeps
      Product/Item responsibilities.
- [ ] Strip renders identically — same chips, ordering, colours, tooltips, and
      expiry-driven refresh.
- [ ] New module is registered for the app's asset/version story (same list of
      app files that gets bumped on release) so installed clients fetch it.
