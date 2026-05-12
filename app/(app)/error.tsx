'use client';

import { useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[AppError]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-primary via-bg-primary to-violet-900/20 flex items-center justify-center p-4">
      <GlassCard className="p-8 text-center max-w-md">
        <h2 className="text-2xl font-bold text-red-400 mb-4">Something went wrong</h2>
        <p className="text-gray-400 mb-6">
          An unexpected error occurred. This has been logged and we will investigate.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-500 mb-4">Error ID: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="px-6 py-3 rounded-lg bg-gradient-to-r from-nexus-cyan to-violet-600 text-white font-medium hover:shadow-lg transition-all"
        >
          Try Again
        </button>
      </GlassCard>
    </div>
  );
}
