/**
 * @file service-worker.js
 * @description Background service worker for Kib-YT-Flush (Manifest V3).
 * KYTF-103: Service Worker Bus, Storage Relay & Badge Controller.
 */

const STORAGE_KEY = 'yt_local_resume_store_v1';
const BADGE_COLOR = '#CC0000'; // YouTube Red

// Initialize sidePanel behavior
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[Kib-YT-Flush SW] Error setting sidePanel behavior:', error));

/**
 * Updates the extension badge text and background color based on stored entries count.
 * @param {Object} store The stored timestamp mapping object.
 */
function updateBadge(store) {
  try {
    const entriesCount = store ? Object.keys(store).length : 0;
    const badgeText = entriesCount > 0 ? String(entriesCount) : '';

    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  } catch (err) {
    console.error('[Kib-YT-Flush SW] Error updating badge:', err);
  }
}

/**
 * Refreshes badge count directly from chrome.storage.local.
 */
async function refreshBadgeFromStorage() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = result[STORAGE_KEY] || {};
    updateBadge(store);
  } catch (err) {
    console.error('[Kib-YT-Flush SW] Error reading storage for badge refresh:', err);
  }
}

// --- Lifecycle Event Listeners ---

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Kib-YT-Flush SW] Extension installed/updated:', details.reason);
  refreshBadgeFromStorage();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Kib-YT-Flush SW] Service Worker started.');
  refreshBadgeFromStorage();
});

// --- Storage Change Listener ---

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[STORAGE_KEY]) {
    const store = changes[STORAGE_KEY].newValue || {};
    updateBadge(store);
  }
});

// --- Message Relay Bus ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  console.log('[Kib-YT-Flush SW] Message received:', message.type, 'from:', sender.tab ? `tab ${sender.tab.id}` : 'extension context');

  switch (message.type) {
    case 'GET_STORAGE': {
      chrome.storage.local.get(STORAGE_KEY)
        .then((result) => sendResponse({ success: true, data: result[STORAGE_KEY] || {} }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // Async response
    }

    case 'CLEAR_VIDEO': {
      const { videoId } = message.payload || {};
      if (!videoId) {
        sendResponse({ success: false, error: 'Missing videoId' });
        return false;
      }

      chrome.storage.local.get(STORAGE_KEY)
        .then(async (result) => {
          const store = result[STORAGE_KEY] || {};
          if (store[videoId]) {
            delete store[videoId];
            await chrome.storage.local.set({ [STORAGE_KEY]: store });
          }
          sendResponse({ success: true });
        })
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // Async response
    }

    case 'CLEAR_ALL': {
      chrome.storage.local.set({ [STORAGE_KEY]: {} })
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // Async response
    }

    case 'PING': {
      sendResponse({ status: 'PONG', timestamp: Date.now() });
      return false;
    }

    default: {
      console.warn('[Kib-YT-Flush SW] Unhandled message type:', message.type);
      sendResponse({ success: false, error: 'Unknown message type' });
      return false;
    }
  }
});

// Initial startup badge sync
refreshBadgeFromStorage();
