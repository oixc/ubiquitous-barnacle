// js/ui.js — DOM rendering and event handling.
// Receives data and callbacks; never touches IndexedDB or ntfy directly.
// Events are delegated: elements carry data-action / data-id attributes.

let actions = {};

// --- Icons (inline SVG, no external library) ---
const ICONS = {
  plus: 'M12 4v16m8-8H4',
  copy: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
  list: 'M4 6h16M4 12h16M4 18h16',
  trash:
    'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
};

export function icon(name, cls = "w-5 h-5") {
  return `<svg class="${cls}" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${ICONS[name] || ""}"/></svg>`;
}

export function init(cfg) {
  actions = cfg.actions;
  injectIcons();
  bindEvents();
}

function injectIcons() {
  document.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
}

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

export function renderList({ items, products, listName }) {
  setListName(listName);
  const productById = new Map(products.map((p) => [p.id, p]));
  const listEl = document.getElementById("grocery-list");

  items.sort((a, b) => a.bought - b.bought || b.createdAt - a.createdAt);

  const boughtCount = items.filter((i) => i.bought).length;

  if (items.length === 0) {
    listEl.innerHTML = `
      <li class="text-center py-8 text-slate-500 text-sm">
        Your list is empty. Add an item above!
      </li>`;
    return;
  }

  const clearRow = boughtCount
    ? `
      <li>
        <button data-action="clear-bought" class="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-rose-400 bg-rose-950/40 border border-rose-900/60 rounded-xl hover:bg-rose-950/70 transition">
          ${icon("trash", "w-4 h-4")}
          Clear (${boughtCount})
        </button>
      </li>`
    : "";

  listEl.innerHTML =
    clearRow +
    items
      .map((item) => {
        const product = productById.get(item.productId);
        const text = product ? product.defaultSpelling : "…";
        return `
      <li class="flex items-center justify-between p-3.5 bg-slate-900 rounded-xl border border-slate-800 shadow-sm transition">
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
