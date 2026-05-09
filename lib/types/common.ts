/**
 * Common Type Definitions
 * Replaces 'any' usages with proper types
 */

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export interface JsonObject { [key: string]: JsonValue; }
export type JsonArray = JsonValue[];

export type UnknownObject = Record<string, unknown>;
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;

export interface Timestamped {
  createdAt: string;
  updatedAt?: string;
}

export interface Identifiable {
  id: string;
}

export type AsyncResult<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export type OperationStatus = 'idle' | 'loading' | 'success' | 'error';

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: unknown;
}

export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

export interface EventEmitter {
  on<T>(event: string, handler: EventHandler<T>): void;
  off<T>(event: string, handler: EventHandler<T>): void;
  emit<T>(event: string, data: T): void;
}

export type Callback<T> = (error: Error | null, result?: T) => void;

export interface QueueJob<T = unknown> {
  id: string;
  type: string;
  payload: T;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  processedAt?: number;
}

export type RetryStrategy = 'exponential' | 'linear' | 'fixed';

export interface RetryConfig {
  maxAttempts: number;
  strategy: RetryStrategy;
  baseDelay: number;
  maxDelay: number;
}

export interface StreamChunk<T> {
  data: T;
  done: boolean;
}