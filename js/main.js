// js/main.js — Bootstrap, app state, and the app action layer.
// Owns listName/PEER_ID, coordinates db / sync / catalog / ui, and exposes
// the `actions` used by ui.js and injected into sync.js + catalog.js.

import * as db from "./db.js";
import * as sync from "./sync.js";
import * as catalog from "./catalog.js";
import * as ui from "./ui.js";

// --- Dev / Sync Toggle ---
const DISABLE_SYNC = true; // Set to false when ready to test real-time sync again

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
  ui.renderAll({ items, products, history, listName, view: currentView });
}

// --- User actions ---
async function addItem(text) {
  const product = await catalog.resolveProduct(text);
  if (product) await catalog.addOrReviveItem(product);
}

function changeList() {
  const newList = prompt("Enter list name:", listName);
  if (newList && newList.trim() !== listName) {
    listName = newList.trim();
    localStorage.setItem("pwa_grocery_list", listName);
    window.location.hash = `list=${listName}`;
    sync.initSync();
    renderAll();
  }
}

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
  changeList,
  copyInviteLink,

  putItem: async (item, broadcast = true) => {
    await db.put("items", item);
    if (broadcast) sync.publishAction({ type: "PUT_ITEM", item });
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
    await db.remove("products", id);
    if (broadcast) sync.publishAction({ type: "DELETE_PRODUCT", id });
    renderAll();
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
  toggleBought: async (id, bought) => {
    const items = await db.getAll("items", listName);
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const wasBought = item.bought;
    item.bought = bought;
    await actions.putItem(item, true);
    if (bought && !wasBought) {
      await actions.putHistory({
        id: `${listName}::${uid("hist_")}`,
        list: listName,
        productId: item.productId,
        boughtAt: Date.now(),
      });
    }
  },
  removeItem: (id) => actions.deleteItem(id, true),
};

// --- Wire up modules ---
sync.configureSync({
  getListName: () => listName,
  peerId: PEER_ID,
  disabled: DISABLE_SYNC,
  onStatus: (status) => ui.setSyncStatus(status),
  apply: actions,
});

catalog.configureCatalog({
  uid,
  getListName: () => listName,
  apply: actions,
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

  ui.init({ actions, showView });

  db.initDb()
    .then(() => {
      renderAll();
      sync.initSync();
    })
    .catch((err) => console.error("DB open failed:", err));
}

boot();

export { actions };

