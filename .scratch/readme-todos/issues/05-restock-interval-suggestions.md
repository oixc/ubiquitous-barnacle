# 05 — Restock-interval suggestions

**What to build:** The "Buy again" suggestions become timing-aware instead of frequency-only. For each Product, estimate a restock interval — primarily from its add events (the gaps between consecutive adds) — and combine it with the last purchase/add date. A Product that is due now (interval elapsed since last purchase) is suggested; a Product that is frequent but not yet due is suppressed. The existing noise-guard (not suggested after too few purchases) is removed and the cap on suggestion count is increased to 20. The catalog shows the estimated restock interval for each item.

**Feeds:** 11 — soft-priority ranking restock-dominance.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] Suggestion ranking is driven by restock interval + last purchase/add date, not raw purchase count.
- [ ] Products that are frequent but not yet due are excluded from suggestions.
- [ ] The minimum-purchase noise guard is removed.
- [ ] The suggestion-count cap is increased to 20.
- [ ] The catalog shows the estimated restock interval for each item.
 