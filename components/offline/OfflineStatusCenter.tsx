"use client";

import React, { useState, useEffect } from 'react';
import { offlineSyncManager } from '@/lib/services/offlineSyncManager';
import { isOfflineMode } from '@/lib/services/offlineGenerationService';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export function OfflineStatusCenter() {
  const [isOffline, setIsOffline] = useState(isOfflineMode());
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    const handleStatus = () => setIsOffline(isOfflineMode());
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    
    updateQueueCount();
    const interval = setInterval(updateQueueCount, 5000);
    
    return () => {
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
      clearInterval(interval);
    };
  }, []);

  async function updateQueueCount() {
    const queue = await offlineSyncManager.getQueue();
    setQueueCount(queue.length);
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2">
      <div className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 transition-all ${
        isOffline ? 'bg-destructive text-destructive-foreground' : 'bg-success text-success-foreground'
      }`}>
        <div className={`w-2 h-2 rounded-full ${isOffline ? 'bg-destructive-foreground' : 'bg-success-foreground'}`} />
        {isOffline ? 'Offline Mode' : 'Connected'}
      </div>

      {queueCount > 0 && (
        <Card className="p-2 bg-background/80 backdrop-blur-sm border-border flex items-center gap-3 shadow-sm">
          <Badge variant="outline" className="text-primary">Sync Queue</Badge>
          <span className="text-xs font-medium">{queueCount} actions pending</span>
        </Card>
      )}
    </div>
  );
}
