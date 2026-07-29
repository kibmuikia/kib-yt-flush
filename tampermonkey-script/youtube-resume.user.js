// ==UserScript==
// @name         YouTube Local Watch Progress Resumer
// @namespace    https://github.com/kibdev
// @version      1.1.0
// @description  Saves and resumes YouTube video timestamps locally without watch history or server-side sync.
// @author       kibdev
// @match        https://www.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // --- Configuration ---
  const STORAGE_KEY = 'yt_local_resume_store_v1';
  const SAVE_INTERVAL_MS = 2000;      // Persist state every 2s
  const MIN_SAVE_TIME_SEC = 5;         // Ignore initial 5s
  const COMPLETION_THRESHOLD = 0.95;  // Clear entry when >95% watched
  const MAX_STORED_ENTRIES = 200;      // LRU limit
  const LOG_PREFIX = '[YT-Resume]';

  // --- Internal State ---
  let currentVideoId = null;
  let saveIntervalId = null;
  let hasResumedCurrentVideo = false;
  let lastSavedTime = 0;

  // --- Logging Utilities ---
  const log = (msg, ...args) => console.log(`${LOG_PREFIX} ${msg}`, ...args);
  const warn = (msg, ...args) => console.warn(`${LOG_PREFIX} ${msg}`, ...args);
  const error = (msg, ...args) => console.error(`${LOG_PREFIX} ${msg}`, ...args);

  // --- Helper Functions ---

  function getVideoId(urlStr = window.location.href) {
    try {
      const url = new URL(urlStr);
      if (url.pathname === '/watch') {
        return url.searchParams.get('v');
      }
    } catch (e) {
      error('Error parsing video URL:', e);
    }
    return null;
  }

  function loadStore() {
    try {
      const raw = GM_getValue(STORAGE_KEY, '{}');
      return JSON.parse(raw);
    } catch (e) {
      error('Failed to parse progress storage:', e);
      return {};
    }
  }

  function saveStore(data) {
    try {
      const keys = Object.keys(data);
      if (keys.length > MAX_STORED_ENTRIES) {
        const oldestKey = keys.sort((a, b) => (data[a].updatedAt || 0) - (data[b].updatedAt || 0))[0];
        delete data[oldestKey];
      }
      GM_setValue(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      error('Failed to save progress to GM storage:', e);
    }
  }

  function getSavedTimestamp(videoId) {
    if (!videoId) return null;
    const store = loadStore();
    return store[videoId] ? store[videoId].time : null;
  }

  function isAdPlaying() {
    const playerEl = document.querySelector('#movie_player');
    return playerEl ? playerEl.classList.contains('ad-showing') || playerEl.classList.contains('ad-interrupting') : false;
  }

  function updateVideoProgress(videoId, currentTime, duration) {
    if (!videoId || !currentTime || !duration || isAdPlaying()) return;

    const roundedTime = Math.floor(currentTime);
    if (Math.abs(roundedTime - lastSavedTime) < 1) return;

    if (currentTime / duration >= COMPLETION_THRESHOLD || currentTime < MIN_SAVE_TIME_SEC) {
      clearVideoProgress(videoId);
      return;
    }

    const store = loadStore();
    store[videoId] = {
      time: roundedTime,
      duration: Math.floor(duration),
      updatedAt: Date.now()
    };
    saveStore(store);
    lastSavedTime = roundedTime;
  }

  function clearVideoProgress(videoId) {
    if (!videoId) return;
    const store = loadStore();
    if (store[videoId]) {
      delete store[videoId];
      saveStore(store);
      log(`Cleared saved progress for video ID: ${videoId}`);
    }
  }

  // --- Core Application Logic ---

  function applyProgress(videoEl, videoId) {
    if (hasResumedCurrentVideo || isAdPlaying()) return;

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('t')) {
      log(`URL timestamp parameter present ('t=${urlParams.get('t')}'). Skipping auto-resume.`);
      hasResumedCurrentVideo = true;
      return;
    }

    const savedTime = getSavedTimestamp(videoId);
    if (savedTime && savedTime > MIN_SAVE_TIME_SEC) {
      log(`Resuming video ${videoId} at ${savedTime}s.`);
      videoEl.currentTime = savedTime;
    }
    hasResumedCurrentVideo = true;
  }

  function startTracking(videoEl, videoId) {
    if (saveIntervalId) {
      clearInterval(saveIntervalId);
      saveIntervalId = null;
    }

    saveIntervalId = setInterval(() => {
      if (videoEl && !videoEl.paused && !videoEl.ended) {
        updateVideoProgress(videoId, videoEl.currentTime, videoEl.duration);
      }
    }, SAVE_INTERVAL_MS);

    log(`Tracking started for video ID: ${videoId}`);
  }

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
        const setup = () => {
          applyProgress(videoEl, videoId);
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

})();
