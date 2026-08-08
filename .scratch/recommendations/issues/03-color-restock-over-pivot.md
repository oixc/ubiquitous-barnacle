# 03 — Colour chips by restock-over-pivot priority

**What to build:** A recommendation chip is only given the pivot (added-together)
colour when its Product is not due for restock. When a Product fires both the
pivot and restock signals, the chip takes the restock colour — the pivot colour
is reserved for companions that are genuinely due-free. The fresh signal keeps
its own colour and the existing dominant-signal logic otherwise stands.

Concretely: the chip's colour, currently driven by the dominant weighted
signal (tie-broken pivot > fresh > restock), gains a restock override — a due
restock signal wins the colour regardless of how strongly the pivot fires.
The override applies **only against pivot**: a Product firing fresh and
restock-due still resolves by dominant weight between those two, so fresh may
still win. Tooltips still list every signal that fired, and ordering is
untouched; only the colour choice changes. A pivot-only companion (not due)
keeps the pivot colour exactly as before.

**Blocked by:** 01 — Rename "suggestions" to "recommendations" (this logic
lives in the renamed ranking code, so the rename lands first).

**Status:** ready-for-agent

- [ ] A Product that is due for restock and also a pivot companion renders with
      the restock colour (not the pivot colour), however strongly pivot fires.
- [ ] A pivot companion that is not due for restock keeps the pivot colour;
      fresh-only and restock-only chips colour as before.
- [ ] A Product firing fresh and restock-due resolves by dominant weight
      between those two (fresh may still win); the restock override does not
      extend past pivot.
- [ ] The tooltip still lists every fired signal — colour and tooltip no longer
      disagree on what is happening.
- [ ] Chip ordering and the flat weighted score are unchanged.
