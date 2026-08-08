# Minimal Shopping List

A minimal, privacy-focused Progressive Web App designed for less than 10 person shared grocery management. Built as a zero-build static site using standard HTML/JS, Tailwind CSS, IndexedDB, and ntfy.sh for low-data sync.

## North Star Vision: Ideal User Experience
Two core actions, both seamless and no-friction in the fastest time with minimal clicks/taps:
1. Adding an Item (plus optional Details) to the List
2. Buying an Item from the List

The List thinks for you, quietly:
- Buying checks the Item off: it leaves the List and records a Purchase. When the household is due for it again, the restock prompt brings it back — one tap re-adds it.
- After the trip, suggestions shift to restock prompts — what the household buys regularly and is due for.
- Adding an Item surfaces what it is usually added together with, so the List builds itself.
- While you type, the chips filter down to what matches (and their usual Details) — a few letters and a tap finishes the add.
- It is one suggestions strip throughout: the app reorders the chips by what you're doing — no modes, no bought shelf, no clearing.

The List only ever shows what's left to buy.

## Product Requirements & Goals
* Designed for few Users: Built specifically for <10 users sharing a single, unified shopping list.
* Single Shopping List: Omits multi-list complexity to keep interaction friction as low as possible.
* Cross-Platform Web App: Functions as a responsive PWA on both iOS and Android with offline support and home-screen installation.
* Simple Tech Stack: Zero-build, vanilla JavaScript architecture that is easy to understand, extend, and maintain.
* Fast, Low-Data Sync: Real-time background sync using lightweight JSON payloads over Server-Sent Events (SSE), keeping cellular data usage negligible.
* Zero-Cost Infrastructure: Runs client-side on free static hosts (e.g., GitHub Pages) using free-tier messaging relays.
* Ad-Free & Private: No ads, third-party trackers, or algorithmic "sponsored suggestions" found in apps like KitchenOwl.
* Smart Suggestions: Device-local history drives a single context-aware suggestions strip — interval-aware restock prompts, and "added-together" companions — so building the List stays a few taps. No tracking, no sponsored suggestions.

## Todo
- Open ideas are tracked as tickets under `.scratch/readme-todos/issues/`.