/**
 * Enhanced error handling with structured logging and classification
 */

export class AppError extends Error {
  constructor(
    public message: string,
    public code: string,
    public status: number,
    public context?: Record<string, any>,
    public isOperational = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Error classification
export const ERROR_TYPES = {
  VALIDATION: 'validation_error',
  AUTHENTICATION: 'authentication_error',
  AUTHORIZATION: 'authorization_error',
  RATE_LIMIT: 'rate_limit_error',
  NOT_FOUND: 'not_found_error',
  EXTERNAL_SERVICE: 'external_service_error',
  DATABASE: 'database_error',
  CONFIGURATION: 'configuration_error',
  INTERNAL: 'internal_error',
} as const;

export type ErrorType = typeof ERROR_TYPES[keyof typeof ERROR_TYPES];

// Error factory functions
export function createValidationError(message: string, details?: any): AppError {
  return new AppError(message, ERROR_TYPES.VALIDATION, 400, { details });
}

export function createAuthError(message: string): AppError {
  return new AppError(message, ERROR_TYPES.AUTHENTICATION, 401);
}

export function createAuthzError(message: string): AppError {
  return new AppError(message, ERROR_TYPES.AUTHORIZATION, 403);
}

export function createRateLimitError(message: string, retryAfter: number): AppError {
  return new AppError(message, ERROR_TYPES.RATE_LIMIT, 429, { retryAfter });
}

export function createNotFoundError(resource: string, id?: string): AppError {
  return new AppError(
    id ? `${resource} with ID ${id} not found` : `${resource} not found`,
    ERROR_TYPES.NOT_FOUND,
    404,
    { resource, id }
  );
}

export function createExternalServiceError(service: string, error: Error): AppError {
  return new AppError(
    `External service ${service} failed`,
    ERROR_TYPES.EXTERNAL_SERVICE,
    502,
    { service, originalError: error.message }
  );
}

export function createDatabaseError(error: Error): AppError {
  return new AppError(
    'Database operation failed',
    ERROR_TYPES.DATABASE,
    500,
    { originalError: error.message }
  );
}

export function createConfigError(message: string): AppError {
  return new AppError(message, ERROR_TYPES.CONFIGURATION, 500);
}

export function createInternalError(error: Error): AppError {
  return new AppError(
    'Internal server error',
    ERROR_TYPES.INTERNAL,
    500,
    { originalError: error.message }
  );
}

// Error response formatting
export function formatErrorResponse(error: AppError | Error): { error: string; code?: string; details?: any; status: number } {
  if (error instanceof AppError) {
    return {
      error: error.message,
      code: error.code,
      details: error.context,
      status: error.status,
    };
  }

  return {
    error: error instanceof Error ? error.message : String(error),
    status: 500,
  };
}

// Error handler middleware
export function errorHandler() {
  return { status: 500, body: { error: 'Internal server error' } };
}
