# 03 — Sync state is saved per List

**What to build:** the drawer's Sync On/Off toggle currently remembers its state
device-wide, so turning Sync off on one List silences every other List on the same
device. After this, each List keeps its own Sync state: the toggle writes per List,
switching Lists applies the target List's own remembered state, and a List that was
never touched uses the shipped default. No migration — early development, no deployed
users.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Toggling Sync on or off persists per List, not device-wide.
- [ ] Switching Lists applies that List's remembered Sync state (a List with no saved state uses the shipped default).
- [ ] The per-device global Sync state no longer influences other Lists.
