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
Product's default spelling. Either to-buy or bought. Belongs to exactly one List
and never moves between Lists.
_Avoid_: task, entry

**Bought**:
The state of an Item someone has purchased. Bought items stay visible (struck
through) until cleared; they are the shelf of recurring staples.
_Avoid_: completed, done, checked

**Revive**:
Re-adding an Item — by any alias of its Product — returns the bought Item to
to-buy instead of creating a duplicate.

**Clearing**:
Removing all bought Items from the List at once. Cleared items remain in the
Purchase history.

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
The record of previously bought Items, kept after clearing, referencing Products
rather than raw text — so statistics are immune to spelling variation.

**Restock prompt**:
A suggestion to re-add a frequently bought Product.

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
