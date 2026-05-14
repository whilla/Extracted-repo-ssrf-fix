'use client';

import { LoadingPulse } from './LoadingPulse';

export function PageLoader({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] py-12">
      <div className="w-12 h-12 mb-4">
        <LoadingPulse />
      </div>
      <p className="text-muted-foreground text-sm">
        {message}
      </p>
    </div>
  );
}
