'use client';

import { useEffect } from 'react';
import { loadSettings } from '@/lib/services/memoryService';
import { notificationService } from '@/lib/services/notificationService';
import { toast } from '@/hooks/use-toast';
import { PROVIDER_EVENT_NAME, type ProviderEventDetail } from '@/lib/services/providerControl';

export function NotificationBootstrap() {
  useEffect(() => {
    let mounted = true;

    const enableNotifications = async () => {
      const settings = await loadSettings();
      if (!mounted || !settings.notificationsEnabled) return;
      await notificationService.requestPermission();
    };

    void enableNotifications();

    const handleOffline = () => {
      void notificationService.notifySystemStatus(
        'offline',
        'Offline mode is active. Cached workspace, saved drafts, and local controls remain available, but live generation and publishing are paused.'
      );
    };

    const handleOnline = () => {
      void notificationService.notifySystemStatus(
        'online',
        'Connection restored. Live trends, provider calls, and publishing are available again.'
      );
    };

    const handleProviderEvent = (event: Event) => {
      const customEvent = event as CustomEvent<ProviderEventDetail>;
      const detail = customEvent.detail;
      if (!detail) return;

      if (detail.type === 'provider_switched') {
        toast({
          title: `Switched to ${detail.to}`,
          description: detail.message,
        });
        return;
      }

      if (detail.type === 'puter_credit_exhausted') {
        toast({
          title: 'Puter credits exhausted',
          description: detail.message,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Puter fallback disabled',
        description: detail.message,
      });
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener(PROVIDER_EVENT_NAME, handleProviderEvent as EventListener);

    return () => {
      mounted = false;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener(PROVIDER_EVENT_NAME, handleProviderEvent as EventListener);
    };
  }, []);

  return null;
}
