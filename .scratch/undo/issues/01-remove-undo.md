# 01 — Remove undo feature and fresh suggestions

**What to build:** Remove the entire undo feature — the classification logic that cancels a purchase event when a Product is re-added within 10 minutes, the "fresh" suggestion signal that surfaces recently bought Items, and all associated documentation. After this, every re-add always records a fresh add event (the behaviour already shipped since `ENABLE_UNDO` is `false`). The suggestions strip retains only pivot (blue) and restock (amber) chips.

**Blocked by:** none — can start immediately

**Status:** ready-for-agent

> **Caution:** `js/ui.js` has an unrelated `freshIds` (the "animate-row-in" flash for
> newly added rows, ui.js:385-401) — same word, must NOT be removed. Only the
> suggestion-strip fresh signal goes.

- [x] `ENABLE_UNDO` constant removed from `js/main.js`
- [x] `UNDO_WINDOW_MS` constant removed from `js/catalog.js`
- [x] `cancelUndoIfFresh` function removed from `js/catalog.js`
- [x] Undo classification path removed from `writeItem` in `js/main.js` — every new Item now always records an add event (no conditional)
- [x] `gatherFreshSignals` function removed from `js/catalog.js`
- [x] `FRESH_WEIGHT` constant removed from `js/catalog.js`
- [x] `fresh` signal removed from the suggestion scoring fusion (pivot + restock only)
- [x] `fresh` colour and tooltip definition removed from `js/ui.js`
- [x] Fresh suggestion rendering (emerald chips, "Bought Xm ago" tooltip) removed from `js/ui.js`
- [x] `TRIP_WINDOW_MS` constant removed from `js/catalog.js` (only used by fresh suggestions)
- [x] `computeSuggestions` no longer references fresh signals — verify pivot and restock still render correctly
- [x] `index.html`: suggestions comment updated (line 119: "added-together, fresh check-offs, restock" → "added-together, restock")
- [x] `CONTEXT.md`: remove "Undo", "Undo window" definitions; remove undo references from "Purchase" and "Add event" definitions; drop "fresh suggestion" from "Check off" and "fresh check-offs" from "Suggestion"; remove undo mention from "Event history"
- [x] `AGENTS.md`: remove the undo gotcha bullet; drop fresh from the suggestion-ranking description (lines 74-81 — now pivot + restock only, `1.0·pivot + 0.6·restock`)
- [x] `README.md`: remove the undo todo section; remove undo mention from the North Star description (line 11) and from the Smart Suggestions bullet (line 27, "one-tap undo of recent buys")
- [x] `docs/adr/0007`: update title and body to remove undo references and the "fresh one-tap suggestion" behaviour — the ADR now describes check-off only, without undo classification or the fresh suggestion (file renamed to drop "undo" from the slug)
- [x] `docs/adr/0008`: remove the Undo section; simplify derivation notes to reflect that every new Item always records an add event
- [x] No references to `cancelUndoIfFresh`, `UNDO_WINDOW_MS`, `ENABLE_UNDO`, `gatherFreshSignals`, `FRESH_WEIGHT`, or `TRIP_WINDOW_MS` remain in the codebase; no stale prose ("undo window", "fresh suggestion", "fresh check-offs", "one-tap undo") remains in `CONTEXT.md`, `AGENTS.md`, `README.md`, `docs/adr/*`, or `index.html`
- [x] The app works end-to-end: add items, check off items, re-add items — re-adds always record a fresh add event; no emerald chips appear in the suggestions strip
