# 11 — Suggestions strip: soft-priority ranking

**What to build:** Replace the count-based "Buy again" ranking with a soft-priority
model (ADR-0007): while any check-off is recent (the trip window, ~60 minutes),
the freshest checked-off Products top the strip, newest first, with restock-due
Products filling the rest (05); with no recent check-offs, restock-due Products
dominate. When an Item is added, the chips pivot to its added-together companions
(09) for a short window, then the ranking resumes. No hard modes.

**Blocked by:** 01 — undo freshness, 05 — restock-due, 08 — check-off gesture, 09 — added-together.

**Status:** ready-for-agent

- [x] Trip window heuristic: any check-off within ~60 minutes tops the strip, newest first.
- [x] Restock-due Products (05) fill the remaining slots and dominate when there are no recent check-offs.
- [x] Added-together pivot (09) tops the strip briefly after an add, then the ranking resumes.
- [x] "Buy again" label and count-based ranking removed.

## Comments

Implemented after 09 in the same pass. `computeSuggestions` now ranks three regimes —
pivot (09) > fresh check-offs within `TRIP_WINDOW_MS` (60 min), newest first > restock-due
(05) — deduped by Product across regimes and capped at 20. The strip's static "Buy again"
header is removed; chips carry a kind-aware tooltip (`Added together N×`, `Bought <time>`,
`Restock every … · due …`). Count-based ranking was already gone (05).
