// js/sync.js — Real-time sync engine via ntfy.sh (SSE).
// Configured from main.js; writes go through the injected `apply` actions so
// every mutation lands in IndexedDB exactly once, wherever it originated.

import * as db from "./db.js";

let getListName = () => "";
let peerId = "";
let disabled = true;
let onStatus = () => {};
let apply = null;
let eventSource = null;

export function configureSync(cfg) {
  getListName = cfg.getListName || getListName;
  peerId = cfg.peerId || peerId;
  disabled = cfg.disabled ?? disabled;
  onStatus = cfg.onStatus || onStatus;
  apply = cfg.apply || apply;
}

export function initSync() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  if (disabled) {
    onStatus("dev");
    return;
  }

  onStatus("connecting");
  const sseUrl = `https://ntfy.sh/${encodeURIComponent(getListName())}/sse?since=12h`;
  eventSource = new EventSource(sseUrl);

  eventSource.onopen = () => {
    onStatus("connected");
    publishAction({ type: "REQUEST_SYNC" });
  };

  eventSource.onerror = () => {
    onStatus("offline");
  };

  eventSource.onmessage = async (e) => {
    try {
      const ntfyData = JSON.parse(e.data);
      if (ntfyData.event !== "message" || !ntfyData.message) return;

      const action = JSON.parse(ntfyData.message);
      if (action.peerId === peerId) return;

      await handleRemoteAction(action);
    } catch (err) {}
  };
}

export async function publishAction(action) {
  if (disabled) return; // Prevent network requests during dev

  action.peerId = peerId;
  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(getListName())}`, {
      method: "POST",
      body: JSON.stringify(action),
    });
  } catch (err) {
    console.error("Publish error:", err);
  }
}

export async function handleRemoteAction(action) {
  const listName = getListName();

  if (action.type === "PUT_ITEM") {
    if (action.item.list !== listName) return;
    const products = await db.getAll("products", listName);
    if (!products.some((p) => p.id === action.item.productId)) {
      // Unknown Product: pull the full List state instead of storing a dangling Item.
      publishAction({ type: "REQUEST_SYNC" });
      return;
    }
    await apply.putItem(action.item, false);
  } else if (action.type === "DELETE_ITEM") {
    if (!action.id.startsWith(listName + "::")) return;
    await apply.deleteItem(action.id, false);
  } else if (action.type === "PUT_PRODUCT") {
    if (action.product.list !== listName) return;
    await apply.putProduct(action.product, false);
  } else if (action.type === "DELETE_PRODUCT") {
    if (!action.id.startsWith(listName + "::")) return;
    await apply.deleteProduct(action.id, false);
  } else if (action.type === "CLEAR_BOUGHT") {
    await apply.clearBought(false);
  } else if (action.type === "REQUEST_SYNC") {
    const [items, products] = await Promise.all([
      db.getAll("items", listName),
      db.getAll("products", listName),
    ]);
    publishAction({ type: "FULL_SYNC", items, products });
  } else if (action.type === "FULL_SYNC") {
    if (Array.isArray(action.items)) {
      for (const item of action.items) {
        if (item.list === listName) await apply.putItem(item, false);
      }
    }
    if (Array.isArray(action.products)) {
      for (const product of action.products) {
        if (product.list === listName) await apply.putProduct(product, false);
      }
    }
  }
}
