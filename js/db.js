// js/db.js — IndexedDB storage layer.
// Stores: items, products, events, tombstones (each indexed byList).

let db = null;

export function initDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("GroceryDB", 6);

    req.onupgradeneeded = (e) => {
      const targetDb = e.target.result;
      // Nobody has real data yet; drop and rebuild the schema each version.
      for (const name of ["items", "products", "events", "tombstones"]) {
        if (targetDb.objectStoreNames.contains(name)) {
          targetDb.deleteObjectStore(name);
        }
        const store = targetDb.createObjectStore(name, { keyPath: "id" });
        store.createIndex("byList", "list", { unique: false });
      }
    };

    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

export function getAll(store, listName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).index("byList").getAll(listName);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Every List this device has data for, most recently active first.
// Membership: distinct `list` keys across the byList indexes of all three
// stores. Recency: the max events.at per List (adds and purchases both record
// an event, so max `at` is the last time the List was touched). Lists with
// events only, e.g. ones with a check-off but no stored item, are covered by
// the events store scan.
export function getListActivity() {
  const stores = ["items", "products", "events"];
  const listNames = new Set();
  const lastAt = new Map();
  const productCount = new Map();
  const tx = db.transaction(stores, "readonly");
  return new Promise((resolve, reject) => {
    for (const storeName of stores) {
      const req = tx
        .objectStore(storeName)
        .index("byList")
        .openKeyCursor(null, "nextunique");
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          listNames.add(cursor.key);
          cursor.continue();
        }
      };
      req.onerror = () => reject(req.error);
    }
    const productsReq = tx.objectStore("products").openCursor();
    productsReq.onsuccess = () => {
      const cursor = productsReq.result;
      if (cursor) {
        const list = cursor.value && cursor.value.list;
        if (list != null) productCount.set(list, (productCount.get(list) || 0) + 1);
        cursor.continue();
      }
    };
    productsReq.onerror = () => reject(productsReq.error);
    const eventsReq = tx.objectStore("events").openCursor();
    eventsReq.onsuccess = () => {
      const cursor = eventsReq.result;
      if (cursor) {
        const record = cursor.value;
        if (record && record.list != null && typeof record.at === "number") {
          const prev = lastAt.get(record.list);
          if (prev == null || record.at > prev) lastAt.set(record.list, record.at);
        }
        cursor.continue();
      }
    };
    eventsReq.onerror = () => reject(eventsReq.error);
    tx.oncomplete = () => {
      resolve(
        [...listNames]
          .map((name) => ({
            name,
            lastAt: lastAt.get(name) || 0,
            productCount: productCount.get(name) || 0,
          }))
          .sort((a, b) => b.lastAt - a.lastAt || a.name.localeCompare(b.name)),
      );
    };
    tx.onerror = () => reject(tx.error);
  });
}

// Single-record lookup by primary key. IDs are list-prefixed, so this is
// unambiguous across Lists. Returns null when not found.
export function getById(store, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function write(store, op) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    op(tx.objectStore(store));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const put = (store, record) => write(store, (s) => s.put(record));
export const remove = (store, id) => write(store, (s) => s.delete(id));
