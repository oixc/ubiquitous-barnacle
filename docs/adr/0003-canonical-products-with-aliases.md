# Canonical Products with aliases

The Catalog stores canonical Products with internal IDs, one default spelling,
and any number of aliases; Items reference Products rather than carrying free
text. We rejected free-text items (statistics and restock prompts would split
across spelling variants) and per-device catalogs (no group-wide statistics or
shared vocabulary). Near-miss spellings become aliases only after the typist
confirms; novel text creates a new Product whose first spelling is the default,
changeable later by an explicit rename. The Catalog is per-List and syncs like
Items do.

## Open questions
- **Catalog merge on meeting**: two Peers can create different Product IDs for
  the same spelling concurrently. Merge semantics are undecided — currently a
  Peer resolves an unknown `productId` by re-requesting `FULL_SYNC`, but there is
  no reconciliation of duplicate Products.
