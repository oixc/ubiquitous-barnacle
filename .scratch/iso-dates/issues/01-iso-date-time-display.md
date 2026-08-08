# 01 — ISO date/time display across the List

**What to build:** One set of shared ISO 8601 formatters (date `YYYY-MM-DD`, time `HH:MM`, datetime `YYYY-MM-DD HH:MM`, built from local wall-clock components) becomes the single seam for all date/time rendering, and all three display sites route through it: History timestamps, Catalog last-bought/last-added dates, and restock suggestion due date. Storage/sync/backup formats stay untouched.

**Blocked by:** .scratch/undo/issues/01-remove-undo.md — the fresh-check-off suggestion tooltip was previously a fourth display site; it is removed there, so this ticket no longer touches it

**Status:** ready-for-agent

- [x] History timestamps render as `2026-08-06 19:59` (local time)
- [x] Catalog reads `last bought 2026-08-06` / `last added 2026-08-06`; "never bought"/"never added" unchanged
- [x] Restock tooltip reads `due 2026-08-06`
- [x] All three sites share the one formatting seam — no scattered `toLocale*` calls remain
- [x] No new `js/*.js` module; `sw.js` untouched
