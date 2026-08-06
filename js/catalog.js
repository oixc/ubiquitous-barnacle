// js/catalog.js — Product resolution, Item creation, and suggestion logic.
// Text-matching helpers, the resolve/add flow, restock prompts (ADR-0008),
// added-together sessions (09), soft-priority ranking (11), and undo
// classification. Reads IndexedDB directly; Product writes go through the
// injected `apply` actions.

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
export function normalizeDetail(str) {
  return normalizeText(str).replace(/(\d)([a-z])/g, "$1 $2");
}

const PRESET_CAP = 4;

// Returns the canonical Preset spelling for a Detail, or the raw Detail itself
// when no Preset consolidates to it.
export function canonicalizeDetail(product, detail) {
  const value = (detail || "").trim();
  if (!value) return "";
  const normalized = normalizeDetail(value);
  const existing = (product.presets || []).find(
    (p) => normalizeDetail(p) === normalized,
  );
  return existing || value;
}

// Registers a Detail as a Preset if it is new. Returns true when the Product
// changed so the caller can decide whether to persist it.
function ensurePreset(product, detail) {
  const canonical = canonicalizeDetail(product, detail);
  if (!canonical) return false;
  const presets = product.presets || (product.presets = []);
  if (presets.some((p) => p === canonical)) return false;
  presets.push(canonical);
  if (presets.length > PRESET_CAP) presets.splice(0, presets.length - PRESET_CAP);
  return true;
}

export function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

// Splits an input line into a Product part and a Detail part. The Product part
// is the longest known Product spelling (or alias) that is a word-boundary
// prefix; the remainder is the Detail. When no known Product matches a
// multi-word input, the whole line becomes a new Product and the input is
// treated as its exact spelling (skipNearMiss) — Details can only be attached
// once the Product is in the Catalog.
export async function splitProductDetail(text) {
  const trimmed = text.trim();
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2) {
    return { productText: trimmed, detail: "", skipNearMiss: false };
  }

  const products = await db.getAll("products", getListName());
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

export async function resolveProduct(text, skipNearMiss = false) {
  const exact = await matchProduct(text);
  if (exact) return { product: exact, productChanged: false };

  const listName = getListName();
  const normalized = normalizeText(text);
  const products = await db.getAll("products", listName);

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
  if (!skipNearMiss && best && bestDist <= threshold) {
    if (confirm(`Did you mean "${best.defaultSpelling}"?`)) {
      const changed = !best.aliases.some((a) => normalizeText(a) === normalized);
      if (changed) {
        best.aliases.push(text);
        // Persist locally; the change rides on the next Item broadcast.
        await apply.putProduct(best, false);
      }
      return { product: best, productChanged: changed };
    }
  }

  const product = {
    id: `${listName}::${uid("prod_")}`,
    list: listName,
    defaultSpelling: text,
    aliases: [],
    presets: [],
  };
  await apply.putProduct(product, false);
  return { product, productChanged: true };
}

export async function addItem(product, detail = "", productChanged = false) {
  const listName = getListName();
  const items = await db.getAll("items", listName);
  const existing = items.find((i) => i.productId === product.id);
  if (existing) {
    // No Item message will carry the Product, so product-only changes (e.g. a
    // freshly confirmed Alias) must broadcast on their own.
    if (productChanged) await apply.putProduct(product, true);
    return;
  }

  const item = {
    id: `${listName}::${uid("item_")}`,
    list: listName,
    productId: product.id,
    createdAt: Date.now(),
  };
  if (detail) {
    item.detail = canonicalizeDetail(product, detail);
    // Learn the Preset before the Item broadcast so it rides inside the
    // PUT_ITEM payload instead of a second Product message.
    if (ensurePreset(product, item.detail)) await apply.putProduct(product, false);
  }
  await apply.putItem(item, true);
}

// Sets (or clears) an Item's Detail from the inline editor; canonicalizes
// against the Product's Presets and learns new Details as Presets.
export async function setItemDetail(item, product, detail) {
  item.detail = canonicalizeDetail(product, detail);
  if (ensurePreset(product, item.detail)) await apply.putProduct(product, false);
  await apply.putItem(item, true);
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

// Median of the gaps between consecutive ascending timestamps; null when fewer
// than two timestamps give no gap at all.
export function medianGap(times) {
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
  const [events, products] = await Promise.all([
    db.getAll("events", listName),
    db.getAll("products", listName),
  ]);
  const product = products.find((p) => p.id === productId);
  if (!product) return;
  const purchases = events
    .filter((e) => e.kind === "purchase" && e.productId === productId)
    .map((e) => e.at);
  if (purchases.length === 0) return;
  product.lastPurchase = Math.max(...purchases);
  const interval = medianGap(purchases);
  if (interval == null) {
    delete product.restockInterval;
  } else {
    product.restockInterval = interval;
  }
  await apply.putProduct(product, false);
}

// Segments add events (sorted by `at`) into adding sessions: a new session
// starts when the gap to the previous add exceeds gapMs. Each Product
// contributes at most once per session (a same-session re-add never
// double-counts).
export function groupAddingSessions(addEvents, gapMs = SESSION_GAP_MS) {
  const sorted = [...addEvents].sort((a, b) => a.at - b.at);
  const sessions = [];
  let current = [];
  for (const e of sorted) {
    if (current.length && e.at - current[current.length - 1].at > gapMs) {
      sessions.push(current);
      current = [];
    }
    current.push(e);
  }
  if (current.length) sessions.push(current);
  return sessions;
}

// Counts how many adding sessions each pair of Products co-occurred in. The
// result maps every Product to its per-companion counts, so both orderings of a
// pair are stored under the two Products and no id-format parsing is needed.
export function coOccurrenceCounts(sessions) {
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

// Companion Products of `productId` that co-occurred with it in at least
// `minSessions` adding sessions, most-often-first (noise guard).
export function addedTogetherWith(
  productId,
  sessions,
  minSessions = MIN_COOCCUR_SESSIONS,
) {
  const row = coOccurrenceCounts(sessions).get(productId) || new Map();
  const companions = [];
  for (const [other, count] of row) {
    if (count >= minSessions) companions.push({ productId: other, count });
  }
  return companions.sort((a, b) => b.count - a.count);
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

// Context-aware suggestions (09 + 11). Three regimes, highest priority first:
//   pivot   — an Item added within the pivot window surfaces its added-together
//             companions (09); derived from the most recent add event so local
//             and remote adds both pivot, while an Undo re-add (which records
//             no event) never does. The triggering Item must still be on the
//             List — a check-off ends the pivot.
//   fresh   — check-offs within the trip window top the strip, newest first (11).
//   restock — restock-due Products (05) fill the rest and dominate when there
//             are no fresh check-offs or pivot companions.
// With no data each regime is empty and the ranking falls through to the next —
// a silent no-op. Co-occurrence counting only runs while a pivot is active.
// Returns { suggestions, expiresAt }: `expiresAt` is the soonest moment a
// visible regime lapses (so the caller can re-render), or null when the strip
// is static.
export function computeSuggestions({ products, items, events }) {
  const history = events || [];
  const onList = new Set(items.map((i) => i.productId));
  const productById = new Map(products.map((p) => [p.id, p]));
  const now = Date.now();

  const ranked = [];
  let expiresAt = null;

  const adds = history.filter((e) => e.kind === "add");
  const latestAdd = latestEvent(adds);
  if (
    latestAdd &&
    onList.has(latestAdd.productId) &&
    now - latestAdd.at <= PIVOT_WINDOW_MS
  ) {
    const companions = addedTogetherWith(
      latestAdd.productId,
      groupAddingSessions(adds),
    );
    for (const c of companions) {
      const product = productById.get(c.productId);
      if (!product || onList.has(c.productId)) continue;
      ranked.push({ product, kind: "pivot", count: c.count });
      expiresAt = latestAdd.at + PIVOT_WINDOW_MS;
    }
  }

  const fresh = history
    .filter((e) => e.kind === "purchase" && now - e.at <= TRIP_WINDOW_MS)
    .sort((a, b) => b.at - a.at);
  const freshByProduct = new Map();
  for (const e of fresh) {
    if (onList.has(e.productId) || freshByProduct.has(e.productId)) continue;
    freshByProduct.set(e.productId, e);
  }
  for (const e of freshByProduct.values()) {
    const product = productById.get(e.productId);
    if (!product) continue;
    ranked.push({ product, kind: "fresh", at: e.at });
    const freshEnd = e.at + TRIP_WINDOW_MS;
    if (!expiresAt || freshEnd < expiresAt) expiresAt = freshEnd;
  }

  const restock = products
    .filter((p) => {
      if (onList.has(p.id)) return false;
      if (!p.restockInterval || p.lastPurchase == null) return false;
      return now - p.lastPurchase >= p.restockInterval;
    })
    .map((p) => ({
      product: p,
      kind: "restock",
      interval: p.restockInterval,
      dueAt: p.lastPurchase + p.restockInterval,
    }))
    .sort((a, b) => a.dueAt - b.dueAt || a.interval - b.interval);

  // Dedupe across regimes (first occurrence wins — higher priority), cap total.
  const seen = new Set();
  const result = [];
  for (const s of [...ranked, ...restock]) {
    if (seen.has(s.product.id)) continue;
    seen.add(s.product.id);
    result.push(s);
    if (result.length >= MAX_SUGGESTIONS) break;
  }
  return { suggestions: result, expiresAt };
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
