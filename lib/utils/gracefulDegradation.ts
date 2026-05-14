/**
 * Graceful degradation utilities
 * Provides fallbacks when external services fail
 */

import { logger } from './logger';

interface DegradationOptions<T> {
  fallback: T | (() => T | Promise<T>);
  fallbackOn?: Array<'timeout' | 'error' | 'config'>;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  onDegrade?: (error: Error, attempt: number) => void;
  cacheResult?: boolean;
  cacheKey?: string;
  cacheTtlMs?: number;
}

/**
 * Execute a function with graceful degradation
 * If the primary fails, returns the fallback value instead of crashing
 */
export async function withGracefulDegradation<T>(
  operation: () => Promise<T>,
  options: DegradationOptions<T>,
  context: string
): Promise<T> {
  const {
    fallback,
    timeoutMs = 30000,
    retries = 1,
    retryDelayMs = 1000,
    onDegrade,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${context} timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      logger.warn(`[${context}] Attempt ${attempt + 1}/${retries + 1} failed`, {
        error: lastError.message,
        context,
      });

      if (attempt < retries) {
        await delay(retryDelayMs * Math.pow(2, attempt)); // Exponential backoff
      }
    }
  }

  // All attempts failed - use fallback
  logger.error(`[${context}] All attempts failed, using fallback`, {
    error: lastError?.message,
    context,
  });

  if (onDegrade && lastError) {
    onDegrade(lastError, retries + 1);
  }

  if (typeof fallback === 'function') {
    return (fallback as () => T | Promise<T>)();
  }
  return fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Circuit breaker pattern
 * Prevents cascading failures by temporarily blocking requests to failing services
 */
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime: number | null = null;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold = 5,
    private timeoutMs = 60000,
    private context: string
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - (this.lastFailureTime || 0) > this.timeoutMs) {
        this.state = 'half-open';
        logger.info('CircuitBreaker', `Entering half-open state for ${this.context}`);
      } else {
        throw new Error(`Circuit breaker OPEN for ${this.context}. Try again later.`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
      logger.info('CircuitBreaker', `Closed - service recovered for ${this.context}`);
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
      logger.error('CircuitBreaker', `OPENED after ${this.failures} failures for ${this.context}`);
    }
  }

  getState(): string {
    return this.state;
  }
}

// Global circuit breakers for external services
const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(service: string): CircuitBreaker {
  if (!circuitBreakers.has(service)) {
    circuitBreakers.set(service, new CircuitBreaker(5, 60000, service));
  }
  return circuitBreakers.get(service)!;
}

/**
 * Safe wrapper for external API calls with circuit breaker + fallback
 */
export async function safeExternalCall<T>(
  service: string,
  operation: () => Promise<T>,
  fallback: T,
  options?: {
    timeoutMs?: number;
    retries?: number;
  }
): Promise<T> {
  const breaker = getCircuitBreaker(service);

  try {
    return await breaker.execute(async () => {
      return await withGracefulDegradation(operation, {
        fallback,
        timeoutMs: options?.timeoutMs || 30000,
        retries: options?.retries || 1,
      }, service);
    });
  } catch {
    return fallback;
  }
}

/**
 * Health check utility
 * Pings a service endpoint to check availability
 */
export async function healthCheck(url: string, timeoutMs = 5000): Promise<{ healthy: boolean; latency: number; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    const latency = Date.now() - start;
    
    return {
      healthy: response.ok,
      latency,
    };
  } catch (error) {
    return {
      healthy: false,
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
