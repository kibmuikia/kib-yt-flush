#!/usr/bin/env bash
set -e

# Target Chrome Extension directory inside project root
EXT_DIR="chrome-extension"

echo "Scaffolding ${EXT_DIR} structure..."

mkdir -p "${EXT_DIR}/public/icons"
mkdir -p "${EXT_DIR}/src/background"
mkdir -p "${EXT_DIR}/src/content"
mkdir -p "${EXT_DIR}/src/sidepanel"

# package.json
cat << 'JSON' > "${EXT_DIR}/package.json"
{
  "name": "kib-yt-flush",
  "version": "1.1.0",
  "description": "Chrome extension (Manifest V3) for local YouTube watch progress resume.",
  "private": true,
  "scripts": {
    "build": "echo \"Build script placeholder\""
  }
}
JSON

# manifest.json
cat << 'JSON' > "${EXT_DIR}/public/manifest.json"
{
  "manifest_version": 3,
  "name": "Kib-YT-Flush",
  "version": "1.1.0",
  "description": "Locally persist and resume YouTube playback timestamps without watch history.",
  "permissions": [
    "storage",
    "sidePanel"
  ],
  "host_permissions": [
    "https://www.youtube.com/*"
  ],
  "background": {
    "service_worker": "src/background/service-worker.js"
  },
  "content_scripts": [
    {
      "matches": ["https://www.youtube.com/*"],
      "js": ["src/content/content.js"],
      "run_at": "document_start"
    }
  ],
  "side_panel": {
    "default_path": "src/sidepanel/sidepanel.html"
  },
  "icons": {
    "16": "public/icons/icon16.png",
    "48": "public/icons/icon48.png",
    "128": "public/icons/icon128.png"
  }
}
JSON

# service-worker.js
cat << 'JS' > "${EXT_DIR}/src/background/service-worker.js"
/**
 * @file service-worker.js
 * @description Background service worker for Kib-YT-Flush (Manifest V3).
 * Handles extension lifecycle events and side panel configuration.
 */

// Enable side panel to open on action icon click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Listen for installation or updates
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Kib-YT-Flush] Extension installed:', details.reason);
});
JS

# content.js
cat << 'JS' > "${EXT_DIR}/src/content/content.js"
/**
 * @file content.js
 * @description Content script injected into YouTube watch pages.
 * Intercepts video playback, stores timestamps locally via chrome.storage.local,
 * and auto-resumes video positions.
 */

(function () {
  'use strict';

  // --- Configuration & Constants ---
  const STORAGE_KEY = 'yt_local_resume_store_v1';
  const SAVE_INTERVAL_MS = 2000;
  const MIN_SAVE_TIME_SEC = 5;
  const COMPLETION_THRESHOLD = 0.95;
  const MAX_STORED_ENTRIES = 200;
  const LOG_PREFIX = '[Kib-YT-Flush]';

  // --- Internal State Placeholders ---
  // TODO: Initialize state variables (currentVideoId, saveIntervalId, etc.)

  // --- Core Helper Functions ---
  // TODO: Implement getVideoId, loadStore, saveStore, isAdPlaying, etc.

  console.log(`${LOG_PREFIX} Content script loaded.`);
})();
JS

# sidepanel.html
cat << 'HTML' > "${EXT_DIR}/src/sidepanel/sidepanel.html"
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Kib-YT-Flush Side Panel</title>
  <link rel="stylesheet" href="sidepanel.css">
</head>
<body>
  <div class="container">
    <h2>Kib-YT-Flush</h2>
    <p class="subtitle">Saved Watch Progress</p>
    <!-- TODO: Render list of saved videos and timestamps -->
    <div id="video-list"></div>
    <button id="clear-all-btn">Clear All History</button>
  </div>
  <script src="sidepanel.js"></script>
</body>
</html>
HTML

# sidepanel.css
cat << 'CSS' > "${EXT_DIR}/src/sidepanel/sidepanel.css"
/**
 * @file sidepanel.css
 * @description Styles for Kib-YT-Flush side panel interface.
 */

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  margin: 0;
  padding: 16px;
  background-color: #f9f9f9;
  color: #333;
}

.container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

h2 {
  margin: 0;
  font-size: 18px;
  color: #ff0000;
}

.subtitle {
  margin: 0;
  font-size: 12px;
  color: #666;
}

#video-list {
  margin-top: 8px;
  max-height: 70vh;
  overflow-y: auto;
}

button {
  padding: 8px 12px;
  background-color: #ff0000;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}

button:hover {
  background-color: #cc0000;
}
CSS

#sidepanel.js
cat << 'JS' > "${EXT_DIR}/src/sidepanel/sidepanel.js"
/**
 * @file sidepanel.js
 * @description Logic for the Kib-YT-Flush side panel.
 * Reads chrome.storage.local and displays stored video progress items.
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Kib-YT-Flush] Side panel initialized.');
  // TODO: Fetch stored progress and populate #video-list
});
JS

# README.md
cat << 'MD' > "${EXT_DIR}/README.md"
# Kib-YT-Flush Chrome Extension (Manifest V3)

Modern Manifest V3 Chrome Extension architecture for **Kib-YT-Flush**.

## Directory Structure
- `public/`: Static assets, manifest.json, and icons.
- `src/`: Source code organized by concern (`background`, `content`, `sidepanel`).
MD

echo "Successfully scaffolded ${EXT_DIR}!"
