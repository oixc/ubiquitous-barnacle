# 04 — Sync on by default

**What to build:** a fresh install starts with Sync On — the drawer shows On and the
app syncs without the user finding the toggle. The drawer toggle can still turn Sync
off, per List, as in ticket `03`. The shipped default flips to on, and the docs that
say "Sync is off by default" are updated to match.

**Blocked by:** `01` — Budget & size protection for publishes, `02` — Reconnect
convergence: broadcast state + offline removals (so the default flips once publishes
are budget-honest and offline changes converge), and `03` — Sync state is saved per
List (so the default composes with the per-List model).

**Status:** ready-for-agent

- [ ] A fresh install starts with Sync On; the List syncs without touching the toggle.
- [ ] The drawer toggle can still turn Sync off, and the choice sticks per List (ticket `03`).
- [ ] The "Sync is off by default" documentation is updated to reflect the new default.
