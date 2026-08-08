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
Buying an Item: tapping it removes it from the List and records a Purchase.
Removing an Item with the trash control is a deletion, not a check-off — it
records no Purchase.
_Avoid_: complete, done, tick

**Purchase**:
A single check-off recorded in the event history as a purchase event,
identified by its Product, the time of the check-off, and the Detail.

**Add event**:
The event-history record of an Item being added to the List, timestamped at the
Item's creation. Identified by its Item. Basis for restock intervals and
added-together sessions.

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

**Event history**:
The device-local record of adds and purchases, derived from the shared message
stream: every observed new Item (a `PUT_ITEM`) records an add event and every
observed check-off records a purchase event, each deduplicated by Item. Because
every Peer derives the same events from the same stream, the histories converge
without any dedicated sync.
_Avoid_: Purchase history (singular)

**Restock prompt**:
A recommendation to re-add a Product that is due for restock — its restock interval
(learned from purchase events) has elapsed since the last Purchase. Due-based,
not raw-frequency-based.

**Recommendation**:
A one-tap chip in the List's single recommendations strip that adds an Item. Each
signal — added-together companions, restock prompts — normalizes to a 0..1
strength and mixes into one flat weighted score, so a Product can be recommended
for several reasons at once; the chip's tooltip lists every reason that fired,
its colour reflects the dominant one — except that a due restock prompt always
takes the restock colour over the pivot — and the strip filters down as the user
types.
_Avoid_: suggestion, buy-again

**Added-together**:
Two Products that have been added to the List in the same adding session at least
three times. Adding surfaces the union of the current adding session's on-List
Items' added-together companions as recommendations.

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
A point-in-time file capturing a List's Catalog and event history, named for its
source List. The only way to move event history off a device.
_Avoid_: snapshot, save

**Restore**:
Applying a Backup to a List: Products merge by spelling (the List's existing
Product wins; the Backup's aliases and presets fold in), event-history records
dedupe by event identity, and nothing is broadcast to Peers.
_Avoid_: load
