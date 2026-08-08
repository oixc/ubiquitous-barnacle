// js/ui.js — DOM rendering and event handling.
// Receives data and callbacks; never touches IndexedDB or ntfy directly.
// Events are delegated: elements carry data-action / data-id attributes.

import { normalizeText } from "./catalog.js";

let actions = {};
let showView = () => {};
let rerender = () => {};

// --- Icons (inline SVG, no external library) ---
const ICONS = {
  plus: 'M12 4v16m8-8H4',
  copy: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 18L18 6M6 6l12 12',
  cart: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  book: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  pencil:
    'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  refresh:
    'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99',
  trash:
    'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  download:
    'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
  upload:
    'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5',
};

function icon(name, cls = "w-5 h-5") {
  return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${ICONS[name] || ""}"/></svg>`;
}

export function init(cfg) {
  actions = cfg.actions;
  showView = cfg.showView;
  rerender = cfg.renderAll || rerender;
  injectIcons();
  bindEvents();
}

function injectIcons() {
  document.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
}

// --- Views ---
const VIEWS = ["list", "catalog", "history"];

export function renderAll({
  items,
  products,
  history,
  suggestions,
  tripPositions,
  listName,
  listActivity,
  view,
  dailyCount,
  syncEnabled,
}) {
  setListName(listName);
  setActiveNav(view);
  showSection(view);
  closeMenu();
  renderSuggestions(suggestions);
  renderList({ items, products, listName, tripPositions });
  renderCatalog(products, history);
  renderHistory(history, products);
  renderRecentLists(listActivity, listName);
  renderSyncControls(dailyCount, syncEnabled);
}

let syncEnabled = true;

function renderSyncControls(dailyCount, enabled) {
  syncEnabled = enabled;
  const versionEl = document.getElementById("drawer-version");
  if (versionEl && globalThis.APP_VERSION) {
    versionEl.textContent = `Version ${globalThis.APP_VERSION}`;
  }
  const countEl = document.getElementById("drawer-sync-count");
  if (countEl) {
    countEl.textContent = syncEnabled
      ? `${dailyCount} ${dailyCount === 1 ? "message" : "messages"} sent today`
      : "Sync off — changes stay on this device";
  }

  const toggle = document.getElementById("sync-toggle");
  if (!toggle) return;
  const label = toggle.querySelector("[data-sync-toggle-state]");
  toggle.setAttribute("aria-pressed", String(syncEnabled));
  if (syncEnabled) {
    toggle.className =
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 transition";
    label.textContent = "On";
  } else {
    toggle.className =
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700 transition";
    label.textContent = "Off";
  }
}

// Lists this device has data for (newest activity first), excluding the List
// currently open. Hidden entirely when there's nothing to switch to.
function renderRecentLists(listActivity, currentList) {
  const container = document.getElementById("recent-lists");
  const section = document.getElementById("recent-lists-section");
  if (!container || !section) return;
  const others = (listActivity || []).filter(
    (entry) => entry.name !== currentList,
  );
  section.classList.toggle("hidden", others.length === 0);
  container.innerHTML = others
    .map((entry) => {
      const products = `${entry.productCount || 0} ${
        entry.productCount === 1 ? "product" : "products"
      }`;
      const meta = entry.lastAt ? `${products} · ${formatRelative(entry.lastAt)}` : products;
      return `
        <button
          data-action="switch-list"
          data-list="${escapeHtml(entry.name)}"
          title="${escapeHtml(entry.name)}"
          class="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition text-left"
        >
          <span class="min-w-0">
            <span class="block text-sm font-mono text-slate-300 truncate">${escapeHtml(entry.name)}</span>
            <span class="block text-xs text-slate-500">${escapeHtml(meta)}</span>
          </span>
        </button>`;
    })
    .join("");
}

let currentSuggestions = [];

// Live filter: while the add input is non-empty, show only chips whose Product
// spelling or aliases start with the typed text; otherwise the full strip.
function suggestionsFilter() {
  const input = document.getElementById("item-input");
  const prefix = input ? normalizeText(input.value) : "";
  if (!prefix) return currentSuggestions;
  return currentSuggestions.filter((s) => {
    const product = s && s.product;
    if (!product) return false;
    const spellings = [product.defaultSpelling, ...product.aliases];
    return spellings.some((sp) => normalizeText(sp).startsWith(prefix));
  });
}

// Human-readable restock interval, e.g. "every 3:45" (sub-2-day), "every 3 days",
// "every 2 weeks", "every 6 months".
function formatInterval(ms) {
  const days = ms / (24 * 60 * 60 * 1000);
  if (days < 2) {
    const totalMinutes = Math.round(ms / (60 * 1000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `every ${hours}:${String(minutes).padStart(2, "0")}`;
  }
  if (days < 11) return `every ${Math.round(days)} days`;
  const weeks = days / 7;
  if (weeks < 7) return `every ${Math.round(weeks)} weeks`;
  const months = days / 30;
  return `every ${Math.round(months)} months`;
}

// ISO 8601 presentation of local wall-clock time: dates YYYY-MM-DD, times HH:MM.
// Deliberately not toISOString(), which would shift the wall-clock to UTC.
function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatTime(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDateTime(ts) {
  return `${formatDate(ts)} ${formatTime(ts)}`;
}

// Relative wall-clock presentation, e.g. "42 minutes ago", "2 days ago",
// "yesterday", "3 months ago". Past only — every call site (bought/added at,
// restock dueAt) is in the past.
function formatRelative(ts) {
  const diff = Date.now() - ts;
  const plural = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (diff < 45 * 1000) return "just now";
  if (diff < 90 * 1000) return "a minute ago";
  if (diff < 60 * 60 * 1000) {
    return `${plural(Math.round(diff / (60 * 1000)), "minute")} ago`;
  }
  if (diff < 24 * 60 * 60 * 1000) {
    return `${plural(Math.floor(diff / (60 * 60 * 1000)), "hour")} ago`;
  }
  if (diff < 48 * 60 * 60 * 1000) return "yesterday";
  if (diff < 30 * 24 * 60 * 60 * 1000) {
    return `${plural(Math.round(diff / (24 * 60 * 60 * 1000)), "day")} ago`;
  }
  if (diff < 365 * 24 * 60 * 60 * 1000) {
    return `${plural(Math.round(diff / (30 * 24 * 60 * 60 * 1000)), "month")} ago`;
  }
  return `${plural(Math.round(diff / (365 * 24 * 60 * 60 * 1000)), "year")} ago`;
}

// Chip style per suggestion kind: pivot (added-together companions) is blue,
// restock (due) is amber.
const SUGGESTION_STYLES = {
  pivot: {
    chip: "border bg-blue-950/40 border-blue-800/40 text-blue-200 hover:bg-blue-900/40",
    plus: "text-blue-300",
  },
  restock: {
    chip: "border bg-amber-950/40 border-amber-800/40 text-amber-200 hover:bg-amber-900/40",
    plus: "text-amber-300",
  },
};

function suggestionChip(s) {
  const p = s.product;
  const reasonText = {
    pivot: (r) => `Added together ${r.count}×`,
    restock: (r) =>
      `Restock ${formatInterval(r.interval)} · due ${formatRelative(r.dueAt)}`,
  };
  const title = (s.reasons || [])
    .map((r) => reasonText[r.kind](r))
    .join("\n");
  const style = SUGGESTION_STYLES[s.kind] || SUGGESTION_STYLES.restock;
  return `
    <button data-action="add-suggested" data-id="${p.id}" title="${escapeHtml(title)}" class="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg text-xs ${style.chip} transition active:scale-95 motion-reduce:transition-none motion-reduce:transform-none">
      ${escapeHtml(p.defaultSpelling)}
      ${icon("plus", `w-3.5 h-3.5 ${style.plus}`)}
    </button>`;
}

function renderSuggestionStrip() {
  const el = document.getElementById("suggestions");
  if (!el) return;
  const visible = suggestionsFilter();
  if (visible.length === 0) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `
    <div class="flex flex-wrap gap-2">
      ${visible.map(suggestionChip).join("")}
    </div>
  `;
}

function renderSuggestions(suggestions) {
  currentSuggestions = suggestions || [];
  renderSuggestionStrip();
}

function showSection(view) {
  for (const v of VIEWS) {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle("hidden", v !== view);
  }
}

function setActiveNav(view) {
  document.querySelectorAll("[data-view]").forEach((btn) => {
    const active = btn.dataset.view === view;
    btn.classList.toggle("bg-slate-800", active);
    btn.classList.toggle("text-white", active);
    btn.classList.toggle("text-slate-300", !active);
    btn.setAttribute("aria-current", active ? "true" : "false");
  });
}

// --- Slide-out menu ---
function setMenu(open) {
  const drawer = document.getElementById("drawer");
  if (drawer) {
    drawer.classList.toggle("-translate-x-full", !open);
    drawer.classList.toggle("translate-x-0", open);
  }
  const overlay = document.getElementById("drawer-overlay");
  if (overlay) {
    overlay.classList.toggle("opacity-0", !open);
    overlay.classList.toggle("pointer-events-none", !open);
    overlay.classList.toggle("opacity-100", open);
    overlay.classList.toggle("pointer-events-auto", open);
  }
  const menuBtn = document.getElementById("menu-btn");
  if (menuBtn) menuBtn.setAttribute("aria-expanded", String(open));
}
const openMenu = () => setMenu(true);
const closeMenu = () => setMenu(false);

// --- Sync status ---
export function setSyncStatus(status) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  const states = {
    connected: {
      cls: "bg-emerald-950/60 text-emerald-300",
      dot: "bg-emerald-400 animate-pulse",
      label: "",
    },
    connecting: {
      cls: "bg-amber-950/60 text-amber-300",
      dot: "bg-amber-400",
      label: "",
    },
    offline: {
      cls: "bg-rose-950/60 text-rose-300",
      dot: "bg-rose-400",
      label: "",
    },
    dev: {
      cls: "bg-slate-800 text-slate-300",
      dot: "bg-slate-400",
      label: "Sync off",
    },
    limited: {
      cls: "bg-rose-950/60 text-rose-300",
      dot: "bg-rose-400",
      label: "Sync limited",
    },
  };
  const s = states[status] || states.connecting;
  el.className = `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.cls}`;
  el.title = s.label || status[0].toUpperCase() + status.slice(1);
  el.innerHTML = `<span class="w-2 h-2 rounded-full ${s.dot}"></span>${s.label ? `<span>${s.label}</span>` : ""}`;
}

function setListName(listName) {
  const el = document.getElementById("drawer-list-name");
  if (el) el.textContent = listName;
}

// --- List view ---
let listItems = [];
// Ids rendered last time, to animate newly added Items in on the next render.
// The first render (and the empty state) seeds the set without animating.
let prevItemIds = new Set();
let listInitialized = false;

export function renderList({ items, products, listName, tripPositions }) {
  const productById = new Map(products.map((p) => [p.id, p]));
  const listEl = document.getElementById("grocery-list");

  if (items.length === 0) {
    listEl.innerHTML = `
      <li class="text-center py-8 text-slate-500 text-sm">
        Your list is empty. Add an item above!
      </li>`;
    prevItemIds = new Set();
    listInitialized = true;
    return;
  }

  // Typical purchase order (06): Products with a learned position sort first,
  // in trip order; the rest keep the recency order and trail the learned ones.
  // Equal positions (and everything unlearned) fall back to recency.
  const positions = tripPositions || new Map();
  items.sort((a, b) => {
    const pa = positions.get(a.productId) ?? Infinity;
    const pb = positions.get(b.productId) ?? Infinity;
    if (pa !== pb) return pa - pb;
    return b.createdAt - a.createdAt;
  });
  listItems = items;

  const nextIds = new Set(items.map((i) => i.id));
  let freshIds = new Set();
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (listInitialized && !reduceMotion) {
    freshIds = new Set([...nextIds].filter((id) => !prevItemIds.has(id)));
  }
  prevItemIds = nextIds;
  listInitialized = true;

  const itemRow = (item) => {
    const product = productById.get(item.productId);
    const text = product ? product.defaultSpelling : "…";
    const detail = item.detail || "";
    const rowClass = freshIds.has(item.id)
      ? "flex items-center animate-row-in"
      : "flex items-center";
    return `
      <li class="${rowClass}">
        <button
          data-action="check-off"
          data-id="${item.id}"
          class="flex items-center p-3.5 bg-slate-900 rounded-xl border border-slate-800 shadow-sm transition flex-1 min-w-0 text-left cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
          <span class="text-sm font-medium text-slate-200">
            ${escapeHtml(text)}
          </span>
        </button>
        <button
          data-action="edit-detail"
          data-id="${item.id}"
          aria-label="Edit detail"
          title="Edit detail"
          class="ml-1 shrink-0 px-2 py-1 rounded-lg border border-slate-800 text-xs ${detail ? "text-slate-400 hover:text-blue-400" : "text-slate-600 hover:text-blue-400"} transition"
        >
          ${detail ? escapeHtml(detail) : icon("pencil", "w-3.5 h-3.5")}
        </button>
        <button data-action="remove-item" data-id="${item.id}" aria-label="Remove item" title="Remove item" class="ml-1 text-slate-500 hover:text-rose-400 p-1 rounded-lg transition shrink-0">
          ${icon("trash")}
        </button>
      </li>
    `;
  };

  listEl.innerHTML = items.map(itemRow).join("");
}

// --- Catalog view ---
let catalogProducts = [];

// Shared inline-editor: swaps `host` for a text input; Enter/blur commit,
// Escape cancels. The commit re-renders unless `onSave` handled it.
function inlineEdit(host, { value = "", placeholder = "", className, onSave }) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.className = className;

  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    if (save && onSave(input.value.trim())) return;
    rerender();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));

  host.textContent = "";
  host.appendChild(input);
  input.focus();
  input.select();
}

function startRename(productId) {
  const row = document.querySelector(`[data-product-id="${productId}"]`);
  const nameEl = row && row.querySelector("[data-role='product-name']");
  const product = catalogProducts.find((p) => p.id === productId);
  if (!row || !nameEl || !product) return;

  const original = product.defaultSpelling;
  inlineEdit(nameEl, {
    value: original,
    className:
      "w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600",
    onSave: (value) => {
      if (!value || value === original) return false;
      actions.renameProduct(productId, value);
      return true;
    },
  });
}

function startDetailEdit(itemId) {
  const btn = document.querySelector(
    `[data-action="edit-detail"][data-id="${itemId}"]`,
  );
  const item = btn && listItems.find((i) => i.id === itemId);
  if (!btn || !item) return;

  inlineEdit(btn, {
    value: item.detail || "",
    placeholder: "e.g. 500 g",
    className:
      "w-28 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600",
    onSave: (value) => {
      actions.updateItemDetail(itemId, value);
      return true;
    },
  });
}

// --- Preset quick-choice chips ---
let detailTimer = null;

function renderPresetChips(product) {
  const el = document.getElementById("preset-chips");
  if (!el) return;
  const presets =
    product && product.presets.length
      ? product.presets
      : [];
  if (presets.length === 0) {
    clearPresetChips();
    return;
  }
  el.innerHTML = `
    <div class="flex flex-wrap gap-1.5">
      <span class="self-center text-[10px] uppercase tracking-wide text-slate-500 shrink-0">With</span>
      ${presets
        .map(
          (d) => `
        <button data-action="add-with-detail" data-id="${product.id}" data-detail="${escapeHtml(d)}" class="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-lg bg-blue-950/40 border border-blue-800/60 text-xs text-blue-200 hover:bg-blue-900/40 transition">
          ${escapeHtml(d)}
          ${icon("plus", "w-3.5 h-3.5 text-blue-300")}
        </button>`,
        )
        .join("")}
    </div>
  `;
  el.classList.remove("hidden");
}

function clearPresetChips() {
  const el = document.getElementById("preset-chips");
  if (!el) return;
  el.innerHTML = "";
  el.classList.add("hidden");
}

function renderCatalog(products, history) {
  const el = document.getElementById("view-catalog");
  if (!el) return;

  if (products.length === 0) {
    el.innerHTML = `<p class="text-center py-8 text-slate-500 text-sm">No products yet. Add an item to grow the catalog.</p>`;
    return;
  }

  const count = new Map();
  const lastBought = new Map();
  const lastAdded = new Map();
  for (const h of history) {
    if (h.kind === "purchase") {
      count.set(h.productId, (count.get(h.productId) || 0) + 1);
      const prev = lastBought.get(h.productId);
      if (prev === undefined || h.at > prev) {
        lastBought.set(h.productId, h.at);
      }
    } else if (h.kind === "add") {
      const prev = lastAdded.get(h.productId);
      if (prev === undefined || h.at > prev) {
        lastAdded.set(h.productId, h.at);
      }
    }
  }

  const sorted = [...products].sort((a, b) =>
    a.defaultSpelling.localeCompare(b.defaultSpelling),
  );
  catalogProducts = sorted;

  el.innerHTML = sorted
    .map((p) => {
      const times = count.get(p.id) || 0;
      const last = lastBought.get(p.id);
      const added = lastAdded.get(p.id);
      return `
      <div class="flex items-center justify-between p-3.5 bg-slate-900 rounded-xl border border-slate-800 shadow-sm transition" data-product-id="${p.id}">
        <div class="min-w-0">
          <div class="text-sm font-medium text-slate-200" data-role="product-name">${escapeHtml(p.defaultSpelling)}</div>
          ${p.aliases.length ? `<div class="mt-1 flex flex-wrap gap-1">${p.aliases.map((a) => `<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">${escapeHtml(a)}</span>`).join("")}</div>` : ""}
          ${p.presets.length ? `<div class="mt-1 flex flex-wrap gap-1">${p.presets.map((d) => `
            <span class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
              ${escapeHtml(d)}
              <button data-action="delete-preset" data-id="${p.id}" data-detail="${escapeHtml(d)}" aria-label="Remove preset" title="Remove preset" class="text-slate-500 hover:text-rose-400 leading-none">×</button>
            </span>`).join("")}</div>` : ""}
        </div>
        <div class="flex items-center gap-3 shrink-0 ml-3">
          <div class="text-right">
            <div class="text-sm text-slate-300">${times}×</div>
            <div class="text-[10px] text-slate-500">${last ? `last bought ${formatRelative(last)}` : "never bought"}</div>
            <div class="text-[10px] text-slate-500">${added ? `last added ${formatRelative(added)}` : "never added"}</div>
            <div class="text-[10px] text-slate-500">${p.restockInterval ? `restock ${formatInterval(p.restockInterval)}` : ""}</div>
          </div>
          <button data-action="rename-product" data-id="${p.id}" aria-label="Rename product" title="Rename" class="text-slate-500 hover:text-slate-200 p-1 rounded-lg transition">
            ${icon("pencil", "w-4 h-4")}
          </button>
          <button data-action="delete-product" data-id="${p.id}" aria-label="Delete product" title="Delete" class="text-slate-500 hover:text-rose-400 p-1 rounded-lg transition">
            ${icon("trash", "w-4 h-4")}
          </button>
        </div>
      </div>
    `;
    })
    .join("");
}

// --- Event history view (device-local add + purchase events) ---
function renderHistory(history, products) {
  const el = document.getElementById("view-history");
  if (!el) return;

  if (history.length === 0) {
    el.innerHTML = `<p class="text-center py-8 text-slate-500 text-sm">No event history yet.</p>`;
    return;
  }

  const productById = new Map(products.map((p) => [p.id, p]));
  const sorted = [...history].sort((a, b) => b.at - a.at);

  el.innerHTML = sorted
    .map((h) => {
      const product = productById.get(h.productId);
      const name = product ? product.defaultSpelling : "…";
      const isAdd = h.kind === "add";
      const badge = isAdd ? "Added" : "Bought";
      const badgeCls = isAdd
        ? "bg-blue-950/60 text-blue-300"
        : "bg-emerald-950/60 text-emerald-300";
      return `
      <div class="flex items-center justify-between p-3.5 bg-slate-900 rounded-xl border border-slate-800 shadow-sm transition">
        <div class="flex items-center gap-2 min-w-0">
          <span class="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${badgeCls}">${badge}</span>
          <span class="text-sm font-medium text-slate-200 truncate">${escapeHtml(name)}${h.detail ? ` <span class="text-xs text-slate-400">· ${escapeHtml(h.detail)}</span>` : ""}</span>
        </div>
        <span class="text-xs text-slate-500 shrink-0 ml-3">${escapeHtml(formatDateTime(h.at))}</span>
      </div>
    `;
    })
    .join("");
}

// Plays the row-out animation before a check-off, then performs it. The
// timeout is the fallback so the removal never depends on animation timing;
// reduced-motion users and any missing row skip straight to the action.
function checkOffItem(el) {
  const id = el.dataset.id;
  const li = el.closest("li");
  if (!li || li.dataset.leaving) {
    actions.checkOff(id);
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    actions.checkOff(id);
    return;
  }
  li.dataset.leaving = "true";
  li.classList.add("animate-row-out");
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    clearTimeout(timer);
    actions.checkOff(id);
  };
  const timer = setTimeout(fire, 200);
  li.addEventListener("animationend", fire, { once: true });
}

function bindEvents() {
  const addForm = document.getElementById("add-form");
  const itemInput = document.getElementById("item-input");

  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = itemInput.value.trim();
    if (!text) return;
    itemInput.value = "";
    clearPresetChips();
    renderSuggestionStrip();
    actions.addItem(text);
  });

  itemInput.addEventListener("input", (e) => {
    clearTimeout(detailTimer);
    renderSuggestionStrip();
    const value = e.target.value.trim();
    if (!value) {
      clearPresetChips();
      return;
    }
    detailTimer = setTimeout(async () => {
      const product = await actions.matchProduct(value);
      renderPresetChips(product);
    }, 200);
  });

  const handlers = {
    "copy-link": () => actions.copyInviteLink(),
    "change-list": () => actions.changeList(),
    "switch-list": (el) => actions.switchList(el.dataset.list),
    "refresh": () => actions.refresh(),
    "export-backup": () => actions.exportBackup(),
    "import-backup": () => {
      const input = document.getElementById("backup-file-input");
      if (input) input.click();
    },
    "toggle-sync": () => actions.setSyncEnabled(!syncEnabled),
    "remove-item": (el) => actions.removeItem(el.dataset.id),
    "check-off": (el) => checkOffItem(el),
    "rename-product": (el) => startRename(el.dataset.id),
    "delete-product": (el) => actions.deleteProduct(el.dataset.id),
    "delete-preset": (el) => actions.deletePreset(el.dataset.id, el.dataset.detail),
    "add-suggested": (el) => actions.suggest(el.dataset.id),
    "edit-detail": (el) => startDetailEdit(el.dataset.id),
    "add-with-detail": (el) => {
      itemInput.value = "";
      clearPresetChips();
      renderSuggestionStrip();
      actions.addItemWithDetail(el.dataset.id, el.dataset.detail);
    },
    "open-menu": () => openMenu(),
    "close-menu": () => closeMenu(),
  };

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    if (handlers[action]) {
      handlers[action](el);
    } else if (action.startsWith("view-")) {
      showView(el.dataset.view);
    }
  });

  const backupInput = document.getElementById("backup-file-input");
  if (backupInput) {
    backupInput.addEventListener("change", () => {
      const file = backupInput.files && backupInput.files[0];
      if (file) actions.importBackup(file);
      backupInput.value = "";
    });
  }
}

function escapeHtml(str) {
  return str.replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[m],
  );
}
