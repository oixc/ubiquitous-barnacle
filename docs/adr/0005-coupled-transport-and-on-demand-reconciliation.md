# Coupled Item/Product transport and on-demand reconciliation

Sync rides the free tier of ntfy.sh, which caps publishing at **250 messages
per day per IP** (a household on one network shares that budget). To stay
inside it, changes propagate in real time but reconciliation is on demand:
`PUT_ITEM` always carries its Product (aliases + presets) so Product creation,
alias-confirm, and preset-learning ride along in the same message, and
`REQUEST_SYNC`/`FULL_SYNC` fire only on a fresh join (empty local DB) or the
drawer's explicit Refresh action — steady-state reconnects lean on the free
`since=12h` SSE replay.

We rejected a purely manual Catalog sync (Items reference Products by ID, so a
Peer cannot render a remote Item without the Product — the manual approach
needs a placeholder and re-introduces the `REQUEST_SYNC` fallback), and
debounced/coalesced real-time broadcasting (items are already one message per
action; the saving was the Product messages, which coupling removes outright).

Consequences: a device offline longer than 12h stays stale until Refresh;
edits made while sync is off or offline are fire-and-forget (persisted
locally, never re-broadcast later); and a 429 publish flips the status pill to
"Sync limited" until the next success or midnight UTC. A 429 retry within the
day is pointless — the budget resets daily.
