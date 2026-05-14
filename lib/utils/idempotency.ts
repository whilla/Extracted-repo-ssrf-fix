/**
 * Idempotency utility for safe retries
 * Prevents duplicate operations (payments, posts, etc.)
 */

import { kvGet, kvSet } from '@/lib/services/puterService';
import { logger } from './logger';

interface IdempotencyRecord {
  key: string;
  status: 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

const IDEMPOTENCY_PREFIX = 'idempotency:';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if an idempotency key exists and return cached result
 */
export async function checkIdempotency(key: string): Promise<
  | { status: 'new' }
  | { status: 'processing' }
  | { status: 'completed'; result: any }
  | { status: 'failed'; error: string }
> {
  if (!key) return { status: 'new' };

  try {
    const record = await kvGet(`${IDEMPOTENCY_PREFIX}${key}`);
    if (!record) return { status: 'new' };

    const parsed = JSON.parse(record) as IdempotencyRecord;
    
    // Check if expired
    const createdAt = new Date(parsed.createdAt).getTime();
    if (Date.now() - createdAt > IDEMPOTENCY_TTL_MS) {
      return { status: 'new' };
    }

    if (parsed.status === 'completed' && parsed.result !== undefined) {
      return { status: 'completed', result: parsed.result };
    }

    if (parsed.status === 'failed' && parsed.error) {
      return { status: 'failed', error: parsed.error };
    }

    return { status: 'processing' };
  } catch {
    return { status: 'new' };
  }
}

/**
 * Mark an idempotency key as processing
 */
export async function markIdempotencyProcessing(key: string): Promise<void> {
  if (!key) return;

  const record: IdempotencyRecord = {
    key,
    status: 'processing',
    createdAt: new Date().toISOString(),
  };

  await kvSet(`${IDEMPOTENCY_PREFIX}${key}`, JSON.stringify(record));
}

/**
 * Mark an idempotency key as completed with result
 */
export async function markIdempotencyCompleted(key: string, result: any): Promise<void> {
  if (!key) return;

  const record: IdempotencyRecord = {
    key,
    status: 'completed',
    result,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };

  await kvSet(`${IDEMPOTENCY_PREFIX}${key}`, JSON.stringify(record));
}

/**
 * Mark an idempotency key as failed
 */
export async function markIdempotencyFailed(key: string, error: string): Promise<void> {
  if (!key) return;

  const record: IdempotencyRecord = {
    key,
    status: 'failed',
    error,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };

  await kvSet(`${IDEMPOTENCY_PREFIX}${key}`, JSON.stringify(record));
}

/**
 * Generate a deterministic idempotency key from request data
 */
export function generateIdempotencyKey(data: Record<string, any>): string {
  const canonical = JSON.stringify(data, Object.keys(data).sort());
  // Simple hash for demo - use crypto in production
  let hash = 0;
  for (let i = 0; i < canonical.length; i++) {
    const char = canonical.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `gen_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
}

/**
 * Wrap a function with idempotency
 * Usage:
 *   const result = await withIdempotency('key', async () => {
 *     return await expensiveOperation();
 *   });
 */
export async function withIdempotency<T>(
  key: string,
  fn: () => Promise<T>,
  options?: { 
    onDuplicate?: 'return_cached' | 'reject';
    ttlMs?: number;
  }
): Promise<T> {
  if (!key) {
    return fn();
  }

  const check = await checkIdempotency(key);

  switch (check.status) {
    case 'completed':
      logger.info('[Idempotency] Returning cached result', { key });
      return check.result as T;

    case 'processing':
      if (options?.onDuplicate === 'reject') {
        throw new Error('Operation already in progress');
      }
      // Wait and poll for completion
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const poll = await checkIdempotency(key);
        if (poll.status === 'completed') return poll.result as T;
        if (poll.status === 'failed') throw new Error(poll.error);
      }
      throw new Error('Operation timed out waiting for concurrent execution');

    case 'failed':
      // Retry - mark as processing again
      await markIdempotencyProcessing(key);
      break;

    case 'new':
      await markIdempotencyProcessing(key);
      break;
  }

  try {
    const result = await fn();
    await markIdempotencyCompleted(key, result);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await markIdempotencyFailed(key, errorMessage);
    throw error;
  }
}
