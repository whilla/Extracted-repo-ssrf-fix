"use client";

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { marketingInsightsService } from '@/lib/services/marketingInsightsService';
import { useSWR } from 'swr';

export function StrategicDashboard({ brandKit }: { brandKit: any }) {
  const { data, error, isLoading } = useSWR('strategic-report', async () => {
    return await marketingInsightsService.generateStrategicReport(brandKit);
  });

  if (isLoading) return <div className="p-8 text-center">Analyzing Viral Genome...</div>;
  if (error) return <div className="p-8 text-center text-red-500">Error generating insights.</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
      <Card className="p-4 col-span-1 bg-primary/5 border-primary/20">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Viral Genome</h3>
        <div className="space-y-3">
          {data.winningPatterns.map((pattern: string, i: number) => (
            <div key={i} className="text-sm flex gap-2">
              <span className="text-primary">•</span> {pattern}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 col-span-1 bg-destructive/5 border-destructive/20">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Critical Gaps</h3>
        <div className="space-y-3">
          {data.criticalGaps.map((gap: string, i: number) => (
            <div key={i} className="text-sm flex gap-2">
              <span className="text-destructive">⚠</span> {gap}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 col-span-1 bg-green-500/5 border-green-500/20">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Strategic Pivots</h3>
        <div className="space-y-3">
          {data.recommendations.map((pivot: string, i: number) => (
            <div key={i} className="text-xs p-2 bg-background rounded border border-border italic">
              {pivot}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
