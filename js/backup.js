// js/backup.js — Backup (export) and restore (import) of a List's Catalog and
// event history (add + purchase events), as a single versioned JSON file.
// Local-only: an import writes to this device's IndexedDB and never broadcasts
// to Peers, so the shared Catalog stays authoritative and the ntfy sync budget
// is untouched. Format v2 (see docs/adr/0008): history is one `events` array.
// See docs/adr/0006-backup-export-import.md.

import * as db from "./db.js";
import { normalizeText } from "./catalog.js";

let getListName = () => "";
let uid = (prefix) => prefix;

export function configureBackup(cfg) {
  getListName = cfg.getListName || getListName;
  uid = cfg.uid || uid;
}

const FORMAT_VERSION = 2;

function sanitizeFilename(name) {
  return String(name)
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-");
}

// --- Export ---
export async function buildExport() {
  const listName = getListName();
  const [products, events] = await Promise.all([
    db.getAll("products", listName),
    db.getAll("events", listName),
  ]);
  return {
    version: FORMAT_VERSION,
    exportedAt: Date.now(),
    list: listName,
    products,
    events,
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

// Deterministic cross-List id remap: `<src>::<rest>` becomes `<dst>::<rest>`
// (a List-prefix swap, never a fresh uid). Event ids are derived from their
// Item id, so a re-import of the same backup collides and simply overwrites.
function remapListId(id, fromList, toList) {
  const prefix = fromList + "::";
  return id.startsWith(prefix) ? toList + "::" + id.slice(prefix.length) : id;
}

// Plans the merge without writing anything. Imported Products dedupe against
// existing local Products by normalized default spelling — the existing one
// wins and the imported aliases/presets fold into it. Events keep their derived
// ids (remapped by Item for cross-List imports) and dedupe against existing
// ids, so restoring the same file twice adds nothing.
async function planImport(data) {
  const listName = getListName();
  const sameList = data.list === listName;
  const [existingProducts, existingEvents] = await Promise.all([
    db.getAll("products", listName),
    db.getAll("events", listName),
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

  const existingEventIds = new Set(existingEvents.map((e) => e.id));
  const eventsToAdd = [];
  for (const ev of data.events) {
    const itemId = sameList
      ? ev.itemId
      : remapListId(ev.itemId, data.list, listName);
    const id = `${listName}::${ev.kind}::${itemId}`;
    if (existingEventIds.has(id)) continue;
    existingEventIds.add(id);
    eventsToAdd.push({
      ...ev,
      list: listName,
      id,
      itemId,
      productId: productIdMap.get(ev.productId) || ev.productId,
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
      eventsToAdd: eventsToAdd.length,
      eventsSkipped: data.events.length - eventsToAdd.length,
    },
    productsToAdd,
    merges,
    eventsToAdd,
  };
}

// Applies a plan returned by planImport. Local writes only.
async function applyPlan(plan) {
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
  for (const e of plan.eventsToAdd) {
    await db.put("events", e);
  }
}

// Orchestrates a restore from a backup file: parse, validate, plan, confirm,
// apply. Returns true when records were written so the caller can re-render.
// Local-only — nothing is broadcast to Peers.
export async function importFromFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (err) {
    alert("That file isn't a valid backup.");
    return false;
  }
  if (
    !data ||
    data.version !== FORMAT_VERSION ||
    typeof data.list !== "string" ||
    !Array.isArray(data.products) ||
    !Array.isArray(data.events)
  ) {
    alert("That file isn't a valid backup.");
    return false;
  }
  const plan = await planImport(data);
  const s = plan.summary;
  let msg = `Import backup from "${s.sourceList}" into "${s.targetList}"?\n\n`;
  if (s.crossList) {
    msg +=
      "This backup is from a different list — its records will be remapped to this list.\n\n";
  }
  msg +=
    `Catalog: ${s.productsToAdd} to add, ${s.productsMerged} already present ` +
    `(${s.aliasesToAdd} aliases, ${s.presetsToAdd} presets to fold in).\n` +
    `Events: ${s.eventsToAdd} to add, ${s.eventsSkipped} duplicates skipped.\n\n` +
    "Restoring is local — nothing is synced to other devices.";
  if (!confirm(msg)) return false;
  await applyPlan(plan);
  return true;
}
