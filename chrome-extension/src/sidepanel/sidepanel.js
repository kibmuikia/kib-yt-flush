/**
 * @file sidepanel.js
 * @description Logic for Kib-YT-Flush side panel dashboard.
 * Reads chrome.storage.local, binds live data, handles search, single-item deletions, clear-all modal, and seek navigation.
 */

const STORAGE_KEY = 'yt_local_resume_store_v1';

// DOM Elements
const videoListEl = document.getElementById('video-list');
const emptyStateEl = document.getElementById('empty-state');
const itemCountBadge = document.getElementById('item-count-badge');
const searchInput = document.getElementById('search-input');
const clearAllBtn = document.getElementById('clear-all-btn');

// Modal DOM Elements
const confirmModal = document.getElementById('confirm-modal');
const cancelModalBtn = document.getElementById('cancel-modal-btn');
const confirmClearBtn = document.getElementById('confirm-clear-btn');

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
 * Deletes a single video entry from chrome.storage.local.
 * @param {string} videoId 
 */
async function deleteVideoEntry(videoId) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] || {};
    if (store[videoId]) {
      delete store[videoId];
      await chrome.storage.local.set({ [STORAGE_KEY]: store });
    }
  } catch (err) {
    console.error('[Kib-YT-Flush SidePanel] Error deleting entry:', videoId, err);
  }
}

/**
 * Navigates active tab to saved timestamp URL.
 * @param {string} videoId 
 * @param {number} timestampSec 
 */
function navigateToTimestamp(videoId, timestampSec) {
  const targetUrl = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(timestampSec || 0)}s`;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0]) {
      chrome.tabs.update(tabs[0].id, { url: targetUrl });
    }
  });
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
      <div class="video-card-actions">
        <button class="delete-item-btn" title="Delete position" aria-label="Delete entry">
          <svg class="delete-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.108 0 00-7.5 0" />
          </svg>
        </button>
      </div>
    `;

    // Single item deletion
    const deleteBtn = card.querySelector('.delete-item-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Stop navigation trigger
      deleteVideoEntry(videoId);
    });

    // Click to navigate/jump to video timestamp in active tab
    card.addEventListener('click', () => {
      navigateToTimestamp(videoId, data.time || 0);
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

// Confirmation Modal Controls
clearAllBtn.addEventListener('click', () => {
  confirmModal.classList.remove('hidden');
});

cancelModalBtn.addEventListener('click', () => {
  confirmModal.classList.add('hidden');
});

confirmClearBtn.addEventListener('click', async () => {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: {} });
    confirmModal.classList.add('hidden');
  } catch (err) {
    console.error('[Kib-YT-Flush SidePanel] Error clearing storage:', err);
  }
});

// Close modal on overlay background click
confirmModal.addEventListener('click', (e) => {
  if (e.target === confirmModal) {
    confirmModal.classList.add('hidden');
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
