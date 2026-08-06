# 10 — Suggestions strip: line-wrap chips

**What to build:** Pure layout change on the suggestions container
(`js/ui.js` renderSuggestions): the chip row switches from `flex gap-2
overflow-x-auto` to `flex-wrap` so chips wrap onto multiple lines and more fit on
screen.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] Chips wrap to multiple lines; no horizontal scrollbar.
- [x] Wrapped rows keep a consistent gap and don't overlap.
