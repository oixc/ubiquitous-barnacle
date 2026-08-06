// js/sync.js — Real-time sync engine via ntfy.sh (SSE).
// Configured from main.js; writes go through the injected `apply` actions so
// every mutation lands in IndexedDB exactly once, wherever it originated.
// Sync is on-demand to stay within ntfy.sh's free-tier budget: changes broadcast
// as they happen, but catch-up (FULL_SYNC) is only requested on a fresh join
// (empty local DB) or an explicit Refresh.

import * as db from "./db.js";

let getListName = () => "";
let peerId = "";
let enabled = true;
let status = "";
let onStatus = () => {};
let apply = null;
let eventSource = null;
// Fresh join requests catch-up at most once per page load, no matter how often
// the SSE connection reopens (each reconnect re-runs `onopen`).
let requestedOnce = false;
// Responses to a REQUEST_SYNC are deduped per (peerId, ts) so the 12h SSE replay
// on (re)connect can never make this peer answer the same request twice.
const lastResponded = new Map();

const COUNT_KEY = "pwa_grocery_msgcount";
const DATE_KEY = "pwa_grocery_msgdate";

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

// Per-device count of messages published today (resets at midnight UTC, like
// the relay's own limit). The free tier caps at 250 messages/day per IP.
export function getDailyCount() {
  if (localStorage.getItem(DATE_KEY) !== todayUTC()) return 0;
  return Number(localStorage.getItem(COUNT_KEY) || 0);
}

function bumpDailyCount() {
  const date = todayUTC();
  if (localStorage.getItem(DATE_KEY) !== date) {
    localStorage.setItem(DATE_KEY, date);
    localStorage.setItem(COUNT_KEY, "0");
  }
  localStorage.setItem(COUNT_KEY, String(getDailyCount() + 1));
}

export function isSyncEnabled() {
  return enabled;
}

function setStatus(s) {
  status = s;
  onStatus(s);
}

export function configureSync(cfg) {
  getListName = cfg.getListName || getListName;
  peerId = cfg.peerId || peerId;
  enabled = cfg.enabled ?? enabled;
  onStatus = cfg.onStatus || onStatus;
  apply = cfg.apply || apply;
}

export function setSyncEnabled(value) {
  value = !!value;
  if (value === enabled) return;
  enabled = value;
  if (enabled) {
    initSync();
  } else {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    setStatus("dev");
  }
}

export function initSync() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  if (!enabled) {
    setStatus("dev");
    return;
  }

  setStatus("connecting");
  const sseUrl = `https://ntfy.sh/${encodeURIComponent(getListName())}/sse?since=12h`;
  eventSource = new EventSource(sseUrl);

  eventSource.onopen = async () => {
    setStatus("connected");
    // The 12h replay covers short gaps; a full pull is only worth its message
    // cost when this device has nothing to go on (fresh join).
    const [items, products] = await Promise.all([
      db.getAll("items", getListName()),
      db.getAll("products", getListName()),
    ]);
    if (items.length === 0 && products.length === 0 && !requestedOnce) {
      requestedOnce = true;
      publishAction({ type: "REQUEST_SYNC", ts: Date.now() });
    }
  };

  eventSource.onerror = () => {
    setStatus("offline");
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
  if (!enabled) return; // Sync toggled off: local-only mode

  action.peerId = peerId;
  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(getListName())}`, {
      method: "POST",
      body: JSON.stringify(action),
    });
    if (res.status === 429) {
      setStatus("limited"); // Daily budget exhausted; clears at midnight UTC
    } else {
      bumpDailyCount();
      if (status === "limited") setStatus("connected");
    }
    return res.status;
  } catch (err) {
    console.error("Publish error:", err);
  }
}

export async function handleRemoteAction(action) {
  const listName = getListName();

  if (action.type === "PUT_ITEM") {
    if (action.item.list !== listName) return;
    // Coupled transport: PUT_ITEM carries its Product so the receiving Peer can
    // always render the Item without a separate Product message. No re-broadcast.
    if (action.product && action.product.list === listName) {
      await apply.putProduct(action.product, false);
    }
    const products = await db.getAll("products", listName);
    if (!products.some((p) => p.id === action.item.productId)) {
      // Unknown Product: pull the full List state instead of storing a dangling Item.
      publishAction({ type: "REQUEST_SYNC", ts: Date.now() });
      return;
    }
    await apply.putItem(action.item, false);
  } else if (action.type === "DELETE_ITEM") {
    if (!action.id.startsWith(listName + "::")) return;
    // Pass the carried snapshot so the receiving Peer can derive the purchase
    // event even for an Item it never stored (added + checked off while offline).
    await apply.deleteItem(action.id, false, {
      productId: action.productId,
      detail: action.detail || "",
      deletedAt: action.deletedAt,
    });
  } else if (action.type === "PUT_PRODUCT") {
    if (action.product.list !== listName) return;
    await apply.putProduct(action.product, false);
  } else if (action.type === "DELETE_PRODUCT") {
    if (!action.id.startsWith(listName + "::")) return;
    await apply.deleteProduct(action.id, false);
  } else if (action.type === "REQUEST_SYNC") {
    if (
      action.ts !== undefined &&
      lastResponded.get(action.peerId) === action.ts
    ) {
      return;
    }
    const [items, products] = await Promise.all([
      db.getAll("items", listName),
      db.getAll("products", listName),
    ]);
    publishAction({ type: "FULL_SYNC", items, products });
    if (action.ts !== undefined) lastResponded.set(action.peerId, action.ts);
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
