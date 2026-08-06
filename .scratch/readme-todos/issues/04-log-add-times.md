# 04 — Log add-times per Product

**What to build:** Every time an Item is added to the List — typed, revived, added via a suggestion or Preset chip, and added from a remote Peer — the moment is recorded as a per-Product add-time event in a new device-local store (same lifecycle as Purchase history: never synced, so the daily sync budget is untouched). The Catalog view shows each Product's "last added" time so the log is visible and verifiable rather than an invisible data sink. This record is the primary signal for the restock-interval suggestions ticket.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Adding an Item (new or revived, local or remote) writes an add-time event for its Product, scoped to the current List.
- [ ] The Catalog view shows each Product's last-added time alongside the existing buy count / last-bought.
- [ ] The new store lives in IndexedDB with the same `byList` scoping as the existing stores; schema version and service-worker cache name are bumped per the repo's gotchas.
- [ ] Existing Purchase-history behaviour and statistics are unchanged.
