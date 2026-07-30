/**
 * @file content.js
 * @description Core content script injected into YouTube pages.
 * Handles async persistence via chrome.storage.local, video playback observation,
 * completion thresholds (>95% / <5s), LRU storage eviction (200 limit), and position auto-resume.
 */

(function () {
  'use strict';

  // --- Configuration & Constants ---
  const STORAGE_KEY = 'yt_local_resume_store_v1';
  const SAVE_INTERVAL_MS = 2000;       // Track active playback position every 2s
  const MIN_SAVE_TIME_SEC = 5;          // Ignore initial 5s; purge if rewound below this
  const COMPLETION_THRESHOLD = 0.95;   // Purge storage entry once 95%+ watched
  const MAX_STORED_ENTRIES = 200;       // LRU capacity limit
  const LOG_PREFIX = '[Kib-YT-Flush]';

  // --- Internal State ---
  let currentVideoId = null;
  let saveIntervalId = null;
  let hasResumedCurrentVideo = false;
  let lastSavedTime = 0;

  // --- Logging Utilities ---
  const log = (msg, ...args) => console.log(`${LOG_PREFIX} ${msg}`, ...args);
  const warn = (msg, ...args) => console.warn(`${LOG_PREFIX} ${msg}`, ...args);
  const error = (msg, ...args) => console.error(`${LOG_PREFIX} ${msg}`, ...args);

  // --- Async Chrome Storage Layer ---

  /**
   * Retrieves raw storage object from chrome.storage.local.
   * @returns {Promise<Object>} Map of video ID to progress entry.
   */
  async function loadStore() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return result[STORAGE_KEY] || {};
    } catch (err) {
      error('Failed to load storage from chrome.storage.local:', err);
      return {};
    }
  }

  /**
   * Persists progress map to chrome.storage.local, enforcing 200-item LRU capacity.
   * @param {Object} data - Progress map to save.
   * @returns {Promise<boolean>} Success flag.
   */
  async function saveStore(data) {
    try {
      const keys = Object.keys(data);
      // LRU Eviction: prune oldest entries when exceeding max capacity limit
      if (keys.length > MAX_STORED_ENTRIES) {
        const sortedKeys = keys.sort(
          (a, b) => (data[a].updatedAt || 0) - (data[b].updatedAt || 0)
        );
        const overflowCount = keys.length - MAX_STORED_ENTRIES;
        for (let i = 0; i < overflowCount; i++) {
          delete data[sortedKeys[i]];
        }
        log(`LRU cap reached (${MAX_STORED_ENTRIES}). Evicted ${overflowCount} oldest entry/entries.`);
      }

      await chrome.storage.local.set({ [STORAGE_KEY]: data });
      return true;
    } catch (err) {
      error('Failed to write store to chrome.storage.local:', err);
      return false;
    }
  }

  /**
   * Retrieves saved timestamp for a specific video ID.
   * @param {string} videoId 
   * @returns {Promise<number|null>} Timestamp in seconds or null.
   */
  async function getSavedTimestamp(videoId) {
    if (!videoId) return null;
    const store = await loadStore();
    return store[videoId] ? store[videoId].time : null;
  }

  /**
   * Deletes a video progress entry from local storage.
   * @param {string} videoId 
   */
  async function clearVideoProgress(videoId) {
    if (!videoId) return;
    try {
      const store = await loadStore();
      if (store[videoId]) {
        delete store[videoId];
        await saveStore(store);
        log(`Cleared stored progress for video ID: ${videoId}`);
      }
    } catch (err) {
      error(`Failed to clear progress for video ID ${videoId}:`, err);
    }
  }

  /**
   * Updates playback position and metadata in chrome.storage.local.
   * Flushes entry if completion threshold reached or duration under minimum.
   */
  async function updateVideoProgress(videoId, currentTime, duration) {
    if (!videoId || !currentTime || !duration || isAdPlaying()) return;

    const roundedTime = Math.floor(currentTime);

    // Skip redundant writes if timestamp hasn't changed
    if (Math.abs(roundedTime - lastSavedTime) < 1) return;

    // Threshold Check: purge entry if past 95% complete or before 5s
    if (currentTime / duration >= COMPLETION_THRESHOLD || currentTime < MIN_SAVE_TIME_SEC) {
      await clearVideoProgress(videoId);
      return;
    }

    const metadata = getVideoMetadata();
    const store = await loadStore();

    store[videoId] = {
      time: roundedTime,
      duration: Math.floor(duration),
      updatedAt: Date.now(),
      title: metadata.title || store[videoId]?.title || 'YouTube Video',
      channelName: metadata.channelName || store[videoId]?.channelName || ''
    };

    await saveStore(store);
    lastSavedTime = roundedTime;
  }

  // --- Helper & Utility Methods ---

  /**
   * Extracts YouTube watch video ID from current URL.
   * @param {string} urlStr 
   * @returns {string|null}
   */
  function getVideoId(urlStr = window.location.href) {
    try {
      const url = new URL(urlStr);
      if (url.pathname === '/watch') {
        return url.searchParams.get('v');
      }
    } catch (err) {
      error('Failed parsing video URL:', err);
    }
    return null;
  }

  /**
   * Checks whether an ad is currently playing on the YouTube player.
   * @returns {boolean}
   */
  function isAdPlaying() {
    const playerEl = document.querySelector('#movie_player');
    return playerEl
      ? playerEl.classList.contains('ad-showing') || playerEl.classList.contains('ad-interrupting')
      : false;
  }

  /**
   * Extracts available video metadata from the DOM.
   * @returns {{title: string, channelName: string}}
   */
  function getVideoMetadata() {
    let title = '';
    let channelName = '';

    // Title discovery: watch page title header or meta tag fallback
    const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
                    document.querySelector('h1.title.ytd-video-primary-info-renderer');
    if (titleEl && titleEl.textContent.trim()) {
      title = titleEl.textContent.trim();
    } else {
      const metaTitle = document.querySelector('meta[property="og:title"]');
      if (metaTitle) title = metaTitle.getAttribute('content') || '';
    }

    // Channel discovery: channel owner container
    const channelEl = document.querySelector('#owner #channel-name a') ||
                      document.querySelector('ytd-channel-name #text');
    if (channelEl && channelEl.textContent.trim()) {
      channelName = channelEl.textContent.trim();
    }

    return { title, channelName };
  }

  // --- Core Application Logic ---

  /**
   * Restores stored playback timestamp on the main video element.
   */
  async function applyProgress(videoEl, videoId) {
    if (hasResumedCurrentVideo || isAdPlaying()) return;

    // Check if URL explicitly specifies a start timestamp (e.g. ?t=120s)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('t')) {
      log(`URL timestamp parameter present ('t=${urlParams.get('t')}'). Skipping auto-resume.`);
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
      error(`Error applying progress for ${videoId}:`, err);
    } finally {
      hasResumedCurrentVideo = true;
    }
  }

  /**
   * Starts periodic position recording timer for active video element.
   */
  function startTracking(videoEl, videoId) {
    if (saveIntervalId) {
      clearInterval(saveIntervalId);
      saveIntervalId = null;
    }

    saveIntervalId = setInterval(async () => {
      if (videoEl && !videoEl.paused && !videoEl.ended) {
        await updateVideoProgress(videoId, videoEl.currentTime, videoEl.duration);
      }
    }, SAVE_INTERVAL_MS);

    log(`Tracking started for video ID: ${videoId}`);
  }

  /**
   * Main initializer: resolves video element and binds listeners.
   */
  function init() {
    const videoId = getVideoId();
    if (!videoId) {
      currentVideoId = null;
      if (saveIntervalId) {
        clearInterval(saveIntervalId);
        saveIntervalId = null;
      }
      return;
    }

    if (videoId === currentVideoId && hasResumedCurrentVideo) return;

    currentVideoId = videoId;
    hasResumedCurrentVideo = false;
    lastSavedTime = 0;

    const locateVideoElement = () => {
      const videoEl = document.querySelector('video.html5-main-video');
      if (videoEl) {
        const setup = async () => {
          await applyProgress(videoEl, videoId);
          startTracking(videoEl, videoId);
        };

        if (videoEl.readyState >= 1) {
          setup();
        } else {
          videoEl.addEventListener('loadedmetadata', setup, { once: true });
        }
      } else {
        setTimeout(locateVideoElement, 150);
      }
    };

    locateVideoElement();
  }

  // --- Event Bindings ---

  window.addEventListener('yt-navigate-finish', () => {
    log('YouTube SPA navigation detected.');
    init();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  log('Content script loaded and initialized.');
})();
