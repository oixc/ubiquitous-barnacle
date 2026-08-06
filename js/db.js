// js/db.js — IndexedDB storage layer.
// Stores: items, products, events (each indexed byList).

let db = null;

export function initDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("GroceryDB", 5);

    req.onupgradeneeded = (e) => {
      const targetDb = e.target.result;
      // Nobody has real data yet; drop and rebuild the schema each version.
      for (const name of ["items", "products", "events"]) {
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
