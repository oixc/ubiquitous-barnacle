# 02 — Rename list sections: "Recent", unnamed to-buy

**What to build:** The List view matches the new vocabulary: the to-buy section is shown with no section header at all, and the bought section is labelled "Recent". Domain docs (CONTEXT.md, README.md) are updated so the documented language matches what the UI shows. This is a display-and-docs rename only — internal identifiers, the `bought` Item field, and the `CLEAR_BOUGHT` wire action keep their existing names.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The to-buy section renders without its "To buy" header (the count may remain or not — decide in implementation).
- [ ] The bought section renders with a "Recent" header in place of "Bought".
- [ ] CONTEXT.md and README.md describe the two sections as "Recent" and the unnamed to-buy section.
