/**
 * @file content.ts
 * @description YouTube watch progress tracking and auto-resumer content script (TypeScript).
 * KYTF-204: Content Script Engine TS Refactor (Type-safe storage, DOM queries, & SPA listeners).
 */

import type { ResumeStoreMap } from "../types/storage";
import { STORAGE_KEY } from "../types/storage";

(function () {
  "use strict";

  // --- Configuration & Constants ---
  const SAVE_INTERVAL_MS = 2000; // Position recording interval (2s)
  const MIN_SAVE_TIME_SEC = 5; // Minimum threshold before saving (5s)
  const COMPLETION_THRESHOLD = 0.95; // Flush progress once past 95% complete
  const MAX_STORED_ENTRIES = 200; // Maximum entries in LRU store
  const LOG_PREFIX = "[Kib-YT-Flush]";

  // --- Internal State ---
  let currentVideoId: string | null = null;
  let saveIntervalId: number | ReturnType<typeof setInterval> | null = null;
  let hasResumedCurrentVideo = false;
  let lastSavedTime = 0;
  let retryTimeoutId: number | ReturnType<typeof setTimeout> | null = null;

  // --- Logging Utilities ---
  const log = (msg: string, ...args: unknown[]): void =>
    console.log(`${LOG_PREFIX} ${msg}`, ...args);
  const warn = (msg: string, ...args: unknown[]): void =>
    console.warn(`${LOG_PREFIX} ${msg}`, ...args);
  const error = (msg: string, ...args: unknown[]): void =>
    console.error(`${LOG_PREFIX} ${msg}`, ...args);

  // --- Storage API Abstraction (chrome.storage.local) ---

  /**
   * Retrieves stored video watch state map.
   * @returns Object mapping video IDs to watch state metadata.
   */
  async function loadStore(): Promise<ResumeStoreMap> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return (result[STORAGE_KEY] as ResumeStoreMap | undefined) || {};
    } catch (err) {
      error("Failed to read chrome.storage.local:", err);
      return {};
    }
  }

  /**
   * Saves watch progress map with LRU capacity pruning (max 200 items).
   * @param data ResumeStoreMap containing video watch progress entries.
   */
  async function saveStore(data: ResumeStoreMap): Promise<boolean> {
    try {
      const keys = Object.keys(data);
      if (keys.length > MAX_STORED_ENTRIES) {
        // Sort ascending by updatedAt; delete oldest entries
        const sortedKeys = keys.sort(
          (a, b) => (data[a]?.updatedAt || 0) - (data[b]?.updatedAt || 0),
        );
        const overflow = keys.length - MAX_STORED_ENTRIES;
        for (let i = 0; i < overflow; i++) {
          const keyToDelete = sortedKeys[i];
          if (keyToDelete) {
            delete data[keyToDelete];
          }
        }
        log(
          `LRU limit reached (${MAX_STORED_ENTRIES}). Evicted ${overflow} oldest entry/entries.`,
        );
      }

      await chrome.storage.local.set({ [STORAGE_KEY]: data });
      return true;
    } catch (err) {
      error("Failed writing to chrome.storage.local:", err);
      return false;
    }
  }

  /**
   * Fetches saved timestamp for a given video ID.
   * @param videoId Target YouTube video ID.
   */
  async function getSavedTimestamp(
    videoId: string | null,
  ): Promise<number | null> {
    if (!videoId) return null;
    const store = await loadStore();
    return store[videoId] ? store[videoId].time : null;
  }

  /**
   * Clears progress record for a video ID from chrome.storage.local.
   * @param videoId Target YouTube video ID.
   */
  async function clearVideoProgress(videoId: string | null): Promise<void> {
    if (!videoId) return;
    try {
      const store = await loadStore();
      if (store[videoId]) {
        delete store[videoId];
        await saveStore(store);
        log(`Flushed progress entry for video ID: ${videoId}`);
      }
    } catch (err) {
      error(`Error clearing progress for video ID ${videoId}:`, err);
    }
  }

  /**
   * Updates playback position and metadata in local storage.
   */
  async function updateVideoProgress(
    videoId: string | null,
    currentTime: number,
    duration: number,
  ): Promise<void> {
    if (!videoId || !currentTime || !duration || isAdPlaying()) return;

    const roundedTime = Math.floor(currentTime);

    // Skip redundant updates if position has not progressed by at least 1s
    if (Math.abs(roundedTime - lastSavedTime) < 1) return;

    // Purge entry if watched >= 95% or rewound/started under 5s
    if (
      currentTime / duration >= COMPLETION_THRESHOLD ||
      currentTime < MIN_SAVE_TIME_SEC
    ) {
      await clearVideoProgress(videoId);
      return;
    }

    const metadata = getVideoMetadata();
    const store = await loadStore();

    store[videoId] = {
      time: roundedTime,
      duration: Math.floor(duration),
      updatedAt: Date.now(),
      title: metadata.title || store[videoId]?.title || "YouTube Video",
      channelName: metadata.channelName || store[videoId]?.channelName || "",
    };

    await saveStore(store);
    lastSavedTime = roundedTime;
  }

  // --- SPA & Parsing Helper Functions ---

  /**
   * Parses video ID from URL search parameters.
   * @param urlStr Full URL string to parse (defaults to current window location).
   */
  function getVideoId(urlStr: string = window.location.href): string | null {
    try {
      const url = new URL(urlStr);
      if (url.pathname === "/watch") {
        return url.searchParams.get("v");
      }
    } catch (err) {
      error("Error parsing current URL:", err);
    }
    return null;
  }

  /**
   * Parses time string parameters (e.g., "?t=120", "?t=2m30s", "?t=1h2m3s") into seconds.
   * @param param Time parameter string extracted from URL query params.
   * @returns Timestamp in seconds or null.
   */
  function parseUrlTimestamp(param: string | null): number | null {
    if (!param) return null;

    // Direct numeric input check (e.g. "120" or "120s")
    const cleanParam = param.trim();
    if (/^\d+s?$/i.test(cleanParam)) {
      return parseInt(cleanParam, 10);
    }

    let totalSeconds = 0;
    const hoursMatch = cleanParam.match(/(\d+)\s*h/i);
    const minutesMatch = cleanParam.match(/(\d+)\s*m/i);
    const secondsMatch = cleanParam.match(/(\d+)\s*s/i);

    if (hoursMatch?.[1]) totalSeconds += parseInt(hoursMatch[1], 10) * 3600;
    if (minutesMatch?.[1]) totalSeconds += parseInt(minutesMatch[1], 10) * 60;
    if (secondsMatch?.[1]) totalSeconds += parseInt(secondsMatch[1], 10);

    return totalSeconds > 0 ? totalSeconds : null;
  }

  /**
   * Checks if video player is currently showing an advertisement.
   * Checks `#movie_player` element for ad classes and overlay elements.
   */
  function isAdPlaying(): boolean {
    const playerEl = document.querySelector<HTMLElement>("#movie_player");
    if (!playerEl) return false;

    return (
      playerEl.classList.contains("ad-showing") ||
      playerEl.classList.contains("ad-interrupting") ||
      playerEl.classList.contains("ad-created") ||
      !!document.querySelector(".ytp-ad-player-overlay, .ytp-ad-text")
    );
  }

  /**
   * Extracts video title and channel name metadata from DOM.
   */
  function getVideoMetadata(): { title: string; channelName: string } {
    let title = "";
    let channelName = "";

    const titleEl =
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
      document.querySelector("h1.title.ytd-video-primary-info-renderer");
    if (titleEl?.textContent?.trim()) {
      title = titleEl.textContent.trim();
    } else {
      const metaTitle = document.querySelector<HTMLMetaElement>(
        'meta[property="og:title"]',
      );
      if (metaTitle) title = metaTitle.getAttribute("content") || "";
    }

    const channelEl =
      document.querySelector("#owner #channel-name a") ||
      document.querySelector("ytd-channel-name #text");
    if (channelEl?.textContent?.trim()) {
      channelName = channelEl.textContent.trim();
    }

    return { title, channelName };
  }

  // --- Navigation & Core Resumer Engine ---

  /**
   * Restores position on main HTML5 video element if no URL timestamp parameter is present.
   * @param videoEl Target HTML5 video element.
   * @param videoId Target YouTube video ID.
   */
  async function applyProgress(
    videoEl: HTMLVideoElement,
    videoId: string,
  ): Promise<void> {
    if (hasResumedCurrentVideo || isAdPlaying()) return;

    // Check for explicit deep-link URL timestamp override (?t=... or &t=...)
    const urlParams = new URLSearchParams(window.location.search);
    const rawTimeParam = urlParams.get("t");
    const explicitTimestamp = parseUrlTimestamp(rawTimeParam);

    if (explicitTimestamp !== null) {
      log(
        `URL timestamp parameter detected ('t=${rawTimeParam}' => ${explicitTimestamp}s). Skipping auto-resume.`,
      );
      hasResumedCurrentVideo = true;
      return;
    }

    try {
      const savedTime = await getSavedTimestamp(videoId);
      if (savedTime && savedTime > MIN_SAVE_TIME_SEC) {
        log(`Resuming video ${videoId} at ${savedTime}s.`);
        videoEl.currentTime = savedTime;
      }
    } catch (err) {
      error(`Failed applying saved progress for ${videoId}:`, err);
    } finally {
      hasResumedCurrentVideo = true;
    }
  }

  /**
   * Disposes of active tracking interval and pending retry timeouts.
   */
  function cleanup(): void {
    if (saveIntervalId !== null) {
      clearInterval(saveIntervalId);
      saveIntervalId = null;
    }
    if (retryTimeoutId !== null) {
      clearTimeout(retryTimeoutId);
      retryTimeoutId = null;
    }
  }

  /**
   * Starts periodic timer to save playback position every 2000ms.
   * @param videoEl Target HTML5 video element.
   * @param videoId Target YouTube video ID.
   */
  function startTracking(videoEl: HTMLVideoElement, videoId: string): void {
    cleanup();

    saveIntervalId = setInterval(async () => {
      // Pause updates while video is paused, ended, or showing an ad
      if (videoEl && !videoEl.paused && !videoEl.ended && !isAdPlaying()) {
        await updateVideoProgress(
          videoId,
          videoEl.currentTime,
          videoEl.duration,
        );
      }
    }, SAVE_INTERVAL_MS);

    log(`Started position tracking for video ID: ${videoId}`);
  }

  /**
   * Primary initialization runner for watch page navigation.
   */
  function init(): void {
    cleanup();

    const videoId = getVideoId();
    if (!videoId) {
      currentVideoId = null;
      log("Not on a valid watch page; tracking idle.");
      return;
    }

    // Guard against duplicate initialization on same video
    if (videoId === currentVideoId && hasResumedCurrentVideo) {
      return;
    }

    currentVideoId = videoId;
    hasResumedCurrentVideo = false;
    lastSavedTime = 0;

    log(`Initializing watch page engine for video ID: ${videoId}`);

    const locateVideoElement = (attemptsLeft = 30): void => {
      const videoEl = document.querySelector<HTMLVideoElement>(
        "video.html5-main-video",
      );

      if (videoEl) {
        const executeSetup = async (): Promise<void> => {
          // If ad is currently showing, defer resume until ad completes
          if (isAdPlaying()) {
            log("Ad detected during setup; deferring auto-resume.");
            videoEl.addEventListener("timeupdate", function onAdCheck() {
              if (!isAdPlaying()) {
                videoEl.removeEventListener("timeupdate", onAdCheck);
                applyProgress(videoEl, videoId);
                startTracking(videoEl, videoId);
              }
            });
            return;
          }

          await applyProgress(videoEl, videoId);
          startTracking(videoEl, videoId);
        };

        if (videoEl.readyState >= 1) {
          executeSetup();
        } else {
          videoEl.addEventListener("loadedmetadata", executeSetup, {
            once: true,
          });
        }
      } else if (attemptsLeft > 0) {
        retryTimeoutId = setTimeout(
          () => locateVideoElement(attemptsLeft - 1),
          150,
        );
      } else {
        warn(`Could not locate HTML5 video element for video ID: ${videoId}`);
      }
    };

    locateVideoElement();
  }

  // --- SPA Router Event Listeners ---

  // Listen to YouTube Polymer SPA navigation events
  window.addEventListener("yt-navigate-finish", () => {
    log(
      "YouTube SPA navigation finished (yt-navigate-finish). Re-initializing.",
    );
    init();
  });

  window.addEventListener("yt-page-data-updated", () => {
    log("YouTube page data updated (yt-page-data-updated). Re-checking state.");
    init();
  });

  // Cleanup timers on unload
  window.addEventListener("beforeunload", cleanup);

  // Initial Bootstrapping
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  log("SPA Router observer & Ad Guard layers attached.");
})();
