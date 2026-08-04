/**
 * @file service-worker.ts
 * @description Background service worker for Kib-YT-Flush (Manifest V3).
 * KYTF-207: Service Worker Storage Serialized Mutation Owner & Messaging Bus.
 */

import type {
  ExtensionMessage,
  ExtensionResponse,
  StorageResponse,
  PingResponse,
} from "../types/messages";
import type { ResumeStoreMap } from "../types/storage";
import { STORAGE_KEY } from "../types/storage";
import { logger } from "../utils/logger";

const BADGE_COLOR = "#CC0000"; // YouTube Red
const MAX_STORED_ENTRIES = 200; // LRU Capacity Limit
const LOG_MODULE = "KFL-BG";

// --- Mutation Queue Concurrency Controller ---
let storageMutationQueue: Promise<unknown> = Promise.resolve();

/**
 * Enqueues storage read-modify-write tasks into a sequential Promise chain.
 * Prevents race conditions and lost updates across concurrent tabs.
 */
function enqueueStorageMutation<T>(mutationFn: () => Promise<T>): Promise<T> {
  const next = storageMutationQueue.then(mutationFn, mutationFn);
  storageMutationQueue = next.catch(() => {});
  return next;
}

// Initialize sidePanel behavior
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) =>
      logger.error("Error setting sidePanel behavior", {
        module: LOG_MODULE,
        scope: "init",
        data: error,
      }),
    );
}

/**
 * Updates the extension badge text and background color based on stored entries count.
 */
function updateBadge(store?: ResumeStoreMap): void {
  try {
    const entriesCount = store ? Object.keys(store).length : 0;
    const badgeText = entriesCount > 0 ? String(entriesCount) : "";

    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  } catch (err) {
    logger.error("Error updating badge", {
      module: LOG_MODULE,
      scope: "badge",
      data: err,
    });
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
    logger.error("Error reading storage for badge refresh", {
      module: LOG_MODULE,
      scope: "badge",
      data: err,
    });
  }
}

// --- Lifecycle Event Listeners ---

chrome.runtime.onInstalled.addListener(
  (details: chrome.runtime.InstalledDetails) => {
    logger.info("Extension installed/updated", {
      module: LOG_MODULE,
      scope: "lifecycle",
      data: { reason: details.reason },
    });
    refreshBadgeFromStorage();
  },
);

chrome.runtime.onStartup.addListener(() => {
  logger.info("Service Worker started", {
    module: LOG_MODULE,
    scope: "lifecycle",
  });
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

// --- Message Relay Bus & Serialized Storage Mutations ---

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void,
  ): boolean => {
    if (!message || typeof message !== "object") return false;

    logger.debug("Message received", {
      module: LOG_MODULE,
      scope: "bus",
      data: {
        type: message.type,
        sender: sender.tab?.id ? `tab ${sender.tab.id}` : "extension context",
      },
    });

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
          .catch((err: Error) =>
            sendResponse({ success: false, error: err.message }),
          );
        return true;
      }

      case "SAVE_PROGRESS": {
        const { videoId, currentTime, duration, title, channelName } =
          message.payload || {};
        if (!videoId || currentTime === undefined || duration === undefined) {
          sendResponse({
            success: false,
            error: "Invalid SAVE_PROGRESS payload",
          });
          return false;
        }

        enqueueStorageMutation(async () => {
          const result = await chrome.storage.local.get(STORAGE_KEY);
          const store =
            (result[STORAGE_KEY] as ResumeStoreMap | undefined) || {};

          store[videoId] = {
            time: Math.floor(currentTime),
            duration: Math.floor(duration),
            updatedAt: Date.now(),
            title: title || store[videoId]?.title || "YouTube Video",
            channelName: channelName || store[videoId]?.channelName || "",
          };

          // Perform LRU eviction if capacity exceeded
          const keys = Object.keys(store);
          if (keys.length > MAX_STORED_ENTRIES) {
            const sortedKeys = keys.sort(
              (a, b) => (store[a]?.updatedAt || 0) - (store[b]?.updatedAt || 0),
            );
            const overflow = keys.length - MAX_STORED_ENTRIES;
            for (let i = 0; i < overflow; i++) {
              const k = sortedKeys[i];
              if (k) delete store[k];
            }
          }

          await chrome.storage.local.set({ [STORAGE_KEY]: store });
        })
          .then(() => sendResponse({ success: true }))
          .catch((err: Error) =>
            sendResponse({ success: false, error: err.message }),
          );

        return true;
      }

      case "CLEAR_VIDEO": {
        const videoId = message.payload?.videoId;
        if (!videoId) {
          sendResponse({ success: false, error: "Missing videoId" });
          return false;
        }

        enqueueStorageMutation(async () => {
          const result = await chrome.storage.local.get(STORAGE_KEY);
          const store =
            (result[STORAGE_KEY] as ResumeStoreMap | undefined) || {};
          if (store[videoId]) {
            delete store[videoId];
            await chrome.storage.local.set({ [STORAGE_KEY]: store });
          }
        })
          .then(() => sendResponse({ success: true }))
          .catch((err: Error) =>
            sendResponse({ success: false, error: err.message }),
          );

        return true;
      }

      case "CLEAR_ALL": {
        enqueueStorageMutation(async () => {
          await chrome.storage.local.set({ [STORAGE_KEY]: {} });
        })
          .then(() => sendResponse({ success: true }))
          .catch((err: Error) =>
            sendResponse({ success: false, error: err.message }),
          );

        return true;
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
        logger.warn("Unhandled message type received", {
          module: LOG_MODULE,
          scope: "bus",
          data: { type: (message as { type: string }).type },
        });
        sendResponse({ success: false, error: "Unknown message type" });
        return false;
      }
    }
  },
);

refreshBadgeFromStorage();
