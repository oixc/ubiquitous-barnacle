# 03 — Light UI animations

**What to build:** Subtle, fast motion makes the core actions feel responsive without getting in the way: an added Item slides into the List, toggling bought animates the strike-through/state change, clearing bought Items fades them out, and suggestion chips respond on tap. Motion is disabled for users who set `prefers-reduced-motion`. No layout churn, no new dependencies — plain CSS transitions/animations, consistent with the existing Tailwind `transition` classes.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Adding an Item animates its row into the List (e.g. slide/fade-in).
- [ ] Toggling bought animates the row's state change (strike-through and styling transition smoothly).
- [ ] Clearing bought Items animates them out before they are removed.
- [ ] All animations are disabled or reduced under `prefers-reduced-motion`, and nothing depends on animation timing to function.
