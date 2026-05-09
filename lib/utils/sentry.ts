/**
 * Sentry Error Tracking Integration
 * Provides error monitoring and performance tracking
 */

import { isProduction, getEnvConfig } from '@/lib/config/envConfig';

let sentryInitialized = false;

export function initSentry() {
  if (sentryInitialized || !isProduction()) {
    return;
  }

  const env = getEnvConfig();
  
  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).Sentry) {
    const Sentry = (window as unknown as Record<string, unknown>).Sentry;
    
    if (typeof Sentry.init === 'function') {
      Sentry.init({
        dsn: env.SENTRY_DSN,
        environment: env.NODE_ENV,
        release: `nexusai@${process.env.npm_package_version || '1.0.0'}`,
        integrations: [
          Sentry.browserTracingIntegration?.(),
          Sentry.replayIntegration?.({
            maskAllText: false,
            blockAllMedia: false,
          }),
        ].filter(Boolean),
        tracesSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
        replaysSessionSampleRate: 0.1,
        ignoreErrors: [
          'ResizeObserver loop limit exceeded',
          'ResizeObserver loop completed with undelivered notifications',
          /Loading chunk \d+ failed/,
          /Network Error/,
        ],
      });
      
      sentryInitialized = true;
      console.log('[Sentry] Initialized');
    }
  }
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (!isProduction()) {
    console.error('[Error]', error, context);
    return;
  }

  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).Sentry) {
    const Sentry = (window as unknown as Record<string, unknown>).Sentry;
    
    if (typeof Sentry.captureException === 'function') {
      Sentry.captureException(error, {
        extra: context,
      });
    }
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  if (!isProduction()) {
    console.log(`[${level}]`, message);
    return;
  }

  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).Sentry) {
    const Sentry = (window as unknown as Record<string, unknown>).Sentry;
    
    if (typeof Sentry.captureMessage === 'function') {
      Sentry.captureMessage(message, level);
    }
  }
}

export function setUserContext(user: { id: string; email?: string; username?: string } | null) {
  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).Sentry) {
    const Sentry = (window as unknown as Record<string, unknown>).Sentry;
    
    if (typeof Sentry.setUser === 'function') {
      if (user) {
        Sentry.setUser({
          id: user.id,
          email: user.email,
          username: user.username,
        });
      } else {
        Sentry.setUser(null);
      }
    }
  }
}

export function addBreadcrumb(category: string, message: string, data?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).Sentry) {
    const Sentry = (window as unknown as Record<string, unknown>).Sentry;
    
    if (typeof Sentry.addBreadcrumb === 'function') {
      Sentry.addBreadcrumb({
        category,
        message,
        data,
        level: 'info',
        timestamp: Date.now() / 1000,
      });
    }
  }
}