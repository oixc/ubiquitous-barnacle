# 08 — Check-off gesture replaces toggle-bought; remove stays distinct

**What to build:** Tapping an Item row buys it: the Item leaves the List (no
struck-through shelf), broadcasts a check-off `DELETE_ITEM` with `deletedAt`,
and its Product becomes a fresh suggestion chip (see 01). The trash button still
deletes without recording a Purchase — a plain `DELETE_ITEM`, no `deletedAt`.
The "To buy"/"Bought" section headers and the Clear button disappear; the List
shows only to-buy Items, and the freed-up space hosts the suggestions strip.

**Blocked by:** 07 — Wire changes.

**Status:** ready-for-agent

- [ ] Tapping a row checks it off: item removed locally, broadcast as a check-off `DELETE_ITEM` (with `deletedAt`), no confirmation dialog.
- [ ] The trash button removes the item and broadcasts a plain `DELETE_ITEM` (no `deletedAt`).
- [ ] The "To buy"/"Bought" headers and the Clear button are removed; the bought shelf no longer renders.
- [ ] The suggestions strip occupies the freed space.
