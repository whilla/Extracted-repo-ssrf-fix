'use client';

import * as Sentry from '@sentry/nextjs';
import ErrorBoundary, { ErrorDisplay } from '@/components/ErrorBoundary';
import { ReactNode } from 'react';

interface GlobalErrorBoundaryProps {
  children: ReactNode;
}

export default function GlobalErrorBoundary({ children }: GlobalErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={<ErrorDisplay error={null} />}
      onError={(error, errorInfo) => {
        Sentry.withScope((scope) => {
          scope.setContext('react_component', {
            componentStack: errorInfo?.componentStack,
          });
          Sentry.captureException(error);
        });
        console.error('[GlobalErrorBoundary] Uncaught error:', error, errorInfo);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}