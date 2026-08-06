const CACHE_NAME = "grocery-v23";
const ASSETS = [
  "./index.html",
  "./manifest.json",
  "./js/main.js",
  "./js/db.js",
  "./js/sync.js",
  "./js/catalog.js",
  "./js/backup.js",
  "./js/ui.js",
  "https://cdn.tailwindcss.com",
];

self.addEventListener("install", (e) => {
  // Fetch each asset with cache: "reload" so the browser's HTTP cache can never
  // inject a stale copy into the freshly created app cache (a mixed-version bug).
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of ASSETS) {
        await cache.add(new Request(url, { cache: "reload" }));
      }
    }),
  );
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
  // Pass ntfy network requests straight through
  if (e.request.url.includes("ntfy.sh")) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      // Stale-while-revalidate: serve from cache instantly, then refresh the
      // cache from the network so assets self-heal on the next load. This keeps
      // offline support while never pinning stale module versions forever.
      const network = fetch(e.request)
        .then((response) => {
          if (response && response.ok && e.request.method === "GET") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return response;
        })
        .catch(() => cachedResponse);
      return cachedResponse || network;
    }),
  );
});
