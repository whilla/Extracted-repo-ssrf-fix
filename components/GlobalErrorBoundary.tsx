'use client';

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
        console.error('[GlobalErrorBoundary] Uncaught error:', error, errorInfo);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}