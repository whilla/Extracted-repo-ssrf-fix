/**
 * Circuit Breaker Pattern for External API Calls
 * Prevents cascading failures when external services are down.
 * Implements the three states: Closed, Open, Half-Open.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureAt?: string;
  lastSuccessAt?: string;
  nextRetryAt?: string;
  totalCalls: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeoutMs: 60_000,
  halfOpenMaxAttempts: 3,
};

interface CircuitStateEntry {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  nextRetryAt?: number;
  totalCalls: number;
  halfOpenAttempts: number;
}

const circuits = new Map<string, CircuitStateEntry>();

function getOrCreateCircuit(name: string, config: CircuitBreakerConfig): CircuitStateEntry {
  if (!circuits.has(name)) {
    circuits.set(name, {
      state: 'closed',
      failures: 0,
      successes: 0,
      totalCalls: 0,
      halfOpenAttempts: 0,
    });
  }
  return circuits.get(name)!;
}

function shouldAttemptCall(entry: CircuitStateEntry, config: CircuitBreakerConfig): boolean {
  if (entry.state === 'closed') return true;
  if (entry.state === 'open') {
    if (entry.nextRetryAt && Date.now() >= entry.nextRetryAt) {
      entry.state = 'half-open';
      entry.halfOpenAttempts = 0;
      return true;
    }
    return false;
  }
  if (entry.state === 'half-open') {
    return entry.halfOpenAttempts < config.halfOpenMaxAttempts;
  }
  return false;
}

function recordSuccess(name: string) {
  const entry = circuits.get(name);
  if (!entry) return;

  entry.successes++;
  entry.totalCalls++;
  entry.lastSuccessAt = Date.now();

  if (entry.state === 'half-open') {
    entry.halfOpenAttempts++;
    if (entry.halfOpenAttempts >= entry.failures || entry.halfOpenAttempts >= 3) {
      entry.state = 'closed';
      entry.failures = 0;
      entry.halfOpenAttempts = 0;
    }
  } else if (entry.state === 'closed') {
    entry.failures = Math.max(0, entry.failures - 1);
  }
}

function recordFailure(name: string, config: CircuitBreakerConfig) {
  const entry = circuits.get(name);
  if (!entry) return;

  entry.failures++;
  entry.totalCalls++;
  entry.lastFailureAt = Date.now();

  if (entry.state === 'half-open') {
    entry.halfOpenAttempts++;
    if (entry.halfOpenAttempts >= config.halfOpenMaxAttempts) {
      entry.state = 'open';
      entry.nextRetryAt = Date.now() + config.recoveryTimeoutMs;
    }
  } else if (entry.failures >= config.failureThreshold) {
    entry.state = 'open';
    entry.nextRetryAt = Date.now() + config.recoveryTimeoutMs;
  }
}

export class CircuitBreaker {
  private name: string;
  private config: CircuitBreakerConfig;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    getOrCreateCircuit(this.name, this.config);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const entry = circuits.get(this.name)!;

    if (!shouldAttemptCall(entry, this.config)) {
      throw new CircuitBreakerOpenError(
        this.name,
        entry.nextRetryAt ? new Date(entry.nextRetryAt) : undefined
      );
    }

    try {
      const result = await fn();
      recordSuccess(this.name);
      return result;
    } catch (error) {
      recordFailure(this.name, this.config);
      throw error;
    }
  }

  getState(): CircuitState {
    const entry = circuits.get(this.name);
    if (!entry) return 'closed';
    if (entry.state === 'open' && entry.nextRetryAt && Date.now() >= entry.nextRetryAt) {
      entry.state = 'half-open';
      entry.halfOpenAttempts = 0;
    }
    return entry.state;
  }

  getStats(): CircuitBreakerStats {
    const entry = circuits.get(this.name);
    if (!entry) {
      return { state: 'closed', failures: 0, successes: 0, totalCalls: 0 };
    }
    return {
      state: this.getState(),
      failures: entry.failures,
      successes: entry.successes,
      lastFailureAt: entry.lastFailureAt ? new Date(entry.lastFailureAt).toISOString() : undefined,
      lastSuccessAt: entry.lastSuccessAt ? new Date(entry.lastSuccessAt).toISOString() : undefined,
      nextRetryAt: entry.nextRetryAt ? new Date(entry.nextRetryAt).toISOString() : undefined,
      totalCalls: entry.totalCalls,
    };
  }

  reset() {
    circuits.set(this.name, {
      state: 'closed',
      failures: 0,
      successes: 0,
      totalCalls: 0,
      halfOpenAttempts: 0,
    });
  }

  static getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name] of circuits) {
      const cb = new CircuitBreaker(name);
      stats[name] = cb.getStats();
    }
    return stats;
  }

  static resetAll() {
    circuits.clear();
  }
}

export class CircuitBreakerOpenError extends Error {
  public circuitName: string;
  public nextRetryAt?: Date;

  constructor(circuitName: string, nextRetryAt?: Date) {
    super(`Circuit breaker '${circuitName}' is open. Service is temporarily unavailable.`);
    this.name = 'CircuitBreakerOpenError';
    this.circuitName = circuitName;
    this.nextRetryAt = nextRetryAt;
  }
}

export const circuitBreakers = {
  supabase: new CircuitBreaker('supabase', { failureThreshold: 3, recoveryTimeoutMs: 30_000 }),
  puter: new CircuitBreaker('puter', { failureThreshold: 3, recoveryTimeoutMs: 30_000 }),
  openai: new CircuitBreaker('openai', { failureThreshold: 5, recoveryTimeoutMs: 60_000 }),
  anthropic: new CircuitBreaker('anthropic', { failureThreshold: 5, recoveryTimeoutMs: 60_000 }),
  elevenlabs: new CircuitBreaker('elevenlabs', { failureThreshold: 3, recoveryTimeoutMs: 45_000 }),
  ayrshare: new CircuitBreaker('ayrshare', { failureThreshold: 3, recoveryTimeoutMs: 30_000 }),
  shopify: new CircuitBreaker('shopify', { failureThreshold: 3, recoveryTimeoutMs: 30_000 }),
  replicate: new CircuitBreaker('replicate', { failureThreshold: 3, recoveryTimeoutMs: 60_000 }),
  n8n: new CircuitBreaker('n8n', { failureThreshold: 3, recoveryTimeoutMs: 30_000 }),
};
