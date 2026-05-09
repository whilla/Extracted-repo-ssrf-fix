export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  key?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(config: RateLimitConfig): RateLimitResult {
  const { maxRequests, windowMs, key = 'default' } = config;
  const now = Date.now();
  
  const entry = rateLimitStore.get(key);
  
  if (!entry || now >= entry.resetAt) {
    const resetAt = now + windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt,
    };
  }
  
  if (entry.count >= maxRequests) {
    const retryAfter = entry.resetAt - now;
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter,
    };
  }
  
  entry.count++;
  
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

export function clearRateLimit(key?: string): void {
  if (key) {
    rateLimitStore.delete(key);
  } else {
    rateLimitStore.clear();
  }
}

export function getRateLimitStatus(key: string): { count: number; resetAt: number } | undefined {
  return rateLimitStore.get(key);
}

export const API_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 30,
  windowMs: 60000,
  key: 'api',
};

export const POLLING_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 60000,
  key: 'polling',
};