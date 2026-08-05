// js/backup.js — Backup (export) and restore (import) of a List's Catalog and
// Purchase history, as a single versioned JSON file. Local-only: an import
// writes to this device's IndexedDB and never broadcasts to Peers, so the
// shared Catalog stays authoritative and the ntfy sync budget is untouched.
// See docs/adr/0006-backup-export-import.md.

import * as db from "./db.js";
import { normalizeText } from "./catalog.js";

let getListName = () => "";
let uid = (prefix) => prefix;

export function configureBackup(cfg) {
  getListName = cfg.getListName || getListName;
  uid = cfg.uid || uid;
}

export const FORMAT_VERSION = 1;

function sanitizeFilename(name) {
  return String(name)
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-");
}

// --- Export ---
export async function buildExport() {
  const listName = getListName();
  const [products, history] = await Promise.all([
    db.getAll("products", listName),
    db.getAll("purchaseHistory", listName),
  ]);
  return {
    version: FORMAT_VERSION,
    exportedAt: Date.now(),
    list: listName,
    products,
    history,
  };
}

export function downloadBackup(data) {
  const date = new Date(data.exportedAt).toISOString().slice(0, 10);
  const name = `shopping-list-${sanitizeFilename(data.list)}-${date}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Import plan ---
function historyKey(productId, boughtAt, detail) {
  return `${productId}\u0000${boughtAt}\u0000${detail || ""}`;
}

// Plans the merge without writing anything. Imported Products dedupe against
// existing local Products by normalized default spelling — the existing one
// wins and the imported aliases/presets fold into it. Everything else is
// added, with IDs remapped to this List when the backup came from another.
export async function planImport(data) {
  const listName = getListName();
  const sameList = data.list === listName;
  const [existingProducts, existingHistory] = await Promise.all([
    db.getAll("products", listName),
    db.getAll("purchaseHistory", listName),
  ]);

  const existingBySpelling = new Map(
    existingProducts.map((p) => [normalizeText(p.defaultSpelling), p]),
  );
  const existingById = new Map(existingProducts.map((p) => [p.id, p]));

  const productIdMap = new Map();
  const productsToAdd = [];
  const merges = [];
  const seenSpelling = new Map();

  for (const p of data.products) {
    const norm = normalizeText(p.defaultSpelling);
    const match =
      existingBySpelling.get(norm) ||
      (sameList && existingById.get(p.id)) ||
      (seenSpelling.has(norm) ? { id: seenSpelling.get(norm) } : null);

    if (match) {
      productIdMap.set(p.id, match.id);
      if (match.aliases) {
        const aliasesToAdd = (p.aliases || []).filter(
          (a) =>
            !match.aliases.some(
              (x) => normalizeText(x) === normalizeText(a),
            ),
        );
        const presetsToAdd = (p.presets || []).filter(
          (d) => !(match.presets || []).includes(d),
        );
        merges.push({ product: match, aliasesToAdd, presetsToAdd });
      }
      continue;
    }

    const product = {
      ...p,
      list: listName,
      id: sameList ? p.id : `${listName}::${uid("prod_")}`,
      aliases: p.aliases || [],
      presets: p.presets || [],
    };
    productIdMap.set(p.id, product.id);
    productsToAdd.push(product);
    seenSpelling.set(norm, product.id);
  }

  const historyKeys = new Set(
    existingHistory.map((h) => historyKey(h.productId, h.boughtAt, h.detail)),
  );
  const historyToAdd = [];
  for (const h of data.history) {
    const productId = productIdMap.get(h.productId) || h.productId;
    const key = historyKey(productId, h.boughtAt, h.detail);
    if (historyKeys.has(key)) continue;
    historyKeys.add(key);
    historyToAdd.push({
      ...h,
      list: listName,
      id: sameList ? h.id : `${listName}::${uid("hist_")}`,
      productId,
    });
  }

  const aliasesToAdd = merges.reduce((n, m) => n + m.aliasesToAdd.length, 0);
  const presetsToAdd = merges.reduce((n, m) => n + m.presetsToAdd.length, 0);

  return {
    summary: {
      sourceList: data.list,
      targetList: listName,
      crossList: !sameList,
      productsToAdd: productsToAdd.length,
      productsMerged: merges.length,
      aliasesToAdd,
      presetsToAdd,
      historyToAdd: historyToAdd.length,
      historySkipped: data.history.length - historyToAdd.length,
    },
    productsToAdd,
    merges,
    historyToAdd,
  };
}

// Applies a plan returned by planImport. Local writes only.
export async function applyPlan(plan) {
  for (const m of plan.merges) {
    if (m.aliasesToAdd.length || m.presetsToAdd.length) {
      m.product.aliases.push(...m.aliasesToAdd);
      m.product.presets.push(...m.presetsToAdd);
      await db.put("products", m.product);
    }
  }
  for (const p of plan.productsToAdd) {
    await db.put("products", p);
  }
  for (const h of plan.historyToAdd) {
    await db.put("purchaseHistory", h);
  }
}
