# 05 — Restock-interval suggestions

**What to build:** The "Buy again" suggestions become timing-aware instead of frequency-only. For each Product, estimate a restock interval from the gaps between consecutive purchase events (ADR-0008), stored on the Product as `restockInterval`/`lastPurchase` and refreshed only when a purchase is recorded (never per render), and combine it with the last purchase date. A Product that is due now (interval elapsed since its last purchase) is suggested; a Product that is frequent but not yet due is suppressed. The existing noise-guard (not suggested after too few purchases) is removed and the cap on suggestion count is increased to 20. The catalog shows the estimated restock interval for each item.

**Feeds:** 11 — soft-priority ranking restock-dominance.

**Blocked by:** none

**Status:** ready-for-agent

- [x] Suggestion ranking is driven by restock interval + last purchase date, not raw purchase count.
- [x] Products that are frequent but not yet due are excluded from suggestions.
- [x] The minimum-purchase noise guard is removed.
- [x] The suggestion-count cap is increased to 20.
- [x] The catalog shows the estimated restock interval for each item.
 