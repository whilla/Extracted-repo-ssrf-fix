'use client';

import { Skeleton } from '@/components/nexus/Skeleton';

export function CustomerTableSkeleton() {
  return (
    <div className="space-y-4">
      {/* Table header skeleton */}
      <div className="grid grid-cols-6 gap-4 px-4 py-3 border-b border-border">
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
        <Skeleton className="h-4" />
      </div>
      
      {/* Table rows skeleton */}
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="grid grid-cols-6 gap-4 px-4 py-3 border-b border-border last:border-none">
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
        </div>
      ))}
    </div>
  );
}
