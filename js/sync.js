// js/sync.js — Real-time sync engine via ntfy.sh (SSE).
// Configured from main.js; writes go through the injected `apply` actions so
// every mutation lands in IndexedDB exactly once, wherever it originated.
// Sync is on-demand to stay within ntfy.sh's free-tier budget: changes broadcast
// as they happen, but catch-up (FULL_SYNC) is only requested on a fresh join
// (empty local DB) or an explicit Refresh.

import * as db from "./db.js";

let getListName = () => "";
let peerId = "";
let getEnabled = () => true;
let status = "";
let onStatus = () => {};
let apply = null;
let eventSource = null;
// Fresh join requests catch-up at most once per page load per List, no matter
// how often the SSE connection reopens (each reconnect re-runs `onopen`) or how
// many Lists a page session visits.
let requestedOnceFor = "";
// Responses to a REQUEST_SYNC are deduped per (peerId, ts) so the 12h SSE replay
// on (re)connect can never make this peer answer the same request twice.
const lastResponded = new Map();
// The relay treats message bodies over this size as file attachments instead
// of plain messages (silently breaking the JSON protocol), so publishes are
// refused here, before any bytes are sent.
const MAX_MESSAGE_BYTES = 4096;
// A reconnect broadcast repeats the full List state; this throttles it so a
// flapping SSE connection cannot burn the daily message budget. Pending
// removal tombstones always retry, regardless of the last broadcast.
const BROADCAST_THROTTLE_MS = 60 * 1000;
let lastBroadcastAt = 0;

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
  return getEnabled();
}

function setStatus(s) {
  status = s;
  onStatus(s);
}

export function configureSync(cfg) {
  getListName = cfg.getListName || getListName;
  peerId = cfg.peerId || peerId;
  getEnabled = cfg.getEnabled || getEnabled;
  onStatus = cfg.onStatus || onStatus;
  apply = cfg.apply || apply;
}

export function setSyncEnabled(value) {
  // Persistence is the caller's job; here we only start or stop the engine.
  if (value) {
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

  if (!getEnabled()) {
    setStatus("dev");
    return;
  }

  // "limited" is sticky (only a 2xx clears it), so don't mask it with a
  // transient "connecting" either.
  if (status !== "limited") setStatus("connecting");
  const sseUrl = `https://ntfy.sh/${encodeURIComponent(getListName())}/sse?since=12h`;
  eventSource = new EventSource(sseUrl);

  eventSource.onopen = async () => {
    // A live SSE connection proves the relay is reachable, but it must not
    // displace a "limited" status — only a 2xx publish clears the daily-quota
    // state (ADR-0009 budget honesty).
    if (status !== "limited") setStatus("connected");
    // Reconnect convergence (ADR-0009): on connect with local state — or
    // pending removal tombstones — broadcast the current Items + Products +
    // removals so every Peer converges, including changes made while offline
    // or with Sync off. Throttled so a flapping connection can't burn the
    // daily budget; pending tombstones always retry.
    const listName = getListName();
    const [items, products, removals] = await Promise.all([
      db.getAll("items", listName),
      db.getAll("products", listName),
      db.getAll("tombstones", listName),
    ]);
    if (
      items.length === 0 &&
      products.length === 0 &&
      removals.length === 0
    ) {
      // Fresh join: nothing to share; the 12h replay + a full pull covers it.
      // A full pull is only worth its message cost when this device has
      // nothing to go on, and only once per page load per List.
      if (requestedOnceFor !== listName) {
        requestedOnceFor = listName;
        publishAction({ type: "REQUEST_SYNC", ts: Date.now() });
      }
      return;
    }
    if (
      removals.length === 0 &&
      Date.now() - lastBroadcastAt < BROADCAST_THROTTLE_MS
    ) {
      return;
    }
    const res = await publishAction({
      type: "STATE_SYNC",
      items,
      products,
      removals,
    });
    if (res && res.ok) {
      lastBroadcastAt = Date.now();
      await Promise.all(removals.map((r) => db.remove("tombstones", r.id)));
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
  if (!getEnabled()) return { ok: false, reason: "disabled" }; // Sync toggled off

  action.peerId = peerId;
  const body = JSON.stringify(action);
  const byteSize = new Blob([body]).size;
  // Refuse oversize publishes before sending: the relay would silently treat
  // the body as a file attachment instead of a JSON message. Not counted
  // against the daily budget, and surfaced as a visible status.
  if (byteSize > MAX_MESSAGE_BYTES) {
    console.error(
      `Publish refused: ${byteSize} bytes exceeds the ${MAX_MESSAGE_BYTES}-byte relay cap`,
    );
    // "limited" (daily quota) is sticky: a lesser failure never displaces it.
    if (status !== "limited") setStatus("too-large");
    return { ok: false, reason: "too-large" };
  }

  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(getListName())}`, {
      method: "POST",
      body,
    });
    if (res.ok) {
      bumpDailyCount();
      // Only a 2xx counts as sent and clears a publish-failure status; a
      // rejected publish never does.
      if (publishFailureStatuses.has(status)) setStatus("connected");
      return { ok: true, status: res.status };
    }
    if (res.status === 429) {
      // Distinguish the burst request limit (bucket of 60, refills 1/5s) from
      // the daily message quota (resets at midnight UTC) via the relay's
      // error code in the JSON body.
      if (status !== "limited") {
        const code = await readErrorCode(res);
        setStatus(code === 42901 ? "burst" : "limited");
      }
    } else {
      // Any other rejection (e.g. 413 too large, 4xx/5xx) is surfaced rather
      // than silently treated as success. A rejection never clears a "limited"
      // status — only a 2xx does.
      console.error("Publish rejected:", res.status, res.statusText);
      if (status !== "limited") setStatus("publish-error");
    }
    return { ok: false, status: res.status };
  } catch (err) {
    // Network-level failure: surface in the status, not just the console.
    console.error("Publish error:", err);
    if (status !== "limited") setStatus("offline");
    return { ok: false, reason: "network" };
  }
}

async function readErrorCode(res) {
  try {
    const data = await res.json();
    return data && data.code;
  } catch {
    return null;
  }
}

// Statuses a successful publish may clear back to "connected". "offline" and
// "dev" are deliberately excluded — they reflect the SSE connection / toggle,
// not the last publish.
const publishFailureStatuses = new Set(["limited", "burst", "too-large", "publish-error"]);

// Remember a removal whose DELETE_ITEM never reached Peers (sync off, offline,
// rate-limited, or rejected). Flushed to the topic on the next reconnect
// broadcast (STATE_SYNC) once that publish succeeds. `list` is passed in by
// the caller so the tombstone is scoped to the List the removal happened on,
// not whatever List is active when the publish later settles.
export async function recordRemoval({ id, productId, detail, deletedAt, list }) {
  try {
    await db.put("tombstones", {
      id,
      list,
      productId,
      detail: detail || "",
      deletedAt,
    });
  } catch (err) {
    console.error("Failed to record removal tombstone:", err);
  }
}

async function handleRemoteAction(action) {
  const listName = getListName();

  if (action.type === "PUT_ITEM") {
    if (action.item.list !== listName) return;
    // Coupled transport (ADR-0005): a PUT_ITEM carries its Product so the
    // receiving Peer can always render the Item without a separate message. A
    // missing or foreign Product would leave a dangling Item — pull the full
    // List state instead. No re-broadcast: the wire face never echoes.
    if (!action.product || action.product.list !== listName) {
      publishAction({ type: "REQUEST_SYNC", ts: Date.now() });
      return;
    }
    await apply.putItem(action.item, action.product);
  } else if (action.type === "DELETE_ITEM") {
    if (!action.id.startsWith(listName + "::")) return;
    // Pass the carried snapshot so the receiving Peer can derive the purchase
    // event even for an Item it never stored (added + checked off while offline).
    await apply.deleteItem(action.id, {
      productId: action.productId,
      detail: action.detail || "",
      deletedAt: action.deletedAt,
    });
  } else if (action.type === "PUT_PRODUCT") {
    if (action.product.list !== listName) return;
    await apply.putProduct(action.product);
  } else if (action.type === "DELETE_PRODUCT") {
    if (!action.id.startsWith(listName + "::")) return;
    await apply.deleteProduct(action.id);
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
        if (item.list === listName) await apply.putItem(item);
      }
    }
    if (Array.isArray(action.products)) {
      for (const product of action.products) {
        if (product.list === listName) await apply.putProduct(product);
      }
    }
  } else if (action.type === "STATE_SYNC") {
    // Reconnect broadcast (ADR-0009): the sender's current Items + Products
    // plus the removals it made while offline. Items/Products apply
    // idempotently; removals apply after Items, and a removal is skipped when
    // the broadcast's Items still contain the same ID — a re-add before
    // reconnect wins over its own tombstone.
    const items = (Array.isArray(action.items) ? action.items : []).filter(
      (item) => item.list === listName,
    );
    const products = (Array.isArray(action.products) ? action.products : []).filter(
      (product) => product.list === listName,
    );
    for (const product of products) await apply.putProduct(product);
    for (const item of items) await apply.putItem(item);
    const incoming = new Set(items.map((item) => item.id));
    if (Array.isArray(action.removals)) {
      for (const removal of action.removals) {
        if (!removal || typeof removal.id !== "string") continue;
        if (!removal.id.startsWith(listName + "::")) continue;
        if (incoming.has(removal.id)) continue;
        // deletedAt present only on check-offs, so Peers derive the Purchase
        // event and history converges too (ADR-0008).
        await apply.deleteItem(removal.id, {
          productId: removal.productId,
          detail: removal.detail || "",
          deletedAt: removal.deletedAt,
        });
      }
    }
  }
}
