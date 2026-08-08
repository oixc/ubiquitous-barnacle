// js/version.js — single source of truth for the app version (ADR: none).
// Loaded as a classic script by index.html (sets window.APP_VERSION for the
// page) and importScripts'd by sw.js (sets self.APP_VERSION for CACHE_NAME).
// Bump this on every release; sw.js derives the cache name from it and the
// drawer shows it.
self.APP_VERSION = "v33";
