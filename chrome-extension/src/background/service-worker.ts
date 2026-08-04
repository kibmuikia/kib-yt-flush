/**
 * @file service-worker.ts
 * @description Background service worker for Kib-YT-Flush (Manifest V3).
 * KYTF-203: Service Worker Messaging Bus, Storage Relay & Badge Controller (TypeScript).
 */

import type {
  ExtensionMessage,
  ExtensionResponse,
  StorageResponse,
  PingResponse,
} from "../types/messages";
import type { ResumeStoreMap } from "../types/storage";
import { STORAGE_KEY } from "../types/storage";

const BADGE_COLOR = "#CC0000"; // YouTube Red

// Initialize sidePanel behavior
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) =>
      console.error(
        "[Kib-YT-Flush SW] Error setting sidePanel behavior:",
        error,
      ),
    );
}

/**
 * Updates the extension badge text and background color based on stored entries count.
 * @param store The stored timestamp mapping object.
 */
function updateBadge(store?: ResumeStoreMap): void {
  try {
    const entriesCount = store ? Object.keys(store).length : 0;
    const badgeText = entriesCount > 0 ? String(entriesCount) : "";

    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  } catch (err) {
    console.error("[Kib-YT-Flush SW] Error updating badge:", err);
  }
}

/**
 * Refreshes badge count directly from chrome.storage.local.
 */
async function refreshBadgeFromStorage(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const store = (result[STORAGE_KEY] as ResumeStoreMap | undefined) || {};
    updateBadge(store);
  } catch (err) {
    console.error(
      "[Kib-YT-Flush SW] Error reading storage for badge refresh:",
      err,
    );
  }
}

// --- Lifecycle Event Listeners ---

chrome.runtime.onInstalled.addListener(
  (details: chrome.runtime.InstalledDetails) => {
    console.log(
      "[Kib-YT-Flush SW] Extension installed/updated:",
      details.reason,
    );
    refreshBadgeFromStorage();
  },
);

chrome.runtime.onStartup.addListener(() => {
  console.log("[Kib-YT-Flush SW] Service Worker started.");
  refreshBadgeFromStorage();
});

// --- Storage Change Listener ---

chrome.storage.onChanged.addListener(
  (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string,
  ) => {
    if (areaName === "local" && changes[STORAGE_KEY]) {
      const store =
        (changes[STORAGE_KEY].newValue as ResumeStoreMap | undefined) || {};
      updateBadge(store);
    }
  },
);

// --- Message Relay Bus ---

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void,
  ): boolean => {
    if (!message || typeof message !== "object") return false;

    console.log(
      "[Kib-YT-Flush SW] Message received:",
      message.type,
      "from:",
      sender.tab?.id ? `tab ${sender.tab.id}` : "extension context",
    );

    switch (message.type) {
      case "GET_STORAGE": {
        chrome.storage.local
          .get(STORAGE_KEY)
          .then((result) => {
            const data =
              (result[STORAGE_KEY] as ResumeStoreMap | undefined) || {};
            const response: StorageResponse = { success: true, data };
            sendResponse(response);
          })
          .catch((err: Error) => {
            const response: StorageResponse = {
              success: false,
              error: err.message,
            };
            sendResponse(response);
          });
        return true; // Keep message channel open for async response
      }

      case "CLEAR_VIDEO": {
        const videoId = message.payload?.videoId;
        if (!videoId) {
          sendResponse({ success: false, error: "Missing videoId" });
          return false;
        }

        chrome.storage.local
          .get(STORAGE_KEY)
          .then(async (result) => {
            const store =
              (result[STORAGE_KEY] as ResumeStoreMap | undefined) || {};
            if (store[videoId]) {
              delete store[videoId];
              await chrome.storage.local.set({ [STORAGE_KEY]: store });
            }
            sendResponse({ success: true });
          })
          .catch((err: Error) =>
            sendResponse({ success: false, error: err.message }),
          );
        return true; // Keep message channel open for async response
      }

      case "CLEAR_ALL": {
        chrome.storage.local
          .set({ [STORAGE_KEY]: {} })
          .then(() => sendResponse({ success: true }))
          .catch((err: Error) =>
            sendResponse({ success: false, error: err.message }),
          );
        return true; // Keep message channel open for async response
      }

      case "PING": {
        const response: PingResponse = {
          success: true,
          status: "PONG",
          timestamp: Date.now(),
        };
        sendResponse(response);
        return false;
      }

      default: {
        console.warn(
          "[Kib-YT-Flush SW] Unhandled message type:",
          (message as { type: string }).type,
        );
        sendResponse({ success: false, error: "Unknown message type" });
        return false;
      }
    }
  },
);

// Initial startup badge sync
refreshBadgeFromStorage();
