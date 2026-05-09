/**
 * Global Circuit Breaker
 * Provides system-wide protection against cascading failures
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
}

const defaultConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000,
  resetTimeout: 30000,
};

interface CircuitMetrics {
  failures: number;
  successes: number;
  lastFailure: number;
  state: CircuitState;
  nextAttempt: number;
}

const circuits = new Map<string, CircuitMetrics>();

function getOrCreateCircuit(name: string, config: Partial<CircuitBreakerConfig> = {}): CircuitMetrics {
  const fullConfig = { ...defaultConfig, ...config };
  
  if (!circuits.has(name)) {
    circuits.set(name, {
      failures: 0,
      successes: 0,
      lastFailure: 0,
      state: 'closed',
      nextAttempt: 0,
    });
  }
  
  return circuits.get(name)!;
}

export function getCircuitState(name: string): CircuitState {
  const circuit = getOrCreateCircuit(name);
  const now = Date.now();
  
  if (circuit.state === 'open' && circuit.nextAttempt <= now) {
    circuit.state = 'half-open';
  }
  
  return circuit.state;
}

export async function executeWithCircuit<T>(
  name: string,
  fn: () => Promise<T>,
  config: Partial<CircuitBreakerConfig> = {}
): Promise<T> {
  const fullConfig = { ...defaultConfig, ...config };
  const circuit = getOrCreateCircuit(name, config);
  const state = getCircuitState(name);
  
  if (state === 'open') {
    const waitTime = circuit.nextAttempt - Date.now();
    throw new Error(`Circuit ${name} is open. Retry in ${Math.ceil(waitTime / 1000)}s`);
  }
  
  try {
    const result = await fn();
    
    if (circuit.state === 'half-open') {
      circuit.successes++;
      if (circuit.successes >= fullConfig.successThreshold) {
        circuit.state = 'closed';
        circuit.failures = 0;
        circuit.successes = 0;
        console.log(`[CircuitBreaker] ${name} closed`);
      }
    } else {
      circuit.failures = 0;
    }
    
    return result;
    
  } catch (error) {
    circuit.failures++;
    circuit.lastFailure = Date.now();
    circuit.successes = 0;
    
    if (circuit.failures >= fullConfig.failureThreshold || circuit.state === 'half-open') {
      circuit.state = 'open';
      circuit.nextAttempt = Date.now() + fullConfig.resetTimeout;
      console.warn(`[CircuitBreaker] ${name} opened after ${circuit.failures} failures`);
    }
    
    throw error;
  }
}

export function getAllCircuitStates(): Record<string, { state: CircuitState; failures: number; lastFailure: string }> {
  const states: Record<string, { state: CircuitState; failures: number; lastFailure: string }> = {};
  
  for (const [name, metrics] of circuits.entries()) {
    states[name] = {
      state: getCircuitState(name),
      failures: metrics.failures,
      lastFailure: metrics.lastFailure ? new Date(metrics.lastFailure).toISOString() : 'never',
    };
  }
  
  return states;
}

export function resetCircuit(name: string): void {
  const circuit = circuits.get(name);
  if (circuit) {
    circuit.state = 'closed';
    circuit.failures = 0;
    circuit.successes = 0;
    circuit.nextAttempt = 0;
    console.log(`[CircuitBreaker] ${name} manually reset`);
  }
}

export function resetAllCircuits(): void {
  for (const [name] of circuits.entries()) {
    resetCircuit(name);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [name, metrics] of circuits.entries()) {
    if (metrics.state === 'open' && metrics.nextAttempt <= now) {
      metrics.state = 'half-open';
      console.log(`[CircuitBreaker] ${name} transitioned to half-open`);
    }
  }
}, 10000);