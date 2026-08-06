# 04 — Add-time consumers: Catalog last-added, merged History view, backup v2

**What to build:** The add-side surface of the unified event store (ADR-0008;
derivation lives in 01). Add events are already recorded by 01; this ticket
makes them visible and portable. The Catalog view shows each Product's "last
added" time alongside its buy count / last-bought. The History view merges add
and purchase events in chronological order (with a kind badge), replacing the
purchases-only list. Backup format v2 exports both event kinds and restores them
with `productId` + `itemId` remapping on cross-List imports. Restock-interval,
added-together, and soft-priority work consume these events (feeds below).

**Feeds:** 05 — restock intervals, 09 — added-together sessions, 11 — soft-priority ranking.

**Blocked by:** 01 — Unified event derivation.

**Status:** ready-for-agent

- [x] Catalog view shows each Product's last-added time alongside the existing buy count / last-bought.
- [x] History view renders add and purchase events together, sorted chronologically, each with a kind badge ("Added" / "Bought").
- [x] Backup export (format v2) includes both event kinds; restore remaps `productId` and `itemId` by deterministic List-prefix swap (idempotent re-import) and dedupes by event key.
- [x] Existing stats consumers (suggestions, catalog counts) read the `events` store filtered by kind; behaviour unchanged.

**Note:** "last added" shows the last independent add — an undo re-add records no
add event, so it does not move the timestamp.
