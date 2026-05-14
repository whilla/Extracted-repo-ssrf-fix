'use client';

import { useApiLoading } from '@/context/ApiLoadingContext';
import { LoadingPulse } from './LoadingPulse';

export function GlobalLoader() {
  const { isLoading } = useApiLoading();
  
  if (!isLoading) return null;
  
  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border shadow-lg">
        <LoadingPulse className="w-4 h-4" />
        <span className="text-sm text-muted-foreground">Processing...</span>
      </div>
    </div>
  );
}
