/**
 * @file content.ts
 * @description YouTube watch progress tracking and auto-resumer content script (TypeScript).
 * KYTF-207: Content Script Engine (Routed mutations through Background SW & navigation fix).
 */

import type { ResumeStoreMap } from "../types/storage";
import type { StorageResponse, ExtensionResponse } from "../types/messages";
import { STORAGE_KEY } from "../types/storage";
import { logger } from "../utils/logger";

(function () {
  "use strict";

  // --- Configuration & Constants ---
  const SAVE_INTERVAL_MS = 2000; // Position recording interval (2s)
  const MIN_SAVE_TIME_SEC = 5; // Minimum threshold before saving (5s)
  const COMPLETION_THRESHOLD = 0.95; // Flush progress once past 95% complete
  const LOG_MODULE = "KFL-ENG";

  // --- Internal State ---
  let currentVideoId: string | null = null;
  let saveIntervalId: number | ReturnType<typeof setInterval> | null = null;
  let hasResumedCurrentVideo = false;
  let lastSavedTime = 0;
  let retryTimeoutId: number | ReturnType<typeof setTimeout> | null = null;

  // --- Storage & Messaging Interop ---

  /**
   * Reads current resume map from background service worker/local storage.
   */
  async function loadStore(): Promise<ResumeStoreMap> {
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "GET_STORAGE",
      })) as StorageResponse;
      if (response && response.success && response.data) {
        return response.data;
      }
      const raw = await chrome.storage.local.get(STORAGE_KEY);
      return (raw[STORAGE_KEY] as ResumeStoreMap | undefined) || {};
    } catch (err) {
      logger.error("Failed to read storage state", {
        module: LOG_MODULE,
        scope: "storage",
        data: err,
      });
      return {};
    }
  }

  /**
   * Fetches saved timestamp for a given video ID.
   */
  async function getSavedTimestamp(
    videoId: string | null,
  ): Promise<number | null> {
    if (!videoId) return null;
    const store = await loadStore();
    return store[videoId] ? store[videoId].time : null;
  }

  /**
   * Routes clear progress request through serialized background SW mutation owner.
   */
  async function clearVideoProgress(videoId: string | null): Promise<void> {
    if (!videoId) return;
    try {
      await chrome.runtime.sendMessage({
        type: "CLEAR_VIDEO",
        payload: { videoId },
      });
      logger.info("Dispatched CLEAR_VIDEO request", {
        module: LOG_MODULE,
        scope: "progress",
        data: { videoId },
      });
    } catch (err) {
      logger.error("Error requesting clear for video ID", {
        module: LOG_MODULE,
        scope: "progress",
        data: { videoId, error: err },
      });
    }
  }

  /**
   * Routes update video progress request through serialized background SW mutation owner.
   */
  async function updateVideoProgress(
    videoId: string | null,
    currentTime: number,
    duration: number,
  ): Promise<void> {
    if (!videoId || !currentTime || !duration || isAdPlaying()) return;

    const roundedTime = Math.floor(currentTime);

    if (Math.abs(roundedTime - lastSavedTime) < 1) return;

    if (
      currentTime / duration >= COMPLETION_THRESHOLD ||
      currentTime < MIN_SAVE_TIME_SEC
    ) {
      await clearVideoProgress(videoId);
      return;
    }

    const metadata = getVideoMetadata();

    try {
      const response = (await chrome.runtime.sendMessage({
        type: "SAVE_PROGRESS",
        payload: {
          videoId,
          currentTime: roundedTime,
          duration,
          title: metadata.title,
          channelName: metadata.channelName,
        },
      })) as ExtensionResponse;

      if (response?.success) {
        lastSavedTime = roundedTime;
      }
    } catch (err) {
      logger.error("Failed to dispatch SAVE_PROGRESS to service worker", {
        module: LOG_MODULE,
        scope: "progress",
        data: err,
      });
    }
  }

  // --- SPA & Parsing Helper Functions ---

  function getVideoId(urlStr: string = window.location.href): string | null {
    try {
      const url = new URL(urlStr);
      if (url.pathname === "/watch") {
        return url.searchParams.get("v");
      }
    } catch (err) {
      logger.error("Error parsing current URL", {
        module: LOG_MODULE,
        scope: "url-parse",
        data: err,
      });
    }
    return null;
  }

  function parseUrlTimestamp(param: string | null): number | null {
    if (!param) return null;

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

  async function applyProgress(
    videoEl: HTMLVideoElement,
    videoId: string,
  ): Promise<void> {
    if (hasResumedCurrentVideo || isAdPlaying()) return;

    const urlParams = new URLSearchParams(window.location.search);
    const rawTimeParam = urlParams.get("t");
    const explicitTimestamp = parseUrlTimestamp(rawTimeParam);

    if (explicitTimestamp !== null) {
      logger.info("URL timestamp parameter detected; skipping auto-resume", {
        module: LOG_MODULE,
        scope: "resume",
        data: { rawTimeParam, explicitTimestamp },
      });
      hasResumedCurrentVideo = true;
      return;
    }

    try {
      const savedTime = await getSavedTimestamp(videoId);
      if (savedTime && savedTime > MIN_SAVE_TIME_SEC) {
        logger.info(`Resuming video ${videoId} at ${savedTime}s`, {
          module: LOG_MODULE,
          scope: "resume",
          data: { videoId, savedTime },
        });
        videoEl.currentTime = savedTime;
      }
    } catch (err) {
      logger.error("Failed applying saved progress", {
        module: LOG_MODULE,
        scope: "resume",
        data: { videoId, error: err },
      });
    } finally {
      hasResumedCurrentVideo = true;
    }
  }

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

  function startTracking(videoEl: HTMLVideoElement, videoId: string): void {
    cleanup();

    saveIntervalId = setInterval(async () => {
      if (videoEl && !videoEl.paused && !videoEl.ended && !isAdPlaying()) {
        await updateVideoProgress(
          videoId,
          videoEl.currentTime,
          videoEl.duration,
        );
      }
    }, SAVE_INTERVAL_MS);

    logger.info("Started position tracking for video", {
      module: LOG_MODULE,
      scope: "tracker",
      data: { videoId },
    });
  }

  /**
   * Primary initialization runner for watch page navigation.
   */
  function init(): void {
    const videoId = getVideoId();
    if (!videoId) {
      cleanup();
      currentVideoId = null;
      logger.debug("Not on a valid watch page; tracking idle", {
        module: LOG_MODULE,
        scope: "init",
      });
      return;
    }

    // Guard against duplicate navigation calls BEFORE calling cleanup()
    if (
      videoId === currentVideoId &&
      hasResumedCurrentVideo &&
      saveIntervalId !== null
    ) {
      return;
    }

    cleanup();

    currentVideoId = videoId;
    hasResumedCurrentVideo = false;
    lastSavedTime = 0;

    logger.info("Initializing watch page engine", {
      module: LOG_MODULE,
      scope: "init",
      data: { videoId },
    });

    const locateVideoElement = (attemptsLeft = 30): void => {
      const videoEl = document.querySelector<HTMLVideoElement>(
        "video.html5-main-video",
      );

      if (videoEl) {
        const executeSetup = async (): Promise<void> => {
          if (isAdPlaying()) {
            logger.info("Ad detected during setup; deferring auto-resume", {
              module: LOG_MODULE,
              scope: "ad-guard",
            });
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
        logger.warn("Could not locate HTML5 video element", {
          module: LOG_MODULE,
          scope: "init",
          data: { videoId },
        });
      }
    };

    locateVideoElement();
  }

  // --- SPA Router Event Listeners ---

  window.addEventListener("yt-navigate-finish", () => {
    logger.debug("YouTube SPA navigation finished (yt-navigate-finish)", {
      module: LOG_MODULE,
      scope: "router",
    });
    init();
  });

  window.addEventListener("yt-page-data-updated", () => {
    logger.debug("YouTube page data updated (yt-page-data-updated)", {
      module: LOG_MODULE,
      scope: "router",
    });
    init();
  });

  window.addEventListener("beforeunload", cleanup);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  logger.debug("SPA Router observer & Ad Guard layers attached", {
    module: LOG_MODULE,
    scope: "lifecycle",
  });
})();
