/**
 * API Rate Limiting Middleware
 * In-memory rate limiter with sliding window algorithm
 * For production, use Redis or similar distributed store
 */

import { NextRequest, NextResponse } from 'next/server';
import { isProduction } from '@/lib/config/envConfig';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (request: NextRequest) => string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // 60 requests per minute
};

const rateLimitStore = new Map<string, RateLimitEntry>();

const apiConfigs: Record<string, RateLimitConfig> = {
  default: { windowMs: 60 * 1000, maxRequests: 60 },
  '/api/ai': { windowMs: 60 * 1000, maxRequests: 30 },
  '/api/agent': { windowMs: 60 * 1000, maxRequests: 20 },
  '/api/worker': { windowMs: 60 * 1000, maxRequests: 10 },
  '/api/publish': { windowMs: 60 * 1000, maxRequests: 5 },
};

function getClientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : request.ip || 'unknown';
  return `rate_limit:${ip}`;
}

function getRouteConfig(pathname: string): RateLimitConfig {
  for (const [route, config] of Object.entries(apiConfigs)) {
    if (pathname.startsWith(route)) {
      return config;
    }
  }
  return defaultConfig;
}

function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}

setInterval(cleanupExpiredEntries, 60 * 1000);

export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const finalConfig: RateLimitConfig = { ...defaultConfig, ...config };

  return function rateLimitMiddleware(request: NextRequest) {
    // Skip rate limiting in development (optional, remove for production)
    if (!isProduction() && process.env.SKIP_RATE_LIMIT !== 'true') {
      return null;
    }

    const key = finalConfig.keyGenerator 
      ? finalConfig.keyGenerator(request) 
      : getClientKey(request);

    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || entry.resetTime < now) {
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + finalConfig.windowMs,
      });
      return null;
    }

    entry.count++;

    if (entry.count > finalConfig.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many requests. Limit: ${finalConfig.maxRequests} per ${finalConfig.windowMs / 1000}s`,
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(finalConfig.maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(entry.resetTime),
          },
        }
      );
    }

    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', String(finalConfig.maxRequests));
    response.headers.set('X-RateLimit-Remaining', String(finalConfig.maxRequests - entry.count));
    response.headers.set('X-RateLimit-Reset', String(entry.resetTime));

    return response;
  };
}

export function getRateLimitStats() {
  return {
    activeKeys: rateLimitStore.size,
    config: apiConfigs,
  };
}