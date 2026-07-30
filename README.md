# 🚀 Kib-YT-Flush

> **Local YouTube Watch Progress Persistence — Without Server Telemetry or History.**

[![GitHub Repo](https://img.shields.io/badge/GitHub-kibmuikia%2Fkib--yt--flush-blue?logo=github)](https://github.com/kibmuikia/kib-yt-flush)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success)](https://developer.chrome.com/docs/extensions/reference)
[![Tampermonkey](https://img.shields.io/badge/Userscript-Tampermonkey-orange)](https://www.tampermonkey.net/)

---

## 🎯 Purpose & Background

When YouTube Watch History is turned off or when aggressive ad-blockers and privacy shields block YouTube's telemetry endpoints (`/api/stats/watchtime`), a standard page refresh (`F5`) or hard reload resets your video player right back to `0:00`.

**Kib-YT-Flush** solves this completely client-side. It tracks playback positions locally, detects pre-roll ad interruptions, respects SPA soft navigations (`yt-navigate-finish`), and automatically resumes your video at the exact timestamp where you left off.

---

## 📁 Repository Structure & Directory Guide

```text
kib-yt-flush/
├── chrome-extension/        # 🧩 Modern Manifest V3 Chrome Extension architecture
│   ├── public/              #      Manifest V3 config and static assets / icons
│   └── src/                 #      Modular source code (background, content, sidepanel)
├── tampermonkey-script/     # 📜 Proven standalone userscript implementation
└── scaffold_extension.sh    # ⚙️ Automated scaffolding utility for local generation
```

### 1. `tampermonkey-script/`
* **Purpose:** The initial proof-of-concept and daily driver userscript.
* **Key Features:** Uses Tampermonkey's sandbox storage (`GM_setValue`/`GM_getValue`) to persist positions instantly with zero setup beyond installing the script.

### 2. `chrome-extension/`
* **Purpose:** The upcoming native Manifest V3 browser extension iteration.
* **Highlights:** 
  * **Background Service Worker (`src/background/`):** Manages extension lifecycle and sidebar integration.
  * **Content Script (`src/content/`):** Injected directly into YouTube watch pages to observe video elements and apply saved timestamps.
  * **Side Panel UI (`src/sidepanel/`):** Leverages the [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) to provide a non-intrusive sidebar for inspecting watch history, viewing saved timestamps, and clearing cache entries.

---

## ✨ Core Features

- **Zero Server Dependency:** Watch history and timestamps never leave your browser storage.
- **SPA Navigation Aware:** Fully compatible with YouTube's asynchronous client-side router.
- **Ad-Aware Interceptor:** Inspects `#movie_player` for `.ad-showing` and `.ad-interrupting` classes to prevent recording ad durations.
- **Smart Completion Guard:** Automatically flushes records when a video reaches **95%** completion or is skipped within the first **5 seconds**.
- **LRU Bounded Cache:** Keeps a clean cap of 200 recent video entries to prevent storage bloat.

---

## 🚀 Getting Started

### Option A: Tampermonkey Userscript
1. Open Tampermonkey Dashboard.
2. Create a new script and paste the code from [`tampermonkey-script/youtube-resume.user.js`](tampermonkey-script/youtube-resume.user.js).
3. Save and open any YouTube video!

### Option B: Chrome Extension (Manifest V3)
1. Navigate into `chrome-extension/`.
2. Open Chrome Extensions (`chrome://extensions/`).
3. Enable **Developer mode** in the top right.
4. Click **Load unpacked** and select the `chrome-extension/` folder.

---

## 📄 License
MIT License. Feel free to fork, modify, and contribute!
