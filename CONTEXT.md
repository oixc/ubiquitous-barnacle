# Shopping List

A shared grocery list for a small group (<10 people): one list, anyone who knows
its name can see and edit it, no accounts.

## Language

**List**:
The single shared shopping list, identified by its name. Knowing the name is the
only requirement to see and edit it — there is no membership or permission model.
_Avoid_: Room

**Item**:
A line on a List: one thing to buy, referencing a Product and displayed using the
Product's default spelling. Always to-buy — buying (checking off) removes it from
the List. Belongs to exactly one List and never moves between Lists.
_Avoid_: task, entry

**Check off**:
Buying an Item: tapping it removes it from the List, records a Purchase, and turns
its Product into a fresh suggestion. Removing an Item with the trash control is a
deletion, not a check-off — it records no Purchase.
_Avoid_: complete, done, tick

**Purchase**:
A single check-off recorded in the Purchase history, identified by its Product,
the time of the check-off, and the Detail. Removed from history when the Item is
undone within the Undo window.

**Undo**:
Re-adding an Item within the Undo window after its check-off — by typing, an
alias, or a suggestion chip. Undoing cancels the matching Purchase record, so
accidental check-offs do not pollute statistics.
_Avoid_: revive, un-check

**Undo window**:
The short span (10 minutes) after a check-off during which re-adding the same
Product counts as an Undo rather than a fresh need.

**Catalog**:
The List's shared vocabulary of Products, belonging to exactly one List and
shared by all its Peers. Basis for recommendations, frequency tracking, restock
prompts, and statistics.

**Product**:
A canonical thing that can be bought, identified by an internal ID independent
of any spelling. Has exactly one default spelling and any number of aliases.
_Avoid_: article, catalog item, good

**Alias**:
An alternative spelling that resolves to a Product. Typing an alias always
displays and records the Product's default spelling. A near-miss of a known
spelling becomes an alias only after the typist confirms ("did you mean …?");
truly novel text creates a new Product.

**Default spelling**:
The spelling shown everywhere a Product appears. Initially the first spelling
ever used; changed by renaming the Product, which applies for all Peers.

**Detail**:
An optional free-text qualifier an Item carries, beyond the Product: a quantity,
volume, weight, or brand ("2", "500 g", "Alpro"). Not part of the Product's
identity — the same Product can appear with different Details.
_Avoid_: amount, quantity (as the only kind)

**Preset**:
A Detail a Product offers as a one-tap choice when adding an Item. Up to four,
ordered by recency of use; the least recently used falls off when a new Detail
is learned. Presets are shared with the List like the Product itself; equal
spellings consolidate (e.g. "500g" matches "500 g").
_Avoid_: default (singular — clashes with "Default spelling")

**Purchase history**:
The device-local record of check-offs, derived from the shared message stream:
every observed check-off (own or a Peer's) lands in each Peer's history,
deduplicated by Product, time, and Detail. Undoing an Item cancels the matching
record. Because every Peer derives the same records from the same stream, the
histories converge without any dedicated sync.

**Restock prompt**:
A suggestion to re-add a Product that is due for restock — its restock interval
(learned from add-times and Purchase history) has elapsed since the last Purchase.
Due-based, not raw-frequency-based.

**Suggestion**:
A one-tap chip in the List's single suggestions strip that adds an Item. The
strip reorders itself by context — fresh check-offs during a trip, restock
prompts later, added-together companions while adding — and filters down as the
user types.
_Avoid_: recommendation, buy-again

**Added-together**:
Two Products that have been added to the List in the same adding session at least
three times. A just-added Item surfaces its added-together companions as
suggestions.

**Peer**:
An anonymous device participating in a List. No identity beyond the current
session; anyone who knows the List name is a Peer.
_Avoid_: user, member, account, sender

**Invite link**:
A URL that names a List. Opening it joins that List.

**Refresh**:
A Peer-initiated pull of the full List state — requesting every connected Peer
to send its current Items and Products. Manual; covers Peers offline longer
than the sync window and deliberate Catalog re-pulls.
_Avoid_: reload, re-sync

**Sync budget**:
The finite daily allowance of messages a List's Peers may publish to the shared
relay. Its conservation shapes which changes propagate in real time and which
are pulled on demand.

**Backup**:
A point-in-time file capturing a List's Catalog and Purchase history, named for
its source List. The only way to move Purchase history off a device.
_Avoid_: snapshot, save

**Restore**:
Applying a Backup to a List: Products merge by spelling (the List's existing
Product wins; the Backup's aliases and presets fold in), Purchase-history
records dedupe by identity, and nothing is broadcast to Peers.
_Avoid_: load
