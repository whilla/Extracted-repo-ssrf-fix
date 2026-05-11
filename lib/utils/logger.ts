/**
 * Structured Logging Utility
 * Provides consistent, categorized logging across the application
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  category: string;
  message: string;
  context?: LogContext;
  requestId?: string;
  userId?: string;
  duration?: number;
}

const LOG_LEVELS: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
  fatal: LogLevel.FATAL,
};

class Logger {
  private minLevel: LogLevel;
  private isProduction: boolean;
  private buffer: LogEntry[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.minLevel = this.getLogLevel();
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  private getLogLevel(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    return envLevel ? LOG_LEVELS[envLevel] ?? LogLevel.INFO : LogLevel.INFO;
  }

  protected formatLog(level: LogLevel, category: string, message: string, context?: LogContext): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      category,
      message,
      context,
    };
  }

  protected shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  protected output(entry: LogEntry): void {
    const { timestamp, level, category, message, context, duration, requestId, userId } = entry;

    const prefix = requestId ? `[${requestId}] ` : '';
    const userSuffix = userId ? ` [user:${userId}]` : '';
    const durationSuffix = duration !== undefined ? ` [${duration}ms]` : '';

    const logMessage = `${timestamp} ${level} [${category}]${prefix}${message}${userSuffix}${durationSuffix}`;

    const numericLevel = typeof level === 'number' ? level : LOG_LEVELS[level.toLowerCase()] ?? LogLevel.INFO;
    if (numericLevel >= LogLevel.ERROR) {
      console.error(logMessage, context || '');
    } else if (numericLevel >= LogLevel.WARN) {
      console.warn(logMessage, context || '');
    } else {
      console.log(logMessage, context || '');
    }

    if (this.isProduction) {
      this.buffer.push(entry);
    }
  }

  private flush(): void {
    if (this.buffer.length === 0) return;

    const logs = [...this.buffer];
    this.buffer = [];

    console.log(JSON.stringify({ type: 'log_batch', logs }));
  }

  debug(category: string, message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    const entry = (this as any).formatLog(LogLevel.DEBUG, category, message, context);
    (this as any).output(entry);
  }

  info(category: string, message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    const entry = (this as any).formatLog(LogLevel.INFO, category, message, context);
    (this as any).output(entry);
  }

  warn(category: string, message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    const entry = (this as any).formatLog(LogLevel.WARN, category, message, context);
    (this as any).output(entry);
  }

  error(category: string, message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    const entry = (this as any).formatLog(LogLevel.ERROR, category, message, context);
    (this as any).output(entry);
  }

  fatal(category: string, message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.FATAL)) return;
    const entry = (this as any).formatLog(LogLevel.FATAL, category, message, context);
    (this as any).output(entry);
  }

  child(context: LogContext): ChildLogger {
    return new ChildLogger(this, context);
  }

  withRequest(requestId: string): RequestLogger {
    return new RequestLogger(this, requestId);
  }

  withUser(userId: string): UserLogger {
    return new UserLogger(this, userId);
  }

  startFlushInterval(intervalMs: number = 60000): void {
    if (this.flushInterval) return;
    this.flushInterval = setInterval(() => this.flush(), intervalMs);
  }

  stopFlushInterval(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }
}

class ChildLogger {
  constructor(private parent: Logger, private context: LogContext) {}

  debug(category: string, message: string, context?: LogContext): void {
    this.parent.debug(category, message, { ...this.context, ...context });
  }

  info(category: string, message: string, context?: LogContext): void {
    this.parent.info(category, message, { ...this.context, ...context });
  }

  warn(category: string, message: string, context?: LogContext): void {
    this.parent.warn(category, message, { ...this.context, ...context });
  }

  error(category: string, message: string, context?: LogContext): void {
    this.parent.error(category, message, { ...this.context, ...context });
  }

  child(additionalContext: LogContext): ChildLogger {
    return this.parent.child({ ...this.context, ...additionalContext });
  }
}

class RequestLogger {
  constructor(private parent: Logger, private requestId: string) {}

  debug(category: string, message: string, context?: LogContext): void {
    const entry = (this.parent as any).formatLog(LogLevel.DEBUG, category, message, context);
    entry.requestId = this.requestId;
    (this.parent as any).output(entry);
  }

  info(category: string, message: string, context?: LogContext): void {
    const entry = (this.parent as any).formatLog(LogLevel.INFO, category, message, context);
    entry.requestId = this.requestId;
    (this.parent as any).output(entry);
  }

  warn(category: string, message: string, context?: LogContext): void {
    const entry = (this.parent as any).formatLog(LogLevel.WARN, category, message, context);
    entry.requestId = this.requestId;
    (this.parent as any).output(entry);
  }

  error(category: string, message: string, context?: LogContext): void {
    const entry = (this.parent as any).formatLog(LogLevel.ERROR, category, message, context);
    entry.requestId = this.requestId;
    (this.parent as any).output(entry);
  }

  withUser(userId: string): UserLogger {
    return new UserLogger(this.parent, userId, this.requestId);
  }

  withDuration(duration: number): DurationLogger {
    return new DurationLogger(this.parent, this.requestId, duration);
  }
}

class UserLogger {
  constructor(private parent: Logger, private userId: string, private requestId?: string) {}

  debug(category: string, message: string, context?: LogContext): void {
    const entry = (this.parent as any).formatLog(LogLevel.DEBUG, category, message, context);
    entry.userId = this.userId;
    entry.requestId = this.requestId;
    (this.parent as any).output(entry);
  }

  info(category: string, message: string, context?: LogContext): void {
    const entry = (this.parent as any).formatLog(LogLevel.INFO, category, message, context);
    entry.userId = this.userId;
    entry.requestId = this.requestId;
    (this.parent as any).output(entry);
  }

  warn(category: string, message: string, context?: LogContext): void {
    const entry = (this.parent as any).formatLog(LogLevel.WARN, category, message, context);
    entry.userId = this.userId;
    entry.requestId = this.requestId;
    (this.parent as any).output(entry);
  }

  error(category: string, message: string, context?: LogContext): void {
    const entry = (this.parent as any).formatLog(LogLevel.ERROR, category, message, context);
    entry.userId = this.userId;
    entry.requestId = this.requestId;
    (this.parent as any).output(entry);
  }
}

class DurationLogger {
  constructor(private parent: Logger, private requestId: string, private duration: number) {}

  info(category: string, message: string, context?: LogContext): void {
    const entry = (this.parent as any).formatLog(LogLevel.INFO, category, message, context);
    entry.requestId = this.requestId;
    entry.duration = this.duration;
    (this.parent as any).output(entry);
  }

  warn(category: string, message: string, context?: LogContext): void {
    const entry = (this.parent as any).formatLog(LogLevel.WARN, category, message, context);
    entry.requestId = this.requestId;
    entry.duration = this.duration;
    (this.parent as any).output(entry);
  }

  error(category: string, message: string, context?: LogContext): void {
    const entry = (this.parent as any).formatLog(LogLevel.ERROR, category, message, context);
    entry.requestId = this.requestId;
    entry.duration = this.duration;
    (this.parent as any).output(entry);
  }
}

export const logger = new Logger();

export function createLogger(category: string): Logger {
  return logger;
}

export default logger;