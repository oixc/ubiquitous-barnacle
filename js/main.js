// js/main.js — Bootstrap, app state, and the app action layer.
// Owns listName/PEER_ID, coordinates db / sync / catalog / ui, and exposes
// the `actions` used by ui.js and injected into sync.js + catalog.js.

import * as db from "./db.js";
import * as sync from "./sync.js";
import * as catalog from "./catalog.js";
import * as backup from "./backup.js";
import * as ui from "./ui.js";

// --- Dev / Sync Toggle ---
const ENABLE_SYNC = false; // Shipped default; the in-app toggle overrides per device

// --- List & Peer Setup ---
const PEER_ID = "usr_" + Math.random().toString(36).substring(2, 9);

function uid(prefix) {
  return (
    prefix +
    Date.now() +
    "_" +
    Math.random().toString(36).substring(2, 6)
  );
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

function showView(view) {
  currentView = view;
  renderAll();
}

async function renderAll() {
  const [items, products, history] = await Promise.all([
    db.getAll("items", listName),
    db.getAll("products", listName),
    db.getAll("purchaseHistory", listName),
  ]);
  const suggestions = catalog.computeSuggestions({ products, items, history });
  ui.renderAll({
    items,
    products,
    history,
    suggestions,
    listName,
    view: currentView,
    dailyCount: sync.getDailyCount(),
    syncEnabled: sync.isSyncEnabled(),
  });
}

// --- User actions ---
async function addItem(text) {
  const { productText, detail, skipNearMiss } =
    await catalog.splitProductDetail(text);
  const { product, productChanged } = await catalog.resolveProduct(
    productText,
    skipNearMiss,
  );
  if (product) await catalog.addOrReviveItem(product, detail, productChanged);
}

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

// --- App actions (single write path for local UI, remote actions, and catalog) ---
const actions = {
  getListName: () => listName,
  addItem,
  matchProduct: catalog.matchProduct,
  addItemWithDetail: async (productId, detail) => {
    const products = await db.getAll("products", listName);
    const product = products.find((p) => p.id === productId);
    if (product) await catalog.addOrReviveItem(product, detail);
  },
  updateItemDetail: async (itemId, detail) => {
    const [items, products] = await Promise.all([
      db.getAll("items", listName),
      db.getAll("products", listName),
    ]);
    const item = items.find((i) => i.id === itemId);
    const product = item && products.find((p) => p.id === item.productId);
    if (item && product) await catalog.setItemDetail(item, product, detail);
  },
  changeList,
  copyInviteLink,
  refresh: () => sync.publishAction({ type: "REQUEST_SYNC", ts: Date.now() }),
  exportBackup: async () => {
    backup.downloadBackup(await backup.buildExport());
  },
  importBackup: async (file) => {
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (err) {
      alert("That file isn't a valid backup.");
      return;
    }
    if (
      !data ||
      data.version !== backup.FORMAT_VERSION ||
      typeof data.list !== "string" ||
      !Array.isArray(data.products) ||
      !Array.isArray(data.history)
    ) {
      alert("That file isn't a valid backup.");
      return;
    }
    const plan = await backup.planImport(data);
    const s = plan.summary;
    let msg = `Import backup from "${s.sourceList}" into "${s.targetList}"?\n\n`;
    if (s.crossList) {
      msg +=
        "This backup is from a different list — its records will be remapped to this list.\n\n";
    }
    msg +=
      `Catalog: ${s.productsToAdd} to add, ${s.productsMerged} already present ` +
      `(${s.aliasesToAdd} aliases, ${s.presetsToAdd} presets to fold in).\n` +
      `History: ${s.historyToAdd} to add, ${s.historySkipped} duplicates skipped.\n\n` +
      "Restoring is local — nothing is synced to other devices.";
    if (!confirm(msg)) return;
    await backup.applyPlan(plan);
    renderAll();
  },
  setSyncEnabled: (value) => {
    localStorage.setItem("pwa_grocery_sync", value ? "1" : "0");
    sync.setSyncEnabled(value);
    renderAll();
  },

  putItem: async (item, broadcast = true) => {
    await db.put("items", item);
    if (broadcast) {
      // Coupled transport: always attach the Item's Product so Peers can render
      // the Item (and its aliases/presets) without a separate Product message.
      const products = await db.getAll("products", listName);
      const product = products.find((p) => p.id === item.productId) || null;
      sync.publishAction({ type: "PUT_ITEM", item, product });
    }
    renderAll();
  },
  deleteItem: async (id, broadcast = true) => {
    await db.remove("items", id);
    if (broadcast) sync.publishAction({ type: "DELETE_ITEM", id });
    renderAll();
  },
  putProduct: async (product, broadcast = true) => {
    await db.put("products", product);
    if (broadcast) sync.publishAction({ type: "PUT_PRODUCT", product });
    renderAll();
  },
  deleteProduct: async (id, broadcast = true) => {
    if (broadcast) {
      const items = await db.getAll("items", listName);
      if (items.some((i) => i.productId === id)) {
        alert("This product is still on the list. Remove it from the list first.");
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
    if (broadcast) sync.publishAction({ type: "DELETE_PRODUCT", id });
    renderAll();
  },
  renameProduct: async (productId, newSpelling) => {
    const products = await db.getAll("products", listName);
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    product.defaultSpelling = newSpelling;
    await actions.putProduct(product, true);
  },
  deletePreset: async (productId, detail) => {
    const products = await db.getAll("products", listName);
    const product = products.find((p) => p.id === productId);
    if (!product || !product.presets) return;
    product.presets = product.presets.filter((p) => p !== detail);
    await actions.putProduct(product, true);
  },
  putHistory: async (record) => {
    await db.put("purchaseHistory", record);
    renderAll();
  },
  clearBought: async (broadcast = true) => {
    const items = await db.getAll("items", listName);
    const boughtIds = items.filter((i) => i.bought).map((i) => i.id);
    if (boughtIds.length === 0) return;
    if (
      broadcast &&
      !confirm(`Remove ${boughtIds.length} bought item(s) from the list?`)
    ) {
      return;
    }
    await db.removeMany("items", boughtIds);
    if (broadcast) sync.publishAction({ type: "CLEAR_BOUGHT" });
    renderAll();
  },
  toggleBought: async (id) => {
    const items = await db.getAll("items", listName);
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const wasBought = item.bought;
    item.bought = !wasBought;
    await actions.putItem(item, true);
    if (item.bought && !wasBought) {
      await actions.putHistory({
        id: `${listName}::${uid("hist_")}`,
        list: listName,
        productId: item.productId,
        detail: item.detail || "",
        boughtAt: Date.now(),
      });
    }
  },
  removeItem: (id) => actions.deleteItem(id, true),
  suggest: async (productId) => {
    const products = await db.getAll("products", listName);
    const product = products.find((p) => p.id === productId);
    if (product) await catalog.addOrReviveItem(product);
  },
};

// --- Wire up modules ---
sync.configureSync({
  getListName: () => listName,
  peerId: PEER_ID,
  enabled: ENABLE_SYNC && localStorage.getItem("pwa_grocery_sync") !== "0",
  onStatus: (status) => ui.setSyncStatus(status),
  apply: actions,
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

export { actions };

