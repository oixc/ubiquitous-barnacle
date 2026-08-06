# 01 — ISO date/time display across the List

**What to build:** One set of shared ISO 8601 formatters (date `YYYY-MM-DD`, time `HH:MM`, datetime `YYYY-MM-DD HH:MM`, built from local wall-clock components) becomes the single seam for all date/time rendering, and all four display sites route through it: History timestamps, Catalog last-bought/last-added dates, fresh-check-off suggestion tooltip, and restock suggestion due date. Storage/sync/backup formats stay untouched.

**Blocked by:** none — can start immediately

**Status:** ready-for-agent

- [ ] History timestamps render as `2026-08-06 19:59` (local time)
- [ ] Catalog reads `last bought 2026-08-06` / `last added 2026-08-06`; "never bought"/"never added" unchanged
- [ ] Fresh tooltip reads `Bought 19:59`; restock tooltip `due 2026-08-06`
- [ ] All four sites share the one formatting seam — no scattered `toLocale*` calls remain
- [ ] No new `js/*.js` module; `sw.js` untouched
