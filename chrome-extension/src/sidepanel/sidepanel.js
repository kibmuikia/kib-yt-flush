/**
 * @file sidepanel.js
 * @description Logic for Kib-YT-Flush side panel dashboard.
 * Reads chrome.storage.local, binds live data, renders thumbnails, timestamps, and filters via search.
 */

const STORAGE_KEY = 'yt_local_resume_store_v1';

// DOM Elements
const videoListEl = document.getElementById('video-list');
const emptyStateEl = document.getElementById('empty-state');
const itemCountBadge = document.getElementById('item-count-badge');
const searchInput = document.getElementById('search-input');
const clearAllBtn = document.getElementById('clear-all-btn');

let currentStoreData = {};

/**
 * Formats seconds into MM:SS or HH:MM:SS string.
 * @param {number} totalSeconds 
 * @returns {string}
 */
function formatDuration(totalSeconds) {
  if (!totalSeconds || isNaN(totalSeconds)) return '0:00';
  const sec = Math.floor(totalSeconds);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  const paddedSec = seconds.toString().padStart(2, '0');
  if (hours > 0) {
    const paddedMin = minutes.toString().padStart(2, '0');
    return `${hours}:${paddedMin}:${paddedSec}`;
  }
  return `${minutes}:${paddedSec}`;
}

/**
 * Returns relative human-readable timestamp string (e.g. "5m ago").
 * @param {number} timestampMs 
 * @returns {string}
 */
function formatRelativeTime(timestampMs) {
  if (!timestampMs) return 'Recently';
  const diffSec = Math.floor((Date.now() - timestampMs) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/**
 * Renders stored entries in the side panel list.
 * @param {Object} store Data mapping videoId -> entry object
 * @param {string} filterQuery Optional query to filter titles/IDs
 */
function renderList(store = {}, filterQuery = '') {
  videoListEl.innerHTML = '';
  const entries = Object.entries(store);
  const query = filterQuery.toLowerCase().trim();

  // Sort by updated timestamp descending
  const filteredEntries = entries.filter(([videoId, data]) => {
    if (!query) return true;
    const titleMatch = data.title && data.title.toLowerCase().includes(query);
    const idMatch = videoId.toLowerCase().includes(query);
    return titleMatch || idMatch;
  }).sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0));

  itemCountBadge.textContent = String(filteredEntries.length);

  if (filteredEntries.length === 0) {
    emptyStateEl.classList.remove('hidden');
    videoListEl.style.display = 'none';
    return;
  }

  emptyStateEl.classList.add('hidden');
  videoListEl.style.display = 'flex';

  filteredEntries.forEach(([videoId, data]) => {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.dataset.videoId = videoId;

    const formattedTime = formatDuration(data.time || 0);
    const relativeTime = formatRelativeTime(data.updated);
    const titleText = data.title || `Video ID: ${videoId}`;
    const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    card.innerHTML = `
      <div class="thumbnail-wrapper">
        <img class="thumbnail-img" src="${thumbnailUrl}" alt="Thumbnail" loading="lazy" />
        <span class="time-badge">${formattedTime}</span>
      </div>
      <div class="video-info">
        <div class="video-title" title="${titleText}">${titleText}</div>
        <div class="video-meta">Saved ${relativeTime}</div>
      </div>
    `;

    // Click to navigate/jump to video timestamp in active tab
    card.addEventListener('click', () => {
      const targetUrl = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(data.time || 0)}s`;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          chrome.tabs.update(tabs[0].id, { url: targetUrl });
        }
      });
    });

    videoListEl.appendChild(card);
  });
}

/**
 * Loads stored data directly from chrome.storage.local and updates view.
 */
async function loadStorageAndRender() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    currentStoreData = result[STORAGE_KEY] || {};
    renderList(currentStoreData, searchInput.value);
  } catch (err) {
    console.error('[Kib-YT-Flush SidePanel] Error loading storage:', err);
  }
}

// Search filter event listener
searchInput.addEventListener('input', (e) => {
  renderList(currentStoreData, e.target.value);
});

// Clear All button handler
clearAllBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear all saved watch positions?')) {
    await chrome.storage.local.set({ [STORAGE_KEY]: {} });
  }
});

// Real-time synchronization via storage change listener
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[STORAGE_KEY]) {
    currentStoreData = changes[STORAGE_KEY].newValue || {};
    renderList(currentStoreData, searchInput.value);
  }
});

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  loadStorageAndRender();
});
