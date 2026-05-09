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
    
    let record = await kvGet(key);
    let { requests, windowStart } = record ? JSON.parse(record) : { requests: [], windowStart: now };

    // Slide window: remove expired requests
    requests = requests.filter(timestamp => timestamp > now - config.windowMs);

    if (requests.length >= config.limit) {
      return { allowed: false, remaining: 0 };
    }

    requests.push(now);
    await kvSet(key, JSON.stringify({ requests, windowStart }));
    
    return { allowed: true, remaining: config.limit - requests.length };
  }
}
