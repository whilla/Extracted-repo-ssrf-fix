/**
 * Rate Limiting Service
 * Prevents API abuse and protects provider credits.
 * Uses database-backed rate limiting for horizontal scalability.
 */
import { createClient } from '@/lib/supabase/server';

export interface RateLimitConfig {
  windowMs: number;
  limit: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000,
  limit: 10,
};

export class RateLimiter {
  static async checkLimit(
    userId: string,
    config: RateLimitConfig = DEFAULT_CONFIG,
    jobType: string = 'default'
  ): Promise<{ allowed: boolean; remaining: number }> {
    try {
      const supabase = await createClient();
      if (!supabase) {
        return { allowed: false, remaining: 0 };
      }

      const windowSeconds = Math.ceil(config.windowMs / 1000);
      const { data, error } = await (supabase as any).rpc('check_rate_limit', {
        p_user_id: userId,
        p_job_type: jobType,
        p_max_requests: config.limit,
        p_window_seconds: windowSeconds,
      });

      if (error) {
        console.error('[RateLimiter] RPC error:', error.message);
        return { allowed: false, remaining: 0 };
      }

      // RPC returns allowed boolean; remaining is approximate
      return { allowed: data === true, remaining: data ? 1 : 0 };
    } catch (error) {
      console.error('[RateLimiter] Check failed:', error instanceof Error ? error.message : 'Unknown error');
      return { allowed: false, remaining: 0 };
    }
  }
}
