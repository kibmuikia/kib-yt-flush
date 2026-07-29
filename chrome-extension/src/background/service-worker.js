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
