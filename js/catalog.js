// js/catalog.js — Product resolution and Item creation/revive.
// Pure text-matching helpers plus the resolve/revive flow; writes broadcast
// through the injected `apply` actions.

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
  if (exact) return exact;

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
      if (!best.aliases.some((a) => normalizeText(a) === normalized)) {
        best.aliases.push(text);
        await apply.putProduct(best, true);
      }
      return best;
    }
  }

  const product = {
    id: `${listName}::${uid("prod_")}`,
    list: listName,
    defaultSpelling: text,
    aliases: [],
    presets: [],
  };
  await apply.putProduct(product, true);
  return product;
}

export async function addOrReviveItem(product, detail = "") {
  const listName = getListName();
  const items = await db.getAll("items", listName);
  const existing = items.find((i) => i.productId === product.id && !i.bought);
  if (existing) return;

  const bought = items.find((i) => i.productId === product.id && i.bought);
  if (bought) {
    bought.bought = false;
    bought.createdAt = Date.now();
    if (detail) bought.detail = canonicalizeDetail(product, detail);
    await apply.putItem(bought, true);
    if (ensurePreset(product, bought.detail)) await apply.putProduct(product, true);
    return;
  }

  const item = {
    id: `${listName}::${uid("item_")}`,
    list: listName,
    productId: product.id,
    bought: false,
    createdAt: Date.now(),
  };
  if (detail) item.detail = canonicalizeDetail(product, detail);
  await apply.putItem(item, true);
  if (ensurePreset(product, item.detail)) await apply.putProduct(product, true);
}

// Sets (or clears) an Item's Detail from the inline editor; canonicalizes
// against the Product's Presets and learns new Details as Presets.
export async function setItemDetail(item, product, detail) {
  item.detail = canonicalizeDetail(product, detail);
  await apply.putItem(item, true);
  if (ensurePreset(product, item.detail)) await apply.putProduct(product, true);
}

// --- Purchase suggestions (Restock prompts) ---
const SUGGEST_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const MIN_PURCHASES = 2;
const MAX_SUGGESTIONS = 5;

export function computeSuggestions({ products, items, history }) {
  const windowStart = Date.now() - SUGGEST_WINDOW_MS;

  const count = new Map();
  const lastBought = new Map();
  for (const h of history) {
    if (h.boughtAt < windowStart) continue;
    count.set(h.productId, (count.get(h.productId) || 0) + 1);
    const prev = lastBought.get(h.productId);
    if (prev === undefined || h.boughtAt > prev) {
      lastBought.set(h.productId, h.boughtAt);
    }
  }

  const onList = new Set(
    items.filter((i) => !i.bought).map((i) => i.productId),
  );
  const productById = new Map(products.map((p) => [p.id, p]));

  return [...count.entries()]
    .filter(([productId, times]) => {
      const product = productById.get(productId);
      return product && times >= MIN_PURCHASES && !onList.has(productId);
    })
    .map(([productId, times]) => ({
      product: productById.get(productId),
      count: times,
      lastBought: lastBought.get(productId),
    }))
    .sort(
      (a, b) => b.count - a.count || b.lastBought - a.lastBought,
    )
    .slice(0, MAX_SUGGESTIONS);
}
