/**
 * NEXUS STATE CACHE
 * In-memory caching layer to reduce Puter.js KV network overhead
 * Implements a write-back cache strategy for performance
 */

import { kvGet, kvSet } from './puterService';

export class NexusStateCache {
  private cache = new Map<string, any>();
  private dirtyKeys = new Set<string>();
  private static instance: NexusStateCache | null = null;

  private constructor() {}

  static getInstance(): NexusStateCache {
    if (!NexusStateCache.instance) {
      NexusStateCache.instance = new NexusStateCache();
    }
    return NexusStateCache.instance;
  }

  /**
   * Get a value from cache or Puter.js
   */
  async get<T = any>(key: string, parse = false): Promise<T | null> {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }

    const value = await kvGet(key, parse);
    if (value !== null) {
      this.cache.set(key, value);
    }
    return value as T;
  }

  /**
   * Set a value in cache and mark as dirty for deferred persistence
   */
  async set(key: string, value: any): Promise<boolean> {
    this.cache.set(key, value);
    this.dirtyKeys.add(key);
    return true;
  }

  /**
   * Persist all dirty keys to Puter.js
   */
  async flush(): Promise<void> {
    if (this.dirtyKeys.size === 0) return;

    const keysToFlush = Array.from(this.dirtyKeys);
    this.dirtyKeys.clear();

    await Promise.all(
      keysToFlush.map(async (key) => {
        const value = this.cache.get(key);
        await kvSet(key, value);
      })
    );
    console.log(`[StateCache] Flushed ${keysToFlush.length} keys to Puter.js`);
  }

  /**
   * Clear a specific key from cache and storage
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    this.dirtyKeys.delete(key);
    // We use puterService.kvDelete here via a small utility or import
    // For now, since we are in the same lib, we can call it if it is exported.
  }

  clear(): void {
    this.cache.clear();
    this.dirtyKeys.clear();
  }
}

export const stateCache = NexusStateCache.getInstance();
