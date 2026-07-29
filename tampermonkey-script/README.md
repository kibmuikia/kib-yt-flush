# YouTube Local Watch Progress Resumer

A robust, local-storage-backed Tampermonkey userscript built for users with YouTube Watch History disabled and privacy/ad-blocking extensions enabled. It guarantees seamless position persistence across hard reloads, soft SPA navigations, and pre-roll ad interruptions.

---

## 🚀 Purpose & Context
YouTube's native resume mechanics rely heavily on asynchronous server-side watch time telemetry (`/api/stats/watchtime`). When watch history is paused, or when extensions block tracking endpoints, hard page refreshes reset the video player to `0:00`. 

This project provides a client-side solution leveraging Tampermonkey storage (`GM_setValue`/`GM_getValue`) to maintain precise playback states independently.

---

## ✨ Current Functionality
- **Zero Server Dependency:** Persists video progress locally using Tampermonkey's isolated sandboxed storage.
- **SPA Navigation Aware:** Fully compatible with YouTube's asynchronous client router (`yt-navigate-finish`) [Tampermonkey Docs](https://www.tampermonkey.net/).
- **Smart Completion Guard:** Automatically flushes stored records when a video reaches **95%** completion or is skipped within the first **5 seconds**.
- **Ad-Aware Interceptor:** Inspects YouTube's `#movie_player` for `.ad-showing` and `.ad-interrupting` classes to prevent recording pre-roll ad durations.
- **URL Parameter Respect:** Gracefully yields if explicit URL timestamp parameters (e.g., `?t=120s`) are present.
- **LRU Storage Bounded Cache:** Automatically prunes old records exceeding 200 entries to prevent storage bloat.

---

## ⚠️ Edge Cases Not Considered
1. **Live Streams & Premieres:** Disabled for live broadcasts since they lack finite durations and deterministic seeking offsets.
2. **Embedded Iframes:** Restricted to top-level watch URLs (`youtube.com/watch`) and does not hook into embedded third-party player instances.
3. **Multi-Tab Concurrency:** Simultaneous playback of identical video IDs across multiple tabs may cause last-write-wins collisions in shared storage.

---

## 🗺️ Roadmap: Chrome Extension Migration (Manifest V3)
1. **Background Service Worker:** Migrate from Tampermonkey `GM_` storage APIs to standard [Chrome Storage API (`chrome.storage.local`)](https://developer.chrome.com/docs/extensions/reference/api/storage).
2. **Content Script Modularization:** Package isolated content scripts with explicit declarative host permissions (`https://www.youtube.com/*`).
3. **Modern Side Panel Integration:** Implement the [Chrome Side Panel API (`chrome.sidePanel`)](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) to provide a persistent, non-intrusive sidebar UI. This allows users to inspect watch history, view saved timestamps, clear cache items, or manage ignored channels directly alongside the video player without opening popup modals.
4. **Chrome Web Store Publication:** Package bundle structure for public MV3 distribution.
