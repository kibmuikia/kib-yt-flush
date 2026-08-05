<p align="center">
  <img src="public/icons/icon128.png" alt="Kib-YT-Flush Logo" width="180" height="180" style="border-radius: 20%;" />
</p>

<h1 align="center">Kib-YT-Flush — Chrome Extension (Manifest V3)</h1>

Modern, type-safe Manifest V3 Chrome extension for local YouTube watch progress tracking and auto-resuming.

---

## 🛠 Architecture & Execution Contexts

The extension operates across three isolated browser environments:

1. **Background Service Worker (`src/background/service-worker.ts`)**
   - Serves as the extension's **Serialized Storage Mutation Owner** (`enqueueStorageMutation`).
   - Manages asynchronous message routing (`chrome.runtime.onMessage`).
   - Updates badge counter on extension icon (`chrome.action`).
   - Configures native side panel opening behavior (`chrome.sidePanel`).

2. **Content Script (`src/content/content.ts`)**
   - Injected on `https://www.youtube.com/*` watch pages.
   - Monitors HTML5 video element state and records timestamp progress every 2 seconds.
   - Dispatches mutations (`SAVE_PROGRESS`, `CLEAR_VIDEO`) to Background Service Worker via typed messaging bus.
   - Listens to YouTube Polymer SPA navigation events (`yt-navigate-finish`, `yt-page-data-updated`).
   - Intercepts pre-roll/mid-roll ad playback via `#movie_player` element inspection.

3. **Side Panel Dashboard UI (`src/sidepanel/sidepanel.ts` & `sidepanel.html`)**
   - Persistent sidebar UI rendered via Chrome's native Side Panel API.
   - Binds live watch history data from `chrome.storage.local`.
   - Real-time search/filter by video title or ID.
   - Interactive seek navigation (clicking card opens/updates tab directly to saved timestamp).
   - Single item deletion and full storage flush modal.

---

## 📂 Source Code Layout

```
chrome-extension/
├── manifest.config.ts          # Type-safe MV3 Manifest definition using defineManifest
├── vite.config.ts              # Vite 8 + @crxjs plugin setup
├── tsconfig.json               # Root solution-style tsconfig
├── tsconfig.app.json           # Application compiler config (DOM, WebWorker, ESNext)
├── tsconfig.node.json          # Node/Vite tooling compiler config
├── sidepanel.html              # Side Panel HTML layout
├── public/
│   └── icons/                  # Extension icons (16px, 48px, 128px)
└── src/
    ├── types/                  # Shared TypeScript type definitions
    │   ├── storage.ts          # VideoProgress & ResumeStoreMap schemas
    │   ├── messages.ts         # Discriminated union request/response payloads
    │   └── index.ts            # Barrel export
    ├── background/
    │   └── service-worker.ts   # SW messaging bus & serialized storage queue
    ├── content/
    │   └── content.ts          # Video player observer, ad guard & SPA router
    └── sidepanel/
        ├── sidepanel.ts        # Dashboard UI controller & seek action handler
        └── sidepanel.css       # YouTube-styled dark theme CSS
```

---

## 🚀 Commands

All commands are executed inside the `chrome-extension/` directory:

```bash
# Typecheck codebase
pnpm typecheck

# Build production bundle to dist/
pnpm build

# Start live development with HMR
pnpm dev
```
