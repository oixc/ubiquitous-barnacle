# Minimal Shopping List

A minimal, privacy-focused Progressive Web App designed for less than 10 person shared grocery management. Built as a zero-build static site using standard HTML/JS, Tailwind CSS, IndexedDB, and ntfy.sh for low-data sync.

## Product Requirements & Goals
* Designed for few Users: Built specifically for <10 users sharing a single, unified shopping list.
* Single Shopping List: Omits multi-list complexity to keep interaction friction as low as possible.
* Cross-Platform Web App: Functions as a responsive PWA on both iOS and Android with offline support and home-screen installation.
* Simple Tech Stack: Zero-build, vanilla JavaScript architecture that is easy to understand, extend, and maintain.
* Fast, Low-Data Sync: Real-time background sync using lightweight JSON payloads over Server-Sent Events (SSE), keeping cellular data usage negligible.
* Zero-Cost Infrastructure: Runs client-side on free static hosts (e.g., GitHub Pages) using free-tier messaging relays.
* Ad-Free & Private: No ads, third-party trackers, or algorithmic "sponsored suggestions" found in apps like KitchenOwl.
* Item Frequency & Recommendations: Local history tracking to calculate addition frequencies, helping generate templates and smart restock prompts.

## Todo
2. change rendered checkbox to a change in background color
2. UI: a few light animations?
2. feat: delete product from catalog
3. details for items. defaults per product. for quantities
4. order shopping list to reflect typical purchase order
5. rename in domain model: bought list = recent list. to buy = no name
6. rework suggestions based on "restock interval" and last purchase