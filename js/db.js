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
      }
      const items = targetDb.createObjectStore("items", { keyPath: "id" });
      items.createIndex("byList", "list", { unique: false });
      const products = targetDb.createObjectStore("products", { keyPath: "id" });
      products.createIndex("byList", "list", { unique: false });
      const events = targetDb.createObjectStore("events", { keyPath: "id" });
      events.createIndex("byList", "list", { unique: false });
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

export function put(store, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function remove(store, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function removeMany(store, ids) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    for (const id of ids) {
      tx.objectStore(store).delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
