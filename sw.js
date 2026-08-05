const CACHE_NAME = "grocery-v8";
const ASSETS = [
  "./index.html",
  "./manifest.json",
  "./js/main.js",
  "./js/db.js",
  "./js/sync.js",
  "./js/catalog.js",
  "./js/ui.js",
  "https://cdn.tailwindcss.com",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
    }),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Pass ntfy network requests straight through; cache app assets
  if (e.request.url.includes("ntfy.sh")) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    }),
  );
});
