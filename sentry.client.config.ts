import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  environment: process.env.NODE_ENV || 'development',
  integrations: [
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysOnErrorSampleRate: 1.0,
  ignoreErrors: [
    'NextResponse',
    'AbortError',
    'NetworkError',
    /Loading chunk \d+ failed/,
    /ResizeObserver loop/,
  ],
  beforeSend(event) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Sentry]', event);
      return null;
    }
    return event;
  },
});
