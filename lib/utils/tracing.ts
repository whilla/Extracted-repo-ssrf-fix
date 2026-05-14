/**
 * OpenTelemetry tracing for observability
 */

import { trace, context, Span, SpanStatusCode } from '@opentelemetry/api';
import { logger } from './logger';

// Initialize OpenTelemetry (should be called at app startup)
export function initOpenTelemetry(): void {
  try {
    // This would be configured in a real implementation
    // For now, we'll use a no-op implementation that logs
    logger.info('[Tracing] OpenTelemetry initialized (logging mode)');
  } catch (error) {
    logger.error('[Tracing] Failed to initialize OpenTelemetry', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

// Tracing utility functions
export function withTracing<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: { attributes?: Record<string, any> }
): Promise<T> {
  return trace.getTracer('nexusai').startActiveSpan(name, (span) => {
    // Set attributes
    if (options?.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        span.setAttribute(key, String(value));
      });
    }

    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error)
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  });
}

// API route tracing
export function traceApiRoute(
  route: string,
  method: string,
  handler: () => Promise<Response>
): Promise<Response> {
  return withTracing(
    `${method} ${route}`,
    async (span) => {
      span.setAttribute('http.method', method);
      span.setAttribute('http.route', route);
      span.setAttribute('http.url', route);
      
      try {
        const response = await handler();
        span.setAttribute('http.status_code', response.status);
        return response;
      } catch (error) {
        span.setAttribute('http.status_code', 500);
        throw error;
      }
    }
  );
}

// Service tracing
export function traceService(
  service: string,
  operation: string,
  handler: () => Promise<any>
): Promise<any> {
  return withTracing(
    `${service}.${operation}`,
    async (span) => {
      span.setAttribute('service.name', service);
      span.setAttribute('service.operation', operation);
      
      return handler();
    }
  );
}

// Database tracing
export function traceDatabase(
  operation: string,
  table: string,
  handler: () => Promise<any>
): Promise<any> {
  return withTracing(
    `db.${operation}`,
    async (span) => {
      span.setAttribute('db.operation', operation);
      span.setAttribute('db.table', table);
      span.setAttribute('db.system', 'supabase');
      
      return handler();
    }
  );
}

// External service tracing
export function traceExternalService(
  service: string,
  operation: string,
  handler: () => Promise<any>
): Promise<any> {
  return withTracing(
    `external.${service}.${operation}`,
    async (span) => {
      span.setAttribute('external.service', service);
      span.setAttribute('external.operation', operation);
      
      return handler();
    }
  );
}

// Logging integration
export function logWithTrace(
  message: string,
  context?: Record<string, any>
): void {
  const currentSpan = trace.getSpan(context.active());
  if (currentSpan) {
    const traceId = currentSpan.spanContext().traceId;
    const spanId = currentSpan.spanContext().spanId;
    
    logger.info(message, {
      traceId,
      spanId,
      ...context
    });
  } else {
    logger.info(message, context);
  }
}
