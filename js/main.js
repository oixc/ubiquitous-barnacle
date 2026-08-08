// js/main.js — Bootstrap, app state, and the app action layer.
// Owns listName/PEER_ID, coordinates db / sync / catalog / ui, and exposes two
// write faces via makeFace(announce): `actions` (local — persist + announce)
// used by ui.js and catalog.js, and `wire` (peer — persist only) used by
// sync.js.

import * as db from "./db.js";
import * as sync from "./sync.js";
import * as catalog from "./catalog.js";
import { computeRecommendations } from "./recommendations.js";
import * as backup from "./backup.js";
import * as ui from "./ui.js";

// --- Dev / Sync Toggle ---
const ENABLE_SYNC = false; // Shipped default; the in-app toggle overrides per device

// --- List & Peer Setup ---
const PEER_ID = "usr_" + Math.random().toString(36).substring(2, 9);

function uid(prefix) {
  return prefix + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
}

function getListFromUrl() {
  const hash = window.location.hash.replace("#", "");
  const params = new URLSearchParams(hash);
  return params.get("list");
}

let listName = getListFromUrl() || localStorage.getItem("pwa_grocery_list");
if (!listName) {
  listName = "grocery-" + Math.random().toString(36).substring(2, 8);
}
localStorage.setItem("pwa_grocery_list", listName);
window.location.hash = `list=${listName}`;

// --- Rendering ---
let currentView = "list";

// Re-renders when a recommendation context window (added-together pivot) lapses,
// so expired regimes leave the strip without waiting for the next user action.
// Reset on every render; null expiresAt schedules nothing.
let rankingRefreshTimer = null;

function scheduleRankingRefresh(expiresAt) {
  clearTimeout(rankingRefreshTimer);
  if (expiresAt == null) return;
  rankingRefreshTimer = setTimeout(() => renderAll(), Math.max(0, expiresAt - Date.now()));
}

function showView(view) {
  currentView = view;
  renderAll();
}

async function renderAll() {
  const [items, products, history, listActivity] = await Promise.all([
    db.getAll("items", listName),
    db.getAll("products", listName),
    db.getAll("events", listName),
    db.getListActivity(),
  ]);
  const { recommendations, expiresAt } = computeRecommendations({
    products,
    items,
    events: history,
  });
  const tripPositions = catalog.computeTripPositions(history);
  ui.renderAll({
    items,
    products,
    history,
    recommendations,
    tripPositions,
    listName,
    listActivity,
    view: currentView,
    dailyCount: sync.getDailyCount(),
    syncEnabled: sync.isSyncEnabled(),
  });
  scheduleRankingRefresh(expiresAt);
}

// --- User actions ---
function switchList(newList) {
  const trimmed = newList && newList.trim();
  if (!trimmed || trimmed === listName) return;
  listName = trimmed;
  localStorage.setItem("pwa_grocery_list", listName);
  window.location.hash = `list=${listName}`;
  sync.initSync();
  renderAll();
}

function changeList() {
  const newList = prompt("Enter list name:", listName);
  if (newList) switchList(newList);
}

window.addEventListener("hashchange", () => {
  const urlList = getListFromUrl();
  if (urlList) switchList(urlList);
});

function copyInviteLink() {
  const url =
    window.location.origin +
    window.location.pathname +
    "#list=" +
    encodeURIComponent(listName);
  navigator.clipboard.writeText(url).then(() => {
    alert("Invite link copied! Open this URL on your second device.");
  });
}

// --- Write path (single write path for local UI, remote actions, and catalog) ---
// One implementation per mutation; makeFace toggles the announce flag.
async function writeItem(item, product = null, announce = false) {
  const existing = await db.getById("items", item.id);
  const isNew = !existing;
  if (product) await db.put("products", product);
  await db.put("items", item);
  if (isNew) {
    // Add-event derivation (ADR-0008): a PUT_ITEM for an Item new to this
    // device always records an add event from the Item's createdAt. Derived
    // ids keep the 12h SSE replay / FULL_SYNC re-puts idempotent.
    await db.put("events", {
      id: `${listName}::add::${item.id}`,
      list: listName,
      kind: "add",
      itemId: item.id,
      productId: item.productId,
      detail: item.detail || "",
      at: item.createdAt,
    });
  }
  if (announce) {
    // Coupled transport (ADR-0005): PUT_ITEM always carries its Product so
    // Peers can render the Item (and its aliases/presets) without a separate
    // Product message. The caller supplies the Product it just persisted.
    sync.publishAction({ type: "PUT_ITEM", item, product });
  }
  renderAll();
}

async function writeProduct(product, announce = false) {
  await db.put("products", product);
  if (announce) sync.publishAction({ type: "PUT_PRODUCT", product });
  renderAll();
}

async function writeDelete(id, snapshot = null, announce = false) {
  // snapshot: { productId, detail, deletedAt } — the Item data carried by a
  // wire DELETE_ITEM, so a Peer can record the purchase event even for an
  // Item it never stored. deletedAt present only on check-offs.
  const item = await db.getById("items", id);
  const productId =
    (snapshot && snapshot.productId) || (item && item.productId);
  const detail = (snapshot && snapshot.detail) || (item && item.detail) || "";
  if (!item && !(snapshot && snapshot.productId)) return;
  const deletedAt = snapshot && snapshot.deletedAt;
  await db.remove("items", id);
  if (deletedAt != null) {
    // Purchase-event derivation (ADR-0008): a check-off DELETE_ITEM records a
    // purchase event from deletedAt. Plain removals record nothing.
    await db.put("events", {
      id: `${listName}::purchase::${id}`,
      list: listName,
      kind: "purchase",
      itemId: id,
      productId,
      detail,
      at: deletedAt,
    });
    // Restock stats live on the Product (ticket 05): refreshed only when a
    // purchase is recorded, so no per-render recompute. Local-only write — the
    // updated stats ride on the next Item broadcast like other Product edits.
    await catalog.refreshProductRestock(productId);
  }
  if (announce) {
    // DELETE_ITEM carries the Item snapshot; deletedAt is present only on
    // check-offs (buys), absent for plain removals (ADR-0007).
    const payload = {
      type: "DELETE_ITEM",
      id,
      productId,
      detail,
    };
    if (deletedAt != null) payload.deletedAt = deletedAt;
    sync.publishAction(payload);
  }
  renderAll();
}

async function writeDeleteProduct(id, announce = false) {
  if (announce) {
    const items = await db.getAll("items", listName);
    if (items.some((i) => i.productId === id)) {
      alert(
        "This product is still on the list. Remove it from the list first.",
      );
      return;
    }
    const products = await db.getAll("products", listName);
    const product = products.find((p) => p.id === id);
    if (!product) return;
    if (!confirm(`Delete "${product.defaultSpelling}" from the catalog?`)) {
      return;
    }
  }
  await db.remove("products", id);
  if (announce) sync.publishAction({ type: "DELETE_PRODUCT", id });
  renderAll();
}

// --- Write face factory ---
// The two faces differ only in whether they announce to Peers: `actions`
// (local) persists + derives + announces + renders, `wire` (remote)
// persists + derives + renders but never echoes.
function makeFace(announce) {
  return {
    putItem: (item, product) => writeItem(item, product, announce),
    putProduct: (product) => writeProduct(product, announce),
    deleteItem: (id, snapshot) => writeDelete(id, snapshot, announce),
    deleteProduct: (id) => writeDeleteProduct(id, announce),
  };
}

// --- Local face (used by ui.js and catalog.js) ---
async function getProduct(productId) {
  return db.getById("products", productId);
}

const actions = {
  ...makeFace(true),
  getListName: () => listName,
  addItem: (text) => catalog.addText(text),
  matchProduct: catalog.matchProduct,
  addItemWithDetail: async (productId, detail) => {
    const product = await getProduct(productId);
    if (product) await catalog.addItem(product, detail);
  },
  updateItemDetail: async (itemId, detail) => {
    const item = await db.getById("items", itemId);
    const product = item && (await getProduct(item.productId));
    if (item && product) await catalog.setItemDetail(item, product, detail);
  },
  changeList,
  switchList,
  copyInviteLink,
  refresh: () => sync.publishAction({ type: "REQUEST_SYNC", ts: Date.now() }),
  exportBackup: async () => {
    backup.downloadBackup(await backup.buildExport());
  },
  importBackup: async (file) => {
    if (await backup.importFromFile(file)) renderAll();
  },
  setSyncEnabled: (value) => {
    localStorage.setItem("pwa_grocery_sync", value ? "1" : "0");
    sync.setSyncEnabled(value);
    renderAll();
  },
  // Local-only product write (e.g. restock stats): persisted, never broadcast.
  persistProduct: (product) => writeProduct(product, false),
  checkOff: (id) => writeDelete(id, { deletedAt: Date.now() }, true),
  removeItem: (id) => writeDelete(id, null, true),
  renameProduct: async (productId, newSpelling) => {
    const product = await getProduct(productId);
    if (!product) return;
    product.defaultSpelling = newSpelling;
    await actions.putProduct(product);
  },
  deletePreset: async (productId, detail) => {
    const product = await getProduct(productId);
    if (!product) return;
    product.presets = product.presets.filter((p) => p !== detail);
    await actions.putProduct(product);
  },
  addRecommended: async (productId) => {
    const product = await getProduct(productId);
    if (product) await catalog.addItem(product);
  },
};

// --- Wire face (used by sync.js): persist + derive, never echo ---
const wire = makeFace(false);

// --- Wire up modules ---
sync.configureSync({
  getListName: () => listName,
  peerId: PEER_ID,
  enabled: ENABLE_SYNC && localStorage.getItem("pwa_grocery_sync") !== "0",
  onStatus: (status) => ui.setSyncStatus(status),
  apply: wire,
});

catalog.configureCatalog({
  uid,
  getListName: () => listName,
  apply: actions,
});

backup.configureBackup({
  uid,
  getListName: () => listName,
});

// --- Boot ---
function boot() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js")
        .then((reg) => console.log("SW Registered"))
        .catch((err) => console.error("SW Registration Failed:", err));
    });
  }

  ui.init({ actions, showView, renderAll });

  db.initDb()
    .then(() => {
      renderAll();
      sync.initSync();
    })
    .catch((err) => console.error("DB open failed:", err));
}

boot();
