/**
 * Multi-tier caching system
 * - L1: In-memory Map (fastest, per-process)
 * - L2: Redis-ready (can be swapped in)
 * - L3: KV store fallback (Puter/Supabase)
 */

import { logger } from './logger';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  tags: string[];
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  maxSize: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<any>>();
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, size: 0, maxSize: 1000 };
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxSize = 1000) {
    this.stats.maxSize = maxSize;
    // Run cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      return undefined;
    }

    this.stats.hits++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number, tags: string[] = []): void {
    // Evict oldest entries if at capacity
    if (this.store.size >= this.stats.maxSize && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      if (oldest) {
        this.store.delete(oldest);
        this.stats.evictions++;
      }
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      tags,
    });
    this.stats.size = this.store.size;
  }

  delete(key: string): boolean {
    const existed = this.store.delete(key);
    this.stats.size = this.store.size;
    return existed;
  }

  invalidateTag(tag: string): number {
    let count = 0;
    for (const [key, entry] of this.store.entries()) {
      if (entry.tags.includes(tag)) {
        this.store.delete(key);
        count++;
      }
    }
    this.stats.size = this.store.size;
    this.stats.evictions += count;
    return count;
  }

  clear(): void {
    this.store.clear();
    this.stats.size = 0;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  private cleanup(): void {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) {
      this.stats.evictions += evicted;
      this.stats.size = this.store.size;
      logger.debug('Cache', `Cleaned up ${evicted} expired entries`);
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

// Global cache instance
const globalCache = new MemoryCache(2000);

/**
 * Cache decorator for async functions
 * Usage: cached('key', 60000, async () => { ... })
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  tags: string[] = []
): Promise<T> {
  const cached = globalCache.get<T>(key);
  if (cached !== undefined) {
    return cached;
  }

  const result = await fn();
  globalCache.set(key, result, ttlMs, tags);
  return result;
}

/**
 * Cache with stale-while-revalidate pattern
 * Returns cached value immediately, refreshes in background
 */
export async function cachedSWR<T>(
  key: string,
  ttlMs: number,
  staleTtlMs: number,
  fn: () => Promise<T>,
  tags: string[] = []
): Promise<T> {
  const entry = (globalCache as any).store.get(key) as CacheEntry<T> | undefined;
  
  if (entry) {
    const now = Date.now();
    // Return stale data but refresh in background
    if (now > entry.expiresAt && now < entry.expiresAt + staleTtlMs) {
      fn().then(result => {
        globalCache.set(key, result, ttlMs, tags);
      }).catch(() => {
        // Silently fail background refresh
      });
      return entry.value;
    }
    // Fresh cache hit
    if (now <= entry.expiresAt) {
      return entry.value;
    }
  }

  // Cache miss or expired beyond stale window
  const result = await fn();
  globalCache.set(key, result, ttlMs, tags);
  return result;
}

export function cacheGet<T>(key: string): T | undefined {
  return globalCache.get<T>(key);
}

export function cacheSet<T>(key: string, value: T, ttlMs: number, tags: string[] = []): void {
  globalCache.set(key, value, ttlMs, tags);
}

export function cacheDelete(key: string): boolean {
  return globalCache.delete(key);
}

export function cacheInvalidateTag(tag: string): number {
  return globalCache.invalidateTag(tag);
}

export function cacheStats(): CacheStats {
  return globalCache.getStats();
}

export function cacheClear(): void {
  globalCache.clear();
}

// Convenience presets
export const TTL = {
  SECOND: 1000,
  MINUTE: 60000,
  FIVE_MINUTES: 300000,
  FIFTEEN_MINUTES: 900000,
  HOUR: 3600000,
  DAY: 86400000,
} as const;

// Tag presets for cache invalidation
export const CACHE_TAGS = {
  AI_RESPONSE: 'ai:response',
  PROVIDER_STATUS: 'provider:status',
  ANALYTICS: 'analytics',
  CRM: 'crm',
  PUBLISHING: 'publishing',
  BRAND_KIT: 'brand:kit',
  SPATIAL: 'spatial',
} as const;
