/**
 * Rate Limiting Service
 * Prevents API abuse and protects provider credits.
 */
import { kvGet, kvSet } from './puterService';

export interface RateLimitConfig {
  windowMs: number;
  limit: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  limit: 10, // 10 requests per minute
};

export class RateLimiter {
  static async checkLimit(userId: string, config: RateLimitConfig = DEFAULT_CONFIG): Promise<{ allowed: boolean; remaining: number }> {
    const key = `rl_${userId}`;
    const now = Date.now();
    
    let record;
    try {
      record = await kvGet(key);
    } catch (error) {
      console.error('[RateLimiter] KV get failed:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    let requests: number[] = [];
    let windowStart = now;
    
    try {
      if (record) {
        const parsed = JSON.parse(record);
        requests = parsed.requests || [];
        windowStart = parsed.windowStart || now;
      }
    } catch (error) {
      console.warn('[RateLimiter] Failed to parse stored record, starting fresh');
      requests = [];
    }

    // Slide window: remove expired requests
    requests = requests.filter(timestamp => timestamp > now - config.windowMs);

    if (requests.length >= config.limit) {
      return { allowed: false, remaining: 0 };
    }

    requests.push(now);
    
    try {
      await kvSet(key, JSON.stringify({ requests, windowStart }));
    } catch (error) {
      console.error('[RateLimiter] KV set failed:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    return { allowed: true, remaining: config.limit - requests.length };
  }
}
