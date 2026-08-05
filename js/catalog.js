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

export async function resolveProduct(text) {
  const listName = getListName();
  const normalized = normalizeText(text);
  const products = await db.getAll("products", listName);

  const exact = products.find(
    (p) =>
      normalizeText(p.defaultSpelling) === normalized ||
      p.aliases.some((a) => normalizeText(a) === normalized),
  );
  if (exact) return exact;

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
  if (best && bestDist <= threshold) {
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
  };
  await apply.putProduct(product, true);
  return product;
}

export async function addOrReviveItem(product) {
  const listName = getListName();
  const items = await db.getAll("items", listName);
  const existing = items.find((i) => i.productId === product.id && !i.bought);
  if (existing) return;

  const bought = items.find((i) => i.productId === product.id && i.bought);
  if (bought) {
    bought.bought = false;
    bought.createdAt = Date.now();
    await apply.putItem(bought, true);
    return;
  }

  const item = {
    id: `${listName}::${uid("item_")}`,
    list: listName,
    productId: product.id,
    bought: false,
    createdAt: Date.now(),
  };
  await apply.putItem(item, true);
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
