# Shared learned Presets with Detail consolidation

Items carry an optional free-text **Detail** (quantity, volume, weight, brand).
Each Product offers up to four **Presets** — previously used Details shown as
one-tap choices when adding an Item — so common amounts don't need re-typing.

We store Presets **on the Product, synced to all Peers**, learned as a union:
typing a Detail not yet a Preset appends it (capped at 4, least recently used
evicted). We rejected deriving Presets per-device from local Purchase history
(fresh devices and new Peers would see nothing) and keeping them purely local
(each device's memory would diverge from the shared Catalog).

Detail text is consolidated before comparing: case folding, whitespace
collapse, and inserting a space between a digit and a letter, so `500g` and
`500  g` match the Preset `500 g`. Deliberately **no unit dictionary** — `g`
and `grams`, or `500 g` and `0.5 kg`, stay distinct — a full canonicalization
of measurements is out of scope for a shopping list.

Revive keeps the stored Detail of the previously bought Item rather than
forcing a new choice; free-text entry always remains available alongside the
chips. Purchase history records the Detail at buy time for future
recommendation logic, but nothing consumes it yet.
