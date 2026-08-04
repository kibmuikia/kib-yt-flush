/**
 * @file storage.ts
 * @description Core domain type definitions for YouTube video progress state and Chrome local storage mapping.
 */

/**
 * Storage key used in chrome.storage.local for persisting YouTube progress data.
 */
export const STORAGE_KEY = "yt_local_resume_store_v1" as const;
export type StorageKeyType = typeof STORAGE_KEY;

/**
 * Represents saved playback state for a single YouTube video.
 */
export interface VideoProgress {
  /** Saved playback position in seconds */
  time: number;
  /** Total video duration in seconds */
  duration: number;
  /** Unix timestamp (ms) when position was last recorded */
  updatedAt: number;
  /** Sanitized title of YouTube video */
  title: string;
  /** Name of YouTube channel or uploader */
  channelName: string;
}

/**
 * Map of YouTube Video ID (key) to VideoProgress object.
 */
export type ResumeStoreMap = Record<string, VideoProgress>;
