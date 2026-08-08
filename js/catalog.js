// js/catalog.js — Product resolution, Item creation, restock stats, and
// typical purchase order.
// addText owns the text→Item flow (split, resolve, alias-confirm); restock
// prompts (ADR-0008) and typical purchase order (06) live here too. Ranking
// lives in js/recommendations.js.
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

// --- Restock stats (ADR-0008: interval from purchase gaps) ---

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
// to the previous event exceeds gapMs. Serves shopping trips (06) here; the
// ranking module keeps its own copy for adding sessions (09).
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
