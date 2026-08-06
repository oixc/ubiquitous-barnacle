# 12 — Suggestions strip: type-to-filter

**What to build:** While the add input is non-empty, don't hide the strip
(`js/ui.js` syncSuggestionsVisibility currently hides it) — instead filter the
chips to Products whose default spelling or aliases match the typed prefix;
tapping adds the Item. When a match is selected, surface that Product's
Detail/Preset chips so one tap adds Product + Detail.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Typing filters chips by prefix (default spelling + aliases); the strip is no longer hidden while typing.
- [ ] A tap on a filtered chip adds the Item.
- [ ] Selecting a match surfaces its Detail/Preset chips for one-tap Product + Detail adds.
- [ ] The no-match state degrades gracefully (silent no-op or clean empty).
