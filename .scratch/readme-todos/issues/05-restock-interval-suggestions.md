# 05 — Restock-interval suggestions

**What to build:** The "Buy again" suggestions become timing-aware instead of frequency-only. For each Product, estimate a restock interval — primarily from its add-times (the gaps between consecutive adds), falling back to Purchase history when a Product has no add-times yet — and combine it with the last purchase/add date. A Product that is due now (interval elapsed since last purchase) is suggested; a Product that is frequent but not yet due is suppressed. The existing noise-guard (not suggested after too few purchases) and the cap on suggestion count stay.

**Feeds:** 11 — soft-priority ranking restock-dominance.

**Blocked by:** 04 — Log add-times per Product.

**Status:** ready-for-agent

- [ ] Suggestion ranking is driven by restock interval + last purchase/add date, not raw purchase count.
- [ ] Products that are frequent but not yet due are excluded from suggestions.
- [ ] Products without add-times fall back to Purchase-history intervals, so suggestions work before any add-log exists.
- [ ] The minimum-purchase noise guard and the suggestion-count cap remain intact.
