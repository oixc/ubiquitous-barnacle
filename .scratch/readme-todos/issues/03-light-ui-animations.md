# 03 — Light UI animations

**What to build:** Subtle, fast motion makes the core actions feel responsive
without getting in the way: an added Item slides into the List, checking off an
Item animates its removal, and suggestion chips respond on tap. The old
toggle-bought strike-through and clear-bought fade animations are gone along
with the bought state. Motion is disabled for users who set
`prefers-reduced-motion`. No layout churn, no new dependencies — plain CSS
transitions/animations, consistent with the existing Tailwind `transition`
classes.

**Blocked by:** 08 — Check-off gesture replaces toggle-bought.

**Status:** ready-for-agent

- [ ] Adding an Item animates its row into the List (e.g. slide/fade-in).
- [ ] Checking off an Item animates its removal (e.g. fade/collapse out before it leaves).
- [ ] Suggestion chips respond on tap (press/active state).
- [ ] All animations are disabled or reduced under `prefers-reduced-motion`, and nothing depends on animation timing to function.
