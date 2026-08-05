# Backup export/import with spelling-deduped merge

A single versioned JSON file captures a List's Catalog and Purchase history.
Restoring it into any List remaps record IDs to that List, merges Products by
normalized default spelling (the existing local Product wins; the imported
aliases/presets fold into it), and dedupes Purchase history by
(productId, boughtAt, detail). Imports are local-only — they never broadcast
to Peers, so the shared Catalog stays authoritative and the daily sync budget
is untouched. This settles ADR-0003's open Catalog-merge question for the
import path; general peer-meeting reconciliation of duplicate Products remains
open.

## Considered options
- **Broadcast imported Products via `PUT_PRODUCT`**: rejected — a stale backup
  could resurrect deleted Products on every Peer, and a large catalog could
  exhaust the daily budget.
- **Blind replace of the target Catalog**: rejected — on a live synced List it
  fights Peers who re-broadcast their own Products back.
- **Restrict imports to the exporting List**: rejected — remapping IDs makes
  cross-List restore safe enough to allow.
