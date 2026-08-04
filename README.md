# Kib-YT-Flush (YouTube Local Progress Resumer)

[![GitHub Repo](https://img.shields.io/badge/GitHub-kibmuikia%2Fkib--yt--flush-blue?logo=github)](https://github.com/kibmuikia/kib-yt-flush)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success)](https://developer.chrome.com/docs/extensions/reference)
[![Tampermonkey](https://img.shields.io/badge/Userscript-Tampermonkey-orange)](https://www.tampermonkey.net/)

---

**Kib-YT-Flush** is a local-first YouTube playback position resumer designed for users with YouTube Watch History disabled/paused or privacy and ad-blocking extensions enabled. It guarantees seamless position persistence across page reloads, Polymer SPA navigations, pre-roll ad interruptions, and multi-tab sessions without relying on YouTube's server-side telemetry.

The project provides two deployment flavors:
1. **Chrome Extension (Manifest V3 + TypeScript + Vite)** — Native browser extension with a side panel dashboard and multi-tab storage concurrency serialization.
2. **Tampermonkey Userscript (`yt-local-resume.user.js`)** — Lightweight, zero-dependency userscript for browser script managers.

---

## 🚀 Key Features

- **Zero Server Telemetry:** Persists watch timestamps locally using browser storage (`chrome.storage.local` or Tampermonkey `GM_setValue`).
- **YouTube Polymer SPA Aware:** Hooks into YouTube's client-side SPA router events (`yt-navigate-finish`, `yt-page-data-updated`) to track progress during dynamic page transitions.
- **Ad-Aware Interceptor:** Detects pre-roll and mid-roll ad playback via `#movie_player` element inspection to halt position recording and defer auto-resume until ad completion.
- **Smart Completion & Rewind Guard:** Automatically flushes stored records when a video exceeds **95%** completion or is rewound under **5 seconds**.
- **Deep-Link Timestamp Respect:** Yields auto-resume when explicit URL timestamp parameters (e.g., `?t=120s` or `&t=2m30s`) are present in the address bar.
- **LRU Storage Bounded Cache:** Automatically prunes oldest entries when local cache exceeds **200 videos** to prevent storage bloat.

---

## 📦 Distribution Options

### Option 1: Chrome Extension (Manifest V3)
Recommended for Chrome/Brave/Edge users who want a full dashboard UI.
- Built using **TypeScript**, **Vite 8**, and **`@crxjs/vite-plugin`**.
- Features an interactive **Chrome Side Panel** dashboard to search, view, jump to saved timestamps, or manage stored entries.
- Includes a **Background Service Worker Mutation Queue** to prevent storage race conditions across concurrent YouTube tabs.

👉 **[View Chrome Extension Technical Documentation & Setup Guide](chrome-extension/README.md)**

---

### Option 2: Tampermonkey Userscript (`yt-local-resume.user.js`)
Recommended for users using script managers (Tampermonkey, Violentmonkey, Greasemonkey) across Firefox, Chrome, or Safari.

#### Installation
1. Install [Tampermonkey](https://www.tampermonkey.net/) or a compatible userscript manager in your browser.
2. Create a new script in Tampermonkey and paste the contents of `yt-local-resume.user.js`.
3. Save and enable the script. It will run automatically on `https://www.youtube.com/watch*`.

---

## 📂 Repository Structure

```
kib-yt-flush/
├── README.md                      # High-level project overview & userscript guide
├── yt-local-resume.user.js        # Tampermonkey userscript source
├── docs/                          # Architecture & migration planning docs
└── chrome-extension/              # Chrome Extension (Manifest V3) source
    ├── README.md                  # Extension setup, build scripts & architecture
    ├── manifest.config.ts
    ├── vite.config.ts
    ├── src/
    │   ├── background/            # Serialized storage SW mutation queue
    │   ├── content/               # Video player & SPA router observer
    │   ├── sidepanel/             # Side panel dashboard UI
    │   └── types/                 # Shared TypeScript contracts
```

---

## 📜 Development Commands (Chrome Extension)

For extension development, navigate to `chrome-extension/`:

```bash
cd chrome-extension

pnpm install       # Install dependencies
pnpm typecheck     # Run TypeScript type check
pnpm build         # Package MV3 extension into dist/
pnpm dev           # Start Vite dev server with HMR
```

---

## 🛡️ License & Author

- **Author:** Kibuthi Allan (`@kibverse`)
- **License:** MIT
