/**
 * Graceful Shutdown Handler
 * Handles SIGTERM and SIGINT signals for clean server shutdown
 */

interface ShutdownOptions {
  timeout?: number;
  onShutdown?: () => Promise<void>;
  onError?: (error: Error) => void;
  logger?: (message: string) => void;
}

const defaultLogger = (message: string) => console.log(`[Shutdown] ${message}`);
const defaultErrorLogger = (error: Error) => console.error('[Shutdown Error]', error);

class GracefulShutdown {
  private isShuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;
  private timeout = 30000;
  private onShutdown?: () => Promise<void>;
  private onError?: (error: Error) => void;
  private logger: (message: string) => void;

  constructor(options: ShutdownOptions = {}) {
    this.timeout = options.timeout ?? 30000;
    this.onShutdown = options.onShutdown;
    this.onError = options.onError ?? defaultErrorLogger;
    this.logger = options.logger ?? defaultLogger;

    this.setupSignalHandlers();
  }

  private setupSignalHandlers() {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

    signals.forEach((signal) => {
      process.on(signal, () => {
        this.logger(`Received ${signal}, initiating graceful shutdown...`);
        this.shutdown(signal).catch(this.onError);
      });
    });

    process.on('uncaughtException', (error) => {
      this.logger('Uncaught exception, initiating shutdown...');
      this.onError(error);
      this.shutdown('uncaughtException').catch(this.onError);
    });

    process.on('unhandledRejection', (reason) => {
      this.logger(`Unhandled rejection: ${reason}`);
      this.onError(reason instanceof Error ? reason : new Error(String(reason)));
    });
  }

  async shutdown(reason: string = 'shutdown'): Promise<void> {
    if (this.isShuttingDown) {
      this.logger('Shutdown already in progress, waiting...');
      return this.shutdownPromise ?? Promise.resolve();
    }

    this.isShuttingDown = true;

    this.shutdownPromise = this.performShutdown(reason);
    return this.shutdownPromise;
  }

  private async performShutdown(reason: string): Promise<void> {
    const shutdownTimer = setTimeout(() => {
      this.logger('Shutdown timeout exceeded, forcing exit...');
      process.exit(1);
    }, this.timeout);

    try {
      this.logger('Closing active connections...');

      if (this.onShutdown) {
        this.logger('Executing custom shutdown handlers...');
        await this.onShutdown();
      }

      this.logger('Closing database connections...');
      await this.closeDatabaseConnections();

      this.logger('Closing Redis connections...');
      await this.closeRedisConnections();

      this.logger('Flushing logs...');
      await this.flushLogs();

      clearTimeout(shutdownTimer);

      this.logger(`Graceful shutdown completed (reason: ${reason})`);
      process.exit(0);
    } catch (error) {
      clearTimeout(shutdownTimer);
      this.logger('Error during shutdown, forcing exit...');
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
      process.exit(1);
    }
  }

  private async closeDatabaseConnections(): Promise<void> {
    try {
      if (typeof globalThis.__nexusDb !== 'undefined') {
        await globalThis.__nexusDb.end?.();
      }
      this.logger('Database connections closed');
    } catch (error) {
      this.logger(`Error closing database: ${error}`);
    }
  }

  private async closeRedisConnections(): Promise<void> {
    try {
      if (typeof globalThis.__nexusRedis !== 'undefined') {
        await globalThis.__nexusRedis.quit?.();
      }
      this.logger('Redis connections closed');
    } catch (error) {
      this.logger(`Error closing Redis: ${error}`);
    }
  }

  private async flushLogs(): Promise<void> {
    if (typeof process.stdout.flush === 'function') {
      await process.stdout.flush();
    }
    if (typeof process.stderr.flush === 'function') {
      await process.stderr.flush();
    }
  }

  isActive(): boolean {
    return this.isShuttingDown;
  }
}

let shutdownHandler: GracefulShutdown | null = null;

export function initGracefulShutdown(options?: ShutdownOptions): GracefulShutdown {
  if (shutdownHandler) {
    return shutdownHandler;
  }
  shutdownHandler = new GracefulShutdown(options);
  return shutdownHandler;
}

export function getShutdownHandler(): GracefulShutdown | null {
  return shutdownHandler;
}

export async function waitForShutdown(): Promise<void> {
  return new Promise((resolve) => {
    if (shutdownHandler?.isActive()) {
      process.on('exit', () => resolve());
    } else {
      resolve();
    }
  });
}

export function isShuttingDown(): boolean {
  return shutdownHandler?.isActive() ?? false;
}

export default GracefulShutdown;