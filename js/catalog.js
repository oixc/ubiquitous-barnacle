// js/catalog.js — Product resolution, Item creation, and suggestion logic.
// addText owns the text→Item flow (split, resolve, alias-confirm); restock
// prompts (ADR-0008), added-together sessions (09), typical purchase order
// (06), soft-priority ranking (11), and undo classification live here too.
// Reads IndexedDB directly; Item/Product writes go through the injected
// `apply` actions.

import * as db from "./db.js";

let getListName = () => "";
let uid = (prefix) => prefix;
let apply = null;

export function configureCatalog(cfg) {
  getListName = cfg.getListName || getListName;
  uid = cfg.uid || uid;
  apply = cfg.apply || apply;
}

export function normalizeText(str) {
  return str.toLowerCase().replace(/\s+/g, " ").trim();
}

// Detail consolidation: case/whitespace folding plus a space between digit and
// letter, so "500g", "500  g" and "500 G" all read as "500 g". No unit
// dictionary: "g" and "grams" stay distinct.
function normalizeDetail(str) {
  return normalizeText(str).replace(/(\d)([a-z])/g, "$1 $2");
}

const PRESET_CAP = 4;

// Returns the canonical Preset spelling for a Detail, or the raw Detail itself
// when no Preset consolidates to it.
function canonicalizeDetail(product, detail) {
  const value = (detail || "").trim();
  if (!value) return "";
  const normalized = normalizeDetail(value);
  const existing = product.presets.find(
    (p) => normalizeDetail(p) === normalized,
  );
  return existing || value;
}

// Registers a Detail as a Preset if it is new.
function ensurePreset(product, detail) {
  const canonical = canonicalizeDetail(product, detail);
  if (!canonical) return;
  const presets = product.presets;
  if (presets.some((p) => p === canonical)) return;
  presets.push(canonical);
  if (presets.length > PRESET_CAP) presets.splice(0, presets.length - PRESET_CAP);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  return prev[b.length];
}

// Splits an input line into a Product part and a Detail part against an
// already-loaded Catalog (the caller reads once). The Product part is the
// longest known Product spelling (or alias) that is a word-boundary prefix;
// the remainder is the Detail. When no known Product matches a multi-word
// input, the whole line becomes a new Product and the input is treated as its
// exact spelling (skipNearMiss) — Details can only be attached once the
// Product is in the Catalog.
function splitProductDetail(text, products) {
  const trimmed = text.trim();
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2) {
    return { productText: trimmed, detail: "", skipNearMiss: false };
  }

  const known = new Set();
  for (const p of products) {
    known.add(normalizeText(p.defaultSpelling));
    for (const a of p.aliases) known.add(normalizeText(a));
  }

  for (let k = tokens.length; k >= 1; k--) {
    if (known.has(normalizeText(tokens.slice(0, k).join(" ")))) {
      return {
        productText: tokens.slice(0, k).join(" "),
        detail: tokens.slice(k).join(" "),
        skipNearMiss: false,
      };
    }
  }

  return { productText: trimmed, detail: "", skipNearMiss: true };
}

// Read-only exact match (used for live Preset chips). Never writes.
export async function matchProduct(text) {
  const listName = getListName();
  const normalized = normalizeText(text);
  const products = await db.getAll("products", listName);
  return (
    products.find(
      (p) =>
        normalizeText(p.defaultSpelling) === normalized ||
        p.aliases.some((a) => normalizeText(a) === normalized),
    ) || null
  );
}

// Closest known Product within the near-miss threshold (one edit for short
// text, two for longer), or null. Only asked when the input is not an exact
// known spelling.
function nearMatch(products, text) {
  const normalized = normalizeText(text);
  let best = null;
  let bestDist = Infinity;
  for (const p of products) {
    for (const spelling of [p.defaultSpelling, ...p.aliases]) {
      const dist = levenshtein(normalized, normalizeText(spelling));
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
  }
  const threshold = normalized.length < 5 ? 1 : 2;
  if (best && bestDist <= threshold) return best;
  return null;
}

// Builds a to-buy Item for a Product and optional Detail, canonicalizing the
// Detail against the Product's Presets and learning new Details as Presets
// (the Preset rides inside the PUT_ITEM's Product — ADR-0005).
function buildItem(product, detail) {
  const listName = getListName();
  const item = {
    id: `${listName}::${uid("item_")}`,
    list: listName,
    productId: product.id,
    createdAt: Date.now(),
  };
  if (detail) {
    item.detail = canonicalizeDetail(product, detail);
    ensurePreset(product, item.detail);
  }
  return item;
}

// Resolves a typed line (Product + optional Detail) into an Item on the List,
// reading the Catalog and the List once for the whole flow. Exact spelling
// wins; a near-miss of a known Product becomes an alias only after the typist
// confirms ("did you mean …?"); truly novel text creates a Product. The
// ADR-0005 branch — whether a Product change rides on the Item's PUT_ITEM or
// must broadcast on its own — is decided here, from whether the Item is
// already on the List.
export async function addText(text) {
  const listName = getListName();
  const [products, items] = await Promise.all([
    db.getAll("products", listName),
    db.getAll("items", listName),
  ]);

  const { productText, detail, skipNearMiss } = splitProductDetail(
    text,
    products,
  );

  let product = products.find(
    (p) =>
      normalizeText(p.defaultSpelling) === normalizeText(productText) ||
      p.aliases.some((a) => normalizeText(a) === normalizeText(productText)),
  );
  let productChanged = false;
  if (!product) {
    const near = skipNearMiss ? null : nearMatch(products, productText);
    if (near && confirm(`Did you mean "${near.defaultSpelling}"?`)) {
      product = near;
      productChanged = !product.aliases.some(
        (a) => normalizeText(a) === normalizeText(productText),
      );
      if (productChanged) product.aliases.push(productText);
    } else {
      product = {
        id: `${listName}::${uid("prod_")}`,
        list: listName,
        defaultSpelling: productText,
        aliases: [],
        presets: [],
      };
      productChanged = true;
    }
  }

  if (items.some((i) => i.productId === product.id)) {
    // No Item message will carry the Product, so a product-only change (a
    // freshly confirmed Alias) must broadcast on its own (ADR-0005).
    if (productChanged) await apply.putProduct(product);
    return;
  }

  await apply.putItem(buildItem(product, detail), product);
}

export async function addItem(product, detail = "") {
  const listName = getListName();
  const items = await db.getAll("items", listName);
  if (items.some((i) => i.productId === product.id)) return;
  await apply.putItem(buildItem(product, detail), product);
}

// Sets (or clears) an Item's Detail from the inline editor; canonicalizes
// against the Product's Presets and learns new Details as Presets.
export async function setItemDetail(item, product, detail) {
  item.detail = canonicalizeDetail(product, detail);
  ensurePreset(product, item.detail);
  await apply.putItem(item, product);
}

// --- Restock prompts (ADR-0008: interval from purchase gaps) ---
const MAX_SUGGESTIONS = 20;
const UNDO_WINDOW_MS = 10 * 60 * 1000;

// --- Added-together (09): co-occurrence over adding sessions ---
// Adds are segmented into adding sessions (bursts separated by a time gap) and
// a pair of Products qualifies as added-together only after co-occurring in at
// least MIN_COOCCUR_SESSIONS sessions (noise guard). The trip window (11) is
// the span after a check-off during which the Product stays a fresh suggestion.
const SESSION_GAP_MS = 30 * 60 * 1000;
const MIN_COOCCUR_SESSIONS = 3;
const PIVOT_WINDOW_MS = 2 * 60 * 1000;
const TRIP_WINDOW_MS = 60 * 60 * 1000;

// Score fusion (02) — tuning knobs. Each signal normalizes to 0..1 and mixes
// into one flat weighted score; the weights are constant (no context gate, the
// pivot is naturally 0 outside its window because no companions exist then).
// PIVOT_SATURATION is the companion count at which the pivot term saturates.
const PIVOT_WEIGHT = 1.0;
const FRESH_WEIGHT = 0.7;
const RESTOCK_WEIGHT = 0.6;
const PIVOT_SATURATION = 6;

// Median of an array of values (mean of the two central values on an even
// count); null for an empty array.
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

// Median of the gaps between consecutive ascending timestamps; null when fewer
// than two timestamps give no gap at all. Deliberately keeps the upper-middle
// gap on an even count (restock intervals predate the shared `median` helper).
function medianGap(times) {
  const sorted = [...times].sort((a, b) => a - b);
  if (sorted.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i] - sorted[i - 1]);
  }
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

// Recomputes a Product's restock stats from its purchase events and persists
// them on the Product (locally, no broadcast — the change rides on the next
// Item broadcast like other Product edits). Strictly purchase-driven: called
// only when a purchase is recorded, never per render.
export async function refreshProductRestock(productId) {
  const listName = getListName();
  const [events, product] = await Promise.all([
    db.getAll("events", listName),
    db.getById("products", productId),
  ]);
  if (!product) return;
  const purchases = events
    .filter((e) => e.kind === "purchase" && e.productId === productId)
    .map((e) => e.at);
  if (purchases.length === 0) return;
  product.lastPurchase = Math.max(...purchases);
  const interval = medianGap(purchases);
  if (interval == null) delete product.restockInterval;
  else product.restockInterval = interval;
  await apply.persistProduct(product);
}

// --- Typical purchase order (06) ---
// The to-buy List is sorted by each Product's typical position within a shopping
// trip, learned from purchase events. Purchases are segmented into trips by a
// time gap; a Product's position in a trip is its first check-off index
// normalized to [0,1), and its typical position is the median across the trips
// it appears in. Only Products bought in at least MIN_TRIPS_FOR_POSITION trips
// count as learned; the rest fall back to recency, appended after the learned
// ones (the UI owns the sort).
const TRIP_SEGMENT_GAP_MS = 60 * 60 * 1000;
const MIN_TRIPS_FOR_POSITION = 2;

// Map<productId, normalized median position> for Products learned across
// MIN_TRIPS_FOR_POSITION trips; Products absent from the Map are unlearned.
export function computeTripPositions(events) {
  const purchases = (events || []).filter((e) => e.kind === "purchase");
  const trips = segmentEvents(purchases, TRIP_SEGMENT_GAP_MS);

  const samples = new Map(); // productId -> number[] of normalized positions
  for (const trip of trips) {
    const order = [];
    const seen = new Set();
    for (const e of trip) {
      if (seen.has(e.productId)) continue; // first check-off in a trip wins
      seen.add(e.productId);
      order.push(e.productId);
    }
    if (order.length < 2) continue; // a single-product trip orders nothing
    const size = order.length;
    order.forEach((productId, index) => {
      const arr = samples.get(productId) || [];
      arr.push(index / size);
      samples.set(productId, arr);
    });
  }

  const positions = new Map();
  for (const [productId, values] of samples) {
    if (values.length < MIN_TRIPS_FOR_POSITION) continue;
    positions.set(productId, median(values));
  }
  return positions;
}

// Segments events (sorted by `at`) into bursts: a new burst starts when the gap
// to the previous event exceeds gapMs. Shared by adding sessions (09) and
// shopping trips (06); consumers do their own per-burst processing.
function segmentEvents(events, gapMs) {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const bursts = [];
  let current = [];
  for (const e of sorted) {
    if (current.length && e.at - current[current.length - 1].at > gapMs) {
      bursts.push(current);
      current = [];
    }
    current.push(e);
  }
  if (current.length) bursts.push(current);
  return bursts;
}

// Counts how many adding sessions each pair of Products co-occurred in. The
// result maps every Product to its per-companion counts, so both orderings of a
// pair are stored under the two Products and no id-format parsing is needed.
function coOccurrenceCounts(sessions) {
  const counts = new Map();
  for (const session of sessions) {
    const products = [...new Set(session.map((e) => e.productId))];
    for (let i = 0; i < products.length; i++) {
      for (let j = i + 1; j < products.length; j++) {
        for (const [a, b] of [
          [products[i], products[j]],
          [products[j], products[i]],
        ]) {
          let row = counts.get(a);
          if (!row) {
            row = new Map();
            counts.set(a, row);
          }
          row.set(b, (row.get(b) || 0) + 1);
        }
      }
    }
  }
  return counts;
}

// Pivot companions for the whole current adding session: the union of every
// on-List session Item's added-together companions (noise guard per pair), each
// companion once. A companion reachable via several session Items reports the
// rounded average of its per-Item co-occurrence counts and ranks among pivot
// chips by that average, highest first.
function sessionPivotCompanions(session, onList, productById, sessions) {
  const counts = coOccurrenceCounts(sessions);
  const sessionProductIds = [...new Set(session.map((e) => e.productId))];
  const byCompanion = new Map();
  for (const sessionProductId of sessionProductIds) {
    if (!onList.has(sessionProductId)) continue;
    const row = counts.get(sessionProductId) || new Map();
    for (const [companion, count] of row) {
      if (count < MIN_COOCCUR_SESSIONS || onList.has(companion)) continue;
      const arr = byCompanion.get(companion) || [];
      arr.push(count);
      byCompanion.set(companion, arr);
    }
  }
  const companions = [];
  for (const [companion, countsPerSource] of byCompanion) {
    const product = productById.get(companion);
    if (!product) continue;
    const avg =
      countsPerSource.reduce((a, b) => a + b, 0) / countsPerSource.length;
    companions.push({ product, count: Math.round(avg), avg });
  }
  return companions.sort((a, b) => b.avg - a.avg);
}

// Latest event satisfying `match` (any when omitted), or null.
function latestEvent(events, match) {
  let latest = null;
  for (const e of events) {
    if (match && !match(e)) continue;
    if (!latest || e.at > latest.at) latest = e;
  }
  return latest;
}

// Gets a product's signal row, creating it with the Product when first touched.
function signalRow(signals, product) {
  let row = signals.get(product.id);
  if (!row) {
    row = { product };
    signals.set(product.id, row);
  }
  return row;
}

// Score-fused suggestions (09 + 11 + 02). Signals normalize to 0..1 and mix
// into one flat weighted score — no hard tiers, no context gate.
// Returns { suggestions, expiresAt }: `expiresAt` is the soonest moment a
// visible signal lapses (so the caller can re-render), or null when the strip
// is static.
export function computeSuggestions({ products, items, events }) {
  const history = events || [];
  const onList = new Set(items.map((i) => i.productId));
  const productById = new Map(products.map((p) => [p.id, p]));
  const now = Date.now();

  const signals = new Map();
  let expiresAt = null;

  const pivotExpiry = gatherPivotSignals(signals, history, onList, productById, now);
  if (pivotExpiry != null) expiresAt = pivotExpiry;

  const freshExpiry = gatherFreshSignals(signals, history, onList, productById, now);
  if (freshExpiry != null && (expiresAt == null || freshExpiry < expiresAt)) {
    expiresAt = freshExpiry;
  }

  gatherRestockSignals(signals, products, onList, now);

  return { suggestions: rankSuggestions(signals, now), expiresAt };
}

// Pivot companions: co-occurring Products in the current adding session.
function gatherPivotSignals(signals, history, onList, productById, now) {
  const adds = history.filter((e) => e.kind === "add");
  const latestAdd = latestEvent(adds);
  if (!latestAdd || now - latestAdd.at > PIVOT_WINDOW_MS) return null;
  const sessions = segmentEvents(adds, SESSION_GAP_MS);
  const session = sessions.find((burst) => burst.includes(latestAdd));
  if (!session.some((e) => onList.has(e.productId))) return null;
  for (const c of sessionPivotCompanions(session, onList, productById, sessions)) {
    signalRow(signals, c.product).pivot = c.count;
  }
  return latestAdd.at + PIVOT_WINDOW_MS;
}

// Fresh check-offs: recent purchases within the trip window.
function gatherFreshSignals(signals, history, onList, productById, now) {
  let expiresAt = null;
  const fresh = history
    .filter((e) => e.kind === "purchase" && now - e.at <= TRIP_WINDOW_MS)
    .sort((a, b) => b.at - a.at);
  for (const e of fresh) {
    if (onList.has(e.productId)) continue;
    const product = productById.get(e.productId);
    if (!product) continue;
    const row = signalRow(signals, product);
    if (row.freshAt == null) {
      row.freshAt = e.at;
      const freshEnd = e.at + TRIP_WINDOW_MS;
      if (!expiresAt || freshEnd < expiresAt) expiresAt = freshEnd;
    }
  }
  return expiresAt;
}

// Restock-due Products.
function gatherRestockSignals(signals, products, onList, now) {
  for (const p of products) {
    if (onList.has(p.id)) continue;
    if (!p.restockInterval || p.lastPurchase == null) continue;
    if (now - p.lastPurchase < p.restockInterval) continue;
    const row = signalRow(signals, p);
    row.restockInterval = p.restockInterval;
    row.restockDueAt = p.lastPurchase + p.restockInterval;
  }
}

// Normalize, score, sort, truncate.
function rankSuggestions(signals, now) {
  const normalized = (row) => ({
    pivot: row.pivot == null ? 0 : Math.min(1, row.pivot / PIVOT_SATURATION),
    fresh:
      row.freshAt == null
        ? 0
        : Math.max(0, 1 - (now - row.freshAt) / TRIP_WINDOW_MS),
    restock:
      row.restockDueAt == null
        ? 0
        : Math.min(1, (now - row.restockDueAt) / row.restockInterval),
  });

  const reasonsFor = (row) => {
    const reasons = [];
    if (row.pivot != null) reasons.push({ kind: "pivot", count: row.pivot });
    if (row.freshAt != null) reasons.push({ kind: "fresh", at: row.freshAt });
    if (row.restockDueAt != null) {
      reasons.push({
        kind: "restock",
        interval: row.restockInterval,
        dueAt: row.restockDueAt,
      });
    }
    return reasons;
  };

  const built = [];
  for (const row of signals.values()) {
    const n = normalized(row);
    const weighted = {
      pivot: n.pivot * PIVOT_WEIGHT,
      fresh: n.fresh * FRESH_WEIGHT,
      restock: n.restock * RESTOCK_WEIGHT,
    };
    const reasons = reasonsFor(row);
    const best = Math.max(weighted.pivot, weighted.fresh, weighted.restock);
    let kind = "restock";
    if (best > 0) {
      if (weighted.pivot === best) kind = "pivot";
      else if (weighted.fresh === best) kind = "fresh";
    }
    built.push({
      suggestion: {
        product: row.product,
        kind,
        score: weighted.pivot + weighted.fresh + weighted.restock,
        reasons,
      },
      strongest: best,
    });
  }

  built.sort(
    (a, b) =>
      b.suggestion.score - a.suggestion.score ||
      b.suggestion.reasons.length - a.suggestion.reasons.length ||
      b.strongest - a.strongest ||
      a.suggestion.product.defaultSpelling.localeCompare(
        b.suggestion.product.defaultSpelling,
      ),
  );
  return built.map((b) => b.suggestion).slice(0, MAX_SUGGESTIONS);
}

// Undo classification (ADR-0008): re-adding a Product whose most recent purchase
// event lies inside the 10-minute Undo window cancels that purchase event. The
// paired add event (matched by the purchase's Item) is kept — "last added" shows
// the last independent add, and an undo re-add records no event itself, so the
// timestamp never moves and an on-list Product never reads "never added".
// Runs in the item-add write path, so local and remote re-adds both cancel; a
// genuine double-buy undercounts by one by design. Returns true when an Undo
// happened, so the caller can skip recording a fresh add event for the re-added
// Item.
export async function cancelUndoIfFresh(productId) {
  const listName = getListName();
  const events = await db.getAll("events", listName);
  const latest = latestEvent(
    events,
    (e) => e.kind === "purchase" && e.productId === productId,
  );
  if (!latest || Date.now() - latest.at > UNDO_WINDOW_MS) return false;
  await db.remove("events", latest.id);
  return true;
}
