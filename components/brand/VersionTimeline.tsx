"use client";

import React, { useState, useEffect } from 'react';
import { brandVersionManager } from '@/lib/services/brandVersionManager';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export function BrandVersionTimeline({ currentBrand }: { currentBrand: any }) {
  const [versions, setVersions] = useState<any[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<any>(null);
  const [diffs, setDiffs] = useState<any>(null);

  useEffect(() => {
    loadVersions();
  }, []);

  async function loadVersions() {
    const list = await brandVersionManager.listVersions();
    setVersions(list);
  }

  async function handleRollback(versionId: string) {
    const success = await brandVersionManager.rollbackTo(versionId);
    if (success) {
      toast.success('Brand identity rolled back successfully');
      loadVersions();
    } else {
      toast.error('Rollback failed');
    }
  }

  async function handleDiff(v1Id: string) {
    const current = versions[0]?.versionId;
    if (!current) return;
    const result = await brandVersionManager.diffVersions(v1Id, current);
    setDiffs(result);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Identity Evolution</h2>
        <Button variant="outline" size="sm" onClick={() => brandVersionManager.createSnapshot(currentBrand, 'Manual Backup')}>
          Snapshot Current
        </Button>
      </div>

      <div className="relative border-l-2 border-border ml-4 space-y-8">
        {versions.map((v, i) => (
          <div key={v.versionId} className="relative pl-6">
            <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-primary border-2 border-background" />
            <Card className="p-3 hover:border-primary/50 transition-colors cursor-pointer" onClick={() => setSelectedVersion(v)}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-mono text-muted-foreground">{v.versionId}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(v.timestamp).toLocaleDateString()}</span>
              </div>
              <div className="text-sm font-medium mb-3">{v.changeLog}</div>
              <div className="flex gap-2">
                <Button size="xs" variant="secondary" onClick={(e) => { e.stopPropagation(); handleDiff(v.versionId); }}>
                  Compare
                </Button>
                <Button size="xs" variant="destructive" onClick={(e) => { e.stopPropagation(); handleRollback(v.versionId); }}>
                  Restore
                </Button>
              </div>
            </Card>
          </div>
        ))}
      </div>

      {diffs && (
        <div className="fixed bottom-6 right-6 w-80 bg-popover border border-border rounded-lg shadow-xl p-4 z-50">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-bold">Identity Diff</h4>
            <Button variant="ghost" size="sm" onClick={() => setDiffs(null)}>✕</Button>
          </div>
          <div className="text-xs space-y-2">
            <p className="text-muted-foreground italic">{diffs.summary}</p>
            <div className="flex flex-wrap gap-2">
              {diffs.changedFields.map((f: string) => (
                <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
