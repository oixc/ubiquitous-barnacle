# Minimal Shopping List

A minimal, privacy-focused Progressive Web App designed for less than 10 person shared grocery management. Built as a zero-build static site using standard HTML/JS, Tailwind CSS, IndexedDB, and ntfy.sh for low-data sync.

## Ideal User Experience
Two core actions:
1. adding items (plus details) to the shopping list
2. buying items from the shopping list
Both actions should be seamless and no-friction in the fastest time with minimal clicks. 

For example:
1. The app suggests the right items to add to minimize mental load of creating a shopping list. 
    * common items repeat in predictable intervals
    * some items are typically bought together
    * details like quantity and brand don't change a lot
2. The shopping list is ordered in the usual way items get bought. since the store layout is mostly fixed, the items are checked off the list in a predictable order.  

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
- Open ideas are tracked as tickets under `.scratch/readme-todos/issues/`.
- ui: buy again chips should line wrap to allow more chips on screen
- filter suggestions chips while typing. this allows to type only the first few letters of a product and add it to the shopping list with a quick click. (don't forget to also populate item detail suggestions)  