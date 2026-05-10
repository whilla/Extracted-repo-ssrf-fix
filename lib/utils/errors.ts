/**
 * Error Handling Utilities
 * Provides consistent error handling patterns across the application
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code: string = 'VALIDATION_ERROR') {
    super(message, 400, code);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', code: string = 'AUTH_REQUIRED') {
    super(message, 401, code);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied', code: string = 'ACCESS_DENIED') {
    super(message, 403, code);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource', code: string = 'NOT_FOUND') {
    super(`${resource} not found`, 404, code);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
  }
}

export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    statusCode: number;
    timestamp: string;
    requestId?: string;
  };
}

export function formatErrorResponse(
  error: unknown,
  requestId?: string
): ErrorResponse {
  if (error instanceof AppError) {
    return {
      error: {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        timestamp: new Date().toISOString(),
        requestId,
      },
    };
  }

  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  return {
    error: {
      message,
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      timestamp: new Date().toISOString(),
      requestId,
    },
  };
}

export function handleAsyncError<T>(
  promise: Promise<T>,
  fallbackValue?: T
): Promise<T | undefined> {
  return promise.catch((error) => {
    console.error('[AsyncError]', error);
    return fallbackValue;
  });
}

export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  options: {
    onError?: (error: unknown) => void;
    fallbackValue?: T;
    errorMessage?: string;
  } = {}
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    if (options.errorMessage) {
      console.error(options.errorMessage, error);
    } else {
      console.error('[Error]', error);
    }
    options.onError?.(error);
    return options.fallbackValue;
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred';
}

export function isOperationalError(error: unknown): boolean {
  return error instanceof AppError && error.isOperational;
}

export function sanitizeErrorForClient(error: unknown): string {
  if (error instanceof AppError && error.statusCode < 500) {
    return error.message;
  }
  return 'An unexpected error occurred. Please try again later.';
}

export function create404Response(resource: string) {
  return new Response(
    JSON.stringify({
      error: {
        message: `${resource} not found`,
        code: 'NOT_FOUND',
        statusCode: 404,
        timestamp: new Date().toISOString(),
      },
    }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export function createErrorResponse(error: unknown, status = 500) {
  return new Response(JSON.stringify(formatErrorResponse(error)), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}