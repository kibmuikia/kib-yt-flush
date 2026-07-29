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

