// js/ui.js — DOM rendering and event handling.
// Receives data and callbacks; never touches IndexedDB or ntfy directly.
// Events are delegated: elements carry data-action / data-id attributes.

let actions = {};
let showView = () => {};

// --- Icons (inline SVG, no external library) ---
const ICONS = {
  plus: 'M12 4v16m8-8H4',
  copy: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
  list: 'M4 6h16M4 12h16M4 18h16',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 18L18 6M6 6l12 12',
  cart: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  book: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  pencil:
    'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  trash:
    'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
};

export function icon(name, cls = "w-5 h-5") {
  return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${ICONS[name] || ""}"/></svg>`;
}

export function init(cfg) {
  actions = cfg.actions;
  showView = cfg.showView;
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

export function renderAll({ items, products, history, suggestions, listName, view }) {
  setListName(listName);
  setActiveNav(view);
  showSection(view);
  closeMenu();
  renderSuggestions(suggestions);
  renderList({ items, products, listName });
  renderCatalog(products, history);
  renderHistory(history, products);
}

function renderSuggestions(suggestions) {
  const el = document.getElementById("suggestions");
  if (!el) return;
  if (!suggestions || suggestions.length === 0) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `
    <div class="flex gap-2 overflow-x-auto pb-1">
      ${suggestions
        .map(
          (s) => `
        <button data-action="add-suggested" data-id="${s.product.id}" title="Bought ${s.count}×" class="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-xs text-slate-200 hover:bg-slate-700 transition">
          ${escapeHtml(s.product.defaultSpelling)}
          ${icon("plus", "w-3.5 h-3.5 text-blue-400")}
        </button>`,
        )
        .join("")}
    </div>
  `;
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
function openMenu() {
  const drawer = document.getElementById("drawer");
  if (!drawer) return;
  drawer.classList.remove("-translate-x-full");
  drawer.classList.add("translate-x-0");
  const overlay = document.getElementById("drawer-overlay");
  overlay.classList.remove("opacity-0", "pointer-events-none");
  overlay.classList.add("opacity-100", "pointer-events-auto");
  const menuBtn = document.getElementById("menu-btn");
  if (menuBtn) menuBtn.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  const drawer = document.getElementById("drawer");
  if (drawer) {
    drawer.classList.add("-translate-x-full");
    drawer.classList.remove("translate-x-0");
  }
  const overlay = document.getElementById("drawer-overlay");
  if (overlay) {
    overlay.classList.add("opacity-0", "pointer-events-none");
    overlay.classList.remove("opacity-100", "pointer-events-auto");
  }
  const menuBtn = document.getElementById("menu-btn");
  if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
}

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
  };
  const s = states[status] || states.connecting;
  el.className = `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.cls}`;
  el.title = s.label || status[0].toUpperCase() + status.slice(1);
  el.innerHTML = `<span class="w-2 h-2 rounded-full ${s.dot}"></span>${s.label ? `<span>${s.label}</span>` : ""}`;
}

export function setListName(listName) {
  const el = document.getElementById("list-id-display");
  if (el) el.textContent = listName;
}

// --- List view ---
export function renderList({ items, products, listName }) {
  setListName(listName);
  const productById = new Map(products.map((p) => [p.id, p]));
  const listEl = document.getElementById("grocery-list");

  if (items.length === 0) {
    listEl.innerHTML = `
      <li class="text-center py-8 text-slate-500 text-sm">
        Your list is empty. Add an item above!
      </li>`;
    return;
  }

  items.sort((a, b) => b.createdAt - a.createdAt);

  const itemRow = (item) => {
    const product = productById.get(item.productId);
    const text = product ? product.defaultSpelling : "…";
    const rowCls = item.bought
      ? "flex items-center justify-between p-3.5 bg-slate-900/50 rounded-xl border border-slate-800/60 shadow-sm transition"
      : "flex items-center justify-between p-3.5 bg-slate-900 rounded-xl border border-slate-800 shadow-sm transition";
    return `
      <li class="${rowCls}">
        <label class="flex items-center gap-3 flex-1 cursor-pointer select-none">
          <input
            type="checkbox"
            ${item.bought ? "checked" : ""}
            data-action="toggle-bought"
            data-id="${item.id}"
            class="w-5 h-5 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-600 transition"
          >
          <span class="text-sm font-medium ${item.bought ? "line-through text-slate-500" : "text-slate-200"}">
            ${escapeHtml(text)}
          </span>
        </label>
        <button data-action="remove-item" data-id="${item.id}" aria-label="Remove item" title="Remove item" class="text-slate-500 hover:text-rose-400 p-1 rounded-lg transition">
          ${icon("trash")}
        </button>
      </li>
    `;
  };

  const sectionHeader = (label, count, extra = "") => `
    <li class="flex items-center justify-between pt-2 pb-1">
      <div class="flex items-baseline gap-2">
        <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">${label}</h2>
        <span class="text-xs text-slate-600">${count}</span>
      </div>
      ${extra}
    </li>
  `;

  const open = items.filter((i) => !i.bought);
  const bought = items.filter((i) => i.bought);

  const openSection = open.length
    ? sectionHeader("To buy", open.length) + open.map(itemRow).join("")
    : "";

  const boughtSection = bought.length
    ? sectionHeader(
        "Bought",
        bought.length,
        `<button data-action="clear-bought" aria-label="Clear bought items" title="Clear bought items" class="flex items-center gap-1 text-xs font-semibold text-rose-400 hover:text-rose-300 transition">
          ${icon("trash", "w-3.5 h-3.5")}
          Clear
        </button>`,
      ) + bought.map(itemRow).join("")
    : "";

  listEl.innerHTML = openSection + boughtSection;
}

// --- Catalog view ---
let catalogProducts = [];

function startRename(productId) {
  const row = document.querySelector(`[data-product-id="${productId}"]`);
  const nameEl = row && row.querySelector("[data-role='product-name']");
  const product = catalogProducts.find((p) => p.id === productId);
  if (!row || !nameEl || !product) return;

  const input = document.createElement("input");
  input.type = "text";
  input.value = product.defaultSpelling;
  input.className =
    "w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600";

  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    const value = input.value.trim();
    if (save && value && value !== product.defaultSpelling) {
      actions.renameProduct(productId, value);
    } else {
      renderAll();
    }
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    else if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));

  nameEl.textContent = "";
  nameEl.appendChild(input);
  input.focus();
  input.select();
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
  for (const h of history) {
    count.set(h.productId, (count.get(h.productId) || 0) + 1);
    const prev = lastBought.get(h.productId);
    if (prev === undefined || h.boughtAt > prev) {
      lastBought.set(h.productId, h.boughtAt);
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
      return `
      <div class="flex items-center justify-between p-3.5 bg-slate-900 rounded-xl border border-slate-800 shadow-sm transition" data-product-id="${p.id}">
        <div class="min-w-0">
          <div class="text-sm font-medium text-slate-200" data-role="product-name">${escapeHtml(p.defaultSpelling)}</div>
          ${p.aliases && p.aliases.length ? `<div class="mt-1 flex flex-wrap gap-1">${p.aliases.map((a) => `<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">${escapeHtml(a)}</span>`).join("")}</div>` : ""}
        </div>
        <div class="flex items-center gap-3 shrink-0 ml-3">
          <div class="text-right">
            <div class="text-sm text-slate-300">${times}×</div>
            <div class="text-[10px] text-slate-500">${last ? `last ${new Date(last).toLocaleDateString()}` : "never"}</div>
          </div>
          <button data-action="rename-product" data-id="${p.id}" aria-label="Rename product" title="Rename" class="text-slate-500 hover:text-slate-200 p-1 rounded-lg transition">
            ${icon("pencil", "w-4 h-4")}
          </button>
        </div>
      </div>
    `;
    })
    .join("");
}

// --- Purchase history view (device-local) ---
function renderHistory(history, products) {
  const el = document.getElementById("view-history");
  if (!el) return;

  if (history.length === 0) {
    el.innerHTML = `<p class="text-center py-8 text-slate-500 text-sm">No purchase history yet.</p>`;
    return;
  }

  const productById = new Map(products.map((p) => [p.id, p]));
  const sorted = [...history].sort((a, b) => b.boughtAt - a.boughtAt);

  el.innerHTML = sorted
    .map((h) => {
      const product = productById.get(h.productId);
      const name = product ? product.defaultSpelling : "…";
      return `
      <div class="flex items-center justify-between p-3.5 bg-slate-900 rounded-xl border border-slate-800 shadow-sm transition">
        <span class="text-sm font-medium text-slate-200">${escapeHtml(name)}</span>
        <span class="text-xs text-slate-500 shrink-0 ml-3">${escapeHtml(new Date(h.boughtAt).toLocaleString())}</span>
      </div>
    `;
    })
    .join("");
}

function bindEvents() {
  document.getElementById("add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("item-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    actions.addItem(text);
  });

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    if (action === "copy-link") actions.copyInviteLink();
    else if (action === "change-list") actions.changeList();
    else if (action === "clear-bought") actions.clearBought();
    else if (action === "remove-item") actions.removeItem(el.dataset.id);
    else if (action === "rename-product") startRename(el.dataset.id);
    else if (action === "add-suggested") actions.suggest(el.dataset.id);
    else if (action === "open-menu") openMenu();
    else if (action === "close-menu") closeMenu();
    else if (action.startsWith("view-")) showView(el.dataset.view);
  });

  document.addEventListener("change", (e) => {
    const el = e.target.closest("[data-action='toggle-bought']");
    if (el) actions.toggleBought(el.dataset.id, el.checked);
  });
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
