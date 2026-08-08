# Spec — Restock: lognormal model + decay

**Status:** `ready-for-agent`

## Problem Statement

Restock prompts pin at maximum strength the moment a Product's interval elapses and never fade, so a Product the household has consciously stopped buying stays pinned near the top of the strip indefinitely. The underlying model is a device-local median recomputed from each device's own event history: two Peers can disagree on a Product's restock timing, and a fresh device has no restock knowledge until it has replayed history locally. Separately, the model ignores that some Products are bought quickly after being added while others dwell on the List — a Product's *timing of when to be suggested* should account for how long it will sit on the List before it's bought.

## Solution

Model each Product's purchase gaps as a **lognormal distribution in log-time**, maintained on the shared Product itself by a **fixed-α EWMA update** per observed purchase — independent of any device's event history, converging across Peers from the same purchase stream, and usable immediately on a fresh device. The ranking signal is the **density** of that lognormal evaluated at the time elapsed since the last Purchase **plus the Product's typical List dwell**, normalized to a 1.0 peak: strongest when the Item would be bought around the household's typical gap, near-zero right after a Purchase, and decaying as the Product grows overdue — so an ignored Product sinks in rank. Dwell shifts the recommendation earlier for Products that need lead time on the List, and the flat weighted score with top-20 truncation remains the only filter.

## User Stories

1. As a shopper, I want a Product I usually buy to be recommended for restock, so that I can re-add it in one tap.
2. As a shopper, I want a restock chip to rank highest when the Item would be bought around the household's typical gap, so that the most likely products lead the strip.
3. As a shopper, I want a Product I've just bought to rank at the bottom of the strip, so that it never nags right after buying.
4. As a shopper, I want a Product I keep ignoring to sink in rank the more overdue it grows, so that the strip reflects that I don't want it.
5. As a shopper, I want every strip slot filled by the best 20 recommendations, so that the truncation — not a manual threshold — decides what shows.
6. As a shopper, I want a Product that is both an added-together companion and restock-relevant to show whichever signal is stronger, so that both cues stay readable.
7. As a shopper, I want a Product that typically dwells on the List to be suggested earlier, so that it's on the List when the household is due.
8. As a shopper, I want a Product bought immediately after adding to keep the plain restock timing, so that lead time doesn't over-shift the prompt.
9. As a Peer without local add history, I want the dwell offset to arrive with the synced Product state, so that a fresh device still applies the timing correction.
10. As a shopper, I want the Product card to show the expected restock interval, so that I can see buying rhythm at a glance.
11. As a shopper, I want a restock chip's tooltip to name the expected interval, so that I understand why it was suggested.
12. As a Peer on a fresh device, I want restock prompts to work immediately from the synced Product state, so that no local purchase history is needed.
13. As a Peer, I want my devices to converge on the same restock rankings, so that every device suggests the same things at the same time.
14. As a shopper, I want the model to adapt when the household's buying cadence changes, so that recent purchases outweigh ancient ones.
15. As a shopper, I want the model updated in constant time per purchase, so that the app stays fast regardless of history length.
16. As a shopper, I want replays and out-of-order purchase messages to leave the model undistorted, so that intervals are never double-counted after a reconnect.
17. As a shopper, I want no restock prompt for a Product that has never been bought, so that restock stays purchase-driven.
18. As a Peer, I want the restock and dwell model to ride the existing Catalog broadcasts, so that no sync budget is spent.
19. As a developer, I want the model updates and the signal as pure functions in one module, so that behaviour is verifiable and the ranking and catalog modules stay thin.
20. As a shopper, I want a single stale gap (e.g. a purchase missed while offline) to be smoothed out over a few purchases, so that one glitch doesn't permanently warp the interval.
21. As a developer, I want the old due-based semantics and the colour override gone, so that the UI and the ranking agree with the likelihood model.

## Implementation Decisions

- **Schema (breaking, no migration):** the Product carries the model — `restockMu` (EWMA mean of log-gaps), `restockSigma` (log-space spread, floored at a small minimum so the density stays well-formed before any spread is observed), `dwellMu` (EWMA mean of log add→purchase gaps), and the existing `lastPurchase` (now monotonic). `restockInterval` is dropped; the expected interval for display is the derived median `exp(restockMu)`.
- **Online update (fixed α):** on every observed purchase — local check-offs and wire-received purchases alike, both flow through the single delete write path — update in O(1) with no event scan: guard `purchaseAt > lastPurchase` (idempotent under SSE replay / out-of-order delivery), EWMA-update `restockMu` and the squared-deviation estimate with α = 0.25 (a named constant, tuning knob), then set `lastPurchase`. `dwellMu` is updated only when the device knows the Item's `createdAt` (its own held Item or its add event); a Peer without local add history skips the dwell update and keeps the synced `dwellMu`. Dwell gaps ≤ 0 or below a small floor are skipped (instant-buy / clock skew). The model exists whenever its parameters are present — no warm-up gate, no history requirement.
- **Signal:** elapsed `t = (now − lastPurchase) + exp(dwellMu)` (dwell shift = 0 when `dwellMu` is absent); strength = the lognormal density at `t` normalized by its mode-peak (0..1, unimodal). No due gate and no floor: the value feeds ranking only, and the top-20 truncation is the only filter. Products already on the List never fire.
- **Ranking (unchanged mechanism, 02):** the flat weighted score stays `pivotₙ·1.0 + restockₙ·0.6`; the normalized density is the new `restockₙ`. Tie-breaks (reasons count, strongest signal, spelling) unchanged.
- **Chip colour (reverses ADR-03):** no override — a chip is coloured by whichever signal contributes the stronger term. The amber restock colour reflects a dominant restock likelihood; the blue pivot colour can show even for modeled Products when the companion wins.
- **Rendering:** no restock-driven re-render scheduling; `expiresAt` remains the pivot-window-only mechanism. Product card and chip tooltip show "Restock every X" from the median; the "due Y" phrasing and the `restockDueAt`-bearing reason are removed from the reasons payload.
- **Module seam:** a new pure restock module (no IndexedDB, sync, or DOM imports) exposes the model updates (Product state + purchase gap → new Product state) and the signal (Product + now → normalized strength and expected interval, or none when unmodeled/on-list). The catalog module's purchase hook and the ranking module's signal gatherer become thin wrappers around it.
- **Persistence & convergence:** updated Product state is persisted local-only, riding the next Item broadcast as Product edits do today (no new sync messages, budget untouched). Peers observing the same purchase stream from the same starting state converge to identical parameters; a fresh-join device seeds from the broadcast Product state alone. Known limitations: a stale `lastPurchase` (missed purchase) yields one inflated gap, smoothed by α over subsequent purchases; `dwellMu` advances only on devices that observed the add; product-state writes remain last-writer-wins as elsewhere.

## Testing Decisions

- The repo has no test harness and that convention is kept for this change. Verification is manual in the browser per AGENTS.md: with a built-up purchase history, check that chips rank highest near the typical gap, that a just-bought Product disappears from the strip, that an artificially over-overdue Product sinks to the bottom, that a Product firing both signals takes the stronger colour, that a high-dwell Product is suggested earlier than an instant-buy one with the same cadence, and that the Product card shows the expected interval.
- When tests are ever introduced, the seam is the restock module's pure functions (feed purchase streams and `now` snapshots, assert on returned state and strengths) plus one pass through the ranking module to pin the signal→ranking wiring (score, order, colour, top-20 cut). No prior art exists in the repo; this is the first seam candidate.

## Out of Scope

- Added-together / pivot ranking and its window.
- Typical purchase order (trip positions).
- Sync protocol, message budget, and broadcast policy (no DELETE_ITEM change).
- Per-Detail or multi-quantity models; non-parametric models; a full dwell distribution.
- Chip UI redesign, manual snooze/dismiss, per-Product interval overrides.
- Cross-List models.

## Further Notes

- Reverse of ADR-03 (colour override) and a changed restock definition (ADR-0008 consumer bullet "restock intervals: gaps between consecutive purchase events") should be recorded; a short ADR for the lognormal restock model is warranted.
- When shipped, bump `APP_VERSION` (js/version.js) and the sw.js cache name per AGENTS.md; the Products store needs no IndexedDB version bump (object-store schemas are free-form).
- Backup v2 exports Products as-is, so `restockMu`/`restockSigma`/`dwellMu` flow through restore; restored Products keep the List's existing state per the merge rules (existing wins).
- The README "### restock (draft, ignore for now)" section should be removed and replaced by a pointer to this spec once shipped.
- Tuning knobs left for real-data calibration: α (0.25), the sigma floor, and the pivot/restock weights.
