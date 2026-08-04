/**
 * @file messages.ts
 * @description Strongly typed request/response payload contracts for chrome.runtime messaging bus.
 */

import type { ResumeStoreMap } from "./storage";

/**
 * Supported message action type discriminators.
 */
export type MessageType =
  | "GET_STORAGE"
  | "SAVE_PROGRESS"
  | "CLEAR_VIDEO"
  | "CLEAR_ALL"
  | "PING";

/**
 * Request to retrieve current stored video resume map from chrome.storage.local.
 */
export interface GetStorageMessage {
  type: "GET_STORAGE";
}

/**
 * Request to update or insert a video progress entry in storage via background mutation owner.
 */
export interface SaveProgressMessage {
  type: "SAVE_PROGRESS";
  payload: {
    videoId: string;
    currentTime: number;
    duration: number;
    title: string;
    channelName: string;
  };
}

/**
 * Request to remove a specific video entry from stored progress map by video ID.
 */
export interface ClearVideoMessage {
  type: "CLEAR_VIDEO";
  payload: {
    videoId: string;
  };
}

/**
 * Request to clear all stored YouTube video progress entries.
 */
export interface ClearAllMessage {
  type: "CLEAR_ALL";
}

/**
 * Keep-alive / diagnostics ping message.
 */
export interface PingMessage {
  type: "PING";
}

/**
 * Discriminated union of all messages routed via chrome.runtime messaging bus.
 */
export type ExtensionMessage =
  | GetStorageMessage
  | SaveProgressMessage
  | ClearVideoMessage
  | ClearAllMessage
  | PingMessage;

/**
 * Standardized response contract returned asynchronously from message handlers.
 */
export interface ExtensionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  status?: string;
  timestamp?: number;
}

/** Specialized storage response type */
export type StorageResponse = ExtensionResponse<ResumeStoreMap>;

/** Specialized ping response type */
export type PingResponse = ExtensionResponse<null>;
