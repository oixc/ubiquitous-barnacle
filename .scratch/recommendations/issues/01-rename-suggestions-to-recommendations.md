# 01 — Rename "suggestions" to "recommendations"

**What to build:** Adopt "recommendation" as the single word for the one-tap
chips in the List's strip, everywhere the app speaks or stores that concept.
"Suggestion" is gone from user-facing text, code identifiers, module exports,
and the domain glossary. Purely a rename — no behavioural change to what the
chips show, how they rank, or how they colour.

This is a **wide refactor**: the term fans across the ranking logic, the
rendering layer, the bootstrap wiring, and the docs. Do it as a single-pass
rename — one commit that renames everything and leaves the app working. There
are no external consumers, no tests to keep green, and no backwards-compat
guarantees, so the expand–contract dance of aliasing old names alongside new
ones is ceremony this repo doesn't need.

Update the docs in the same pass:

- `CONTEXT.md` — the glossary entry currently says to *avoid* "recommendation"
  while the Catalog description already uses it; resolve that contradiction in
  favour of "Recommendation".
- `AGENTS.md` — the "Suggestion ranking is a flat weighted score…" paragraph.
- `README.md` — feature prose, and the `### recommendations` seed todos
  (lines 41–44) once the trilogy lands.
- `docs/adr/0004` and `docs/adr/0007` — prose that names the feature.
- **Not** the gitignored mirrors (`lessons/`, `reference/`, `MISSION.md`) or
  historical tickets under other `.scratch/` folders — those are out of scope.

Since the service worker is cache-first, bump `APP_VERSION` in `js/version.js`
so installed clients fetch the renamed modules.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Code identifiers and exports use "recommendation" — no suggestion-named
      call sites remain (all `catalog.js`, `main.js`, `ui.js`, `index.html`
      sites).
- [ ] The DOM id, HTML comment, and the `add-suggested`/`suggest` action names
      use recommendation naming.
- [ ] Behaviour is identical before and after — same chips, same ordering,
      same colours, same tooltips, same ranking refresh timing.
- [ ] Domain glossary uses "Recommendation"; `CONTEXT.md`, `AGENTS.md`,
      `README.md`, and ADR-0004/0007 prose no longer contradict it; the
      `### recommendations` seed todos in README are gone.
- [ ] `APP_VERSION` bumped so installed clients pick up the renamed files.
