/**
 * CIRCUIT BREAKER UTILITY
 * Prevents the system from repeatedly calling a failing service
 * 
 * States:
 * - CLOSED: Service is working normally, requests pass through.
 * - OPEN: Service is failing, requests are immediately blocked.
 * - HALF_OPEN: Period of testing to see if service has recovered.
 */

export enum CircuitState {
  CLOSED,
  OPEN,
  HALF_OPEN
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening circuit
  recoveryTimeout: number;  // Time in ms before trying again in HALF_OPEN
  successThreshold: number;  // Number of successes needed to CLOSE again
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private halfOpenRequests = 0;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig = {
    failureThreshold: 5,
    recoveryTimeout: 30000,
    successThreshold: 2,
  }) {
    this.config = config;
  }

  /**
   * Check if a request is allowed to proceed
   */
  allowRequest(): boolean {
    if (this.state === CircuitState.OPEN) {
      if (this.lastFailureTime && Date.now() - this.lastFailureTime > this.config.recoveryTimeout) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenRequests = 0;
      } else {
        return false;
      }
    }

    if (this.state === CircuitState.HALF_OPEN) {
      // Only allow one probe request to test if the service has recovered
      if (this.halfOpenRequests >= 1) {
        return false;
      }
      this.halfOpenRequests++;
    }

    return true;
  }

  /**
   * Record a success
   */
  recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenRequests = Math.max(0, this.halfOpenRequests - 1);
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.close();
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.failures = 0;
    }
  }

  /**
   * Record a failure
   */
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenRequests = Math.max(0, this.halfOpenRequests - 1);
    }

    if (this.state === CircuitState.HALF_OPEN || this.failures >= this.config.failureThreshold) {
      this.open();
    }
  }

  private open(): void {
    this.state = CircuitState.OPEN;
    this.successes = 0;
  }

  private close(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
  }

  getState(): CircuitState {
    return this.state;
  }
}
