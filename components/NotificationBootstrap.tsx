'use client';

import { useEffect } from 'react';
import { loadSettings } from '@/lib/services/memoryService';
import { notificationService } from '@/lib/services/notificationService';

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
        'Offline mode is active. Cached workspace, saved drafts, voice controls, and local generation fallback are still available.'
      );
    };

    const handleOnline = () => {
      void notificationService.notifySystemStatus(
        'online',
        'Connection restored. Live trends, provider calls, and publishing are available again.'
      );
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      mounted = false;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return null;
}
