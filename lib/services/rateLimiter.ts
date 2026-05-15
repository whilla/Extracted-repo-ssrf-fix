/**
 * Enhanced Rate Limiter with In-Memory Fallback
 * Works without Supabase by falling back to in-memory rate limiting.
 * Supports per-user, per-IP, and per-route rate limiting.
 */

import { getSupabaseAdminClient } from '@/lib/supabase/server';

export interface RateLimitConfig {
  windowMs: number;
  limit: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000,
  limit: 60,
};

const ROUTE_CONFIGS: Record<string, RateLimitConfig> = {
  '/api/ai/chat': { windowMs: 60_000, limit: 20 },
  '/api/orchestrator': { windowMs: 60_000, limit: 5 },
  '/api/posts/generate': { windowMs: 60_000, limit: 10 },
  '/api/video': { windowMs: 60_000, limit: 3 },
  '/api/agent/chat': { windowMs: 60_000, limit: 30 },
  '/api/ecommerce': { windowMs: 60_000, limit: 10 },
  '/api/crm': { windowMs: 60_000, limit: 30 },
  '/api/publish': { windowMs: 60_000, limit: 15 },
  '/api/training': { windowMs: 60_000, limit: 2 },
  '/api/worker': { windowMs: 60_000, limit: 5 },
  default: { windowMs: 60_000, limit: 60 },
};

function getRouteConfig(pathname: string): RateLimitConfig {
  for (const [prefix, config] of Object.entries(ROUTE_CONFIGS)) {
    if (prefix !== 'default' && pathname.startsWith(prefix)) {
      return config;
    }
  }
  return ROUTE_CONFIGS.default;
}

function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (now >= entry.resetAt) {
      memoryStore.delete(key);
    }
  }
}

setInterval(cleanupExpiredEntries, 60_000);

export class RateLimiter {
  static async checkLimit(
    userId: string,
    config: RateLimitConfig = DEFAULT_CONFIG,
    jobType: string = 'default'
  ): Promise<{ allowed: boolean; remaining: number }> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const supabase = getSupabaseAdminClient();
        if (supabase) {
          const windowSeconds = Math.ceil(config.windowMs / 1000);
          const { data, error } = await (supabase as any).rpc('check_rate_limit', {
            p_user_id: userId,
            p_job_type: jobType,
            p_max_requests: config.limit,
            p_window_seconds: windowSeconds,
          });

          if (!error) {
            return { allowed: data === true, remaining: data ? 1 : 0 };
          }
        }
      } catch {
        // Fall through to in-memory
      }
    }

    return this.checkLimitInMemory(userId, jobType, config);
  }

  static checkLimitInMemory(
    key: string,
    route: string = 'default',
    config?: RateLimitConfig
  ): { allowed: boolean; remaining: number } {
    const routeConfig = config || getRouteConfig(route);
    const now = Date.now();
    const storeKey = `rl:${key}:${route}`;

    const entry = memoryStore.get(storeKey);

    if (!entry || now >= entry.resetAt) {
      const resetAt = now + routeConfig.windowMs;
      memoryStore.set(storeKey, { count: 1, resetAt });
      return { allowed: true, remaining: routeConfig.limit - 1 };
    }

    if (entry.count >= routeConfig.limit) {
      return { allowed: false, remaining: 0 };
    }

    entry.count++;
    return { allowed: true, remaining: routeConfig.limit - entry.count };
  }

  static getStats(): { totalKeys: number; activeEntries: number } {
    const now = Date.now();
    let active = 0;
    for (const entry of memoryStore.values()) {
      if (now < entry.resetAt) active++;
    }
    return { totalKeys: memoryStore.size, activeEntries: active };
  }

  static reset(key?: string) {
    if (key) {
      for (const storeKey of memoryStore.keys()) {
        if (storeKey.includes(key)) {
          memoryStore.delete(storeKey);
        }
      }
    } else {
      memoryStore.clear();
    }
  }
}
