# 01 — Budget & size protection for publishes

**What to build:** the shared 250-msg/day per-IP budget is the second-priority constraint —
when it's exhausted, convergence stops. Today a publish the relay rejects is *silently
treated as success*: it still counts toward the daily counter and can even clear a
"limited" status. This ticket makes every publish honest about what actually happened:

- A publish the relay rejects (e.g. 413 too large, or any non-429 4xx/5xx) must not
  increment the daily counter, must not clear a "limited" status, and must be visible.
- A publish whose serialized payload exceeds the relay's ~4 KB message cap must be
  refused *before* sending, with a clear "too large to sync" status instead of a silent
  rejection that still burns a message.
- The status must distinguish the two 429 classes: a **burst** rate limit (resets in
  minutes) vs the **daily** message limit (resets at midnight UTC).
- A publish that fails at the network layer (offline) should surface in the status,
  not just in the console — the pill must not claim "connected" while publishes fail.

This is the blocker for the reconnect convergence work: the convergence broadcast in
`02` must be safe to ship on top of this.

**Blocked by:** None — can start immediately.

**Status:** ready-for-human

- [x] A rejected publish (non-429 4xx/5xx, e.g. 413) does not bump the daily counter and does not clear a "limited" status; it surfaces as a status/error instead.
- [x] A publish whose serialized payload exceeds the relay's message cap is refused before sending, shows a clear "too large" status, and does not count toward the budget.
- [x] A burst 429 (resets in minutes) is shown distinctly from the daily-limit 429 (resets at midnight UTC) in the status pill.
- [x] A network-level publish failure surfaces in the status rather than only in the console.
