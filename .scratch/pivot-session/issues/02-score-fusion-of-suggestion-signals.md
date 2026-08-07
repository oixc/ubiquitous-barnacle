# 02 — Score fusion of suggestion signals

**What to build:** Replace the three hard tiers (pivot > fresh > restock) in
`computeSuggestions` with a single flat weighted score so signals mix — e.g. a
restock that is also a frequent added-together companion outranks a plain
restock. Weights are constant whether or not the adding pivot window is active
(no context gate); pivot is naturally 0 outside the window because no companions
exist then. Chips show every signal that fired: the tooltip lists all reasons,
the chip colour reflects the dominant (highest-weighted) signal.

**Blocked by:** None — can start immediately (ticket 01 committed).

**Status:** ready-for-agent

- [x] Scoring is a flat weighted sum, not breadth-first and not boost-within-tiers; weights are named, tunable constants flagged as such.
- [x] Normalization per the table: pivot `min(1, c/6)` (companion count c, ≥3 by the noise guard), fresh `max(0, 1 − age/60min)` within the 60-minute trip window, restock `min(1, overdue/interval)` (due only).
- [x] `score = 1.0·pivot + 0.7·fresh + 0.6·restock`; no context gate — the weights never change; outside the pivot window the pivot term is naturally 0.
- [x] Suggestion shape is `{ product, kind, score, reasons: [...] }`; `kind` = dominant signal (highest `weight·normalized`), tie-broken pivot > fresh > restock, and drives the chip colour.
- [x] `reasons` carries one structured entry per fired signal; the chip tooltip lists every reason (newline-joined, formatted by ui.js).
- [x] Order: score desc → #signals desc → strongest signal desc → defaultSpelling asc; the 20-chip cap is unchanged.
- [x] Real fusion pairs work — pivot×restock and pivot×fresh mix (fresh∩restock is structurally near-impossible and does not need handling).
- [x] `expiresAt` mechanics unchanged (min of pivot-window end and each fresh event +60 min); co-occurrence counting still runs only while a pivot is active.
- [x] Cross-regime dedupe collapses by construction (one map entry per product); on-List exclusion and the noise guard are unchanged.

## Comments

Implemented in `computeSuggestions` (`js/catalog.js`): the three regimes now
write raw signals into a single `Map<productId, {product, pivot, freshAt,
restockInterval, restockDueAt}>` — pivot companion count (via
`sessionPivotCompanions`), max fresh `at` (≤60 min), and due restock
`{interval, dueAt}` — then each product normalizes and scores as
`PIVOT_WEIGHT·pivot + FRESH_WEIGHT·fresh + RESTOCK_WEIGHT·restock` with
`PIVOT_WEIGHT = 1.0`, `FRESH_WEIGHT = 0.7`, `RESTOCK_WEIGHT = 0.6`,
`PIVOT_SATURATION = 6` as tuning knobs. `kind` is the dominant weighted signal
(tie-break pivot > fresh > restock); the sort is score desc, #reasons desc,
strongest signal desc, spelling asc; the top 20 win. `js/ui.js` formats the
structured `reasons` into a newline-joined tooltip and colours the chip by
`kind`. Docs updated in `AGENTS.md` and `CONTEXT.md`.

Code-review (both axes) flagged a `kind` tie-break bug — the initial
`let kind = "restock"` with strict `>` resolved exact pivot×restock and
fresh×restock ties to restock, contradicting the pivot > fresh > restock order.
Fixed: the dominant kind is the first (highest-priority) signal whose weighted
value `===` the max; an all-zero row keeps the restock fallback that ui.js
already applies for unknown kinds. The get-or-create signal-row shape was also
extracted into `signalRow` (was triplicated across the three regimes).
