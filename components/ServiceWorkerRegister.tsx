'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        console.log('[ServiceWorker] Ready:', registration.scope);
      }).catch(() => {
        // Service worker registration failed or not available - non-critical
      });
    }
  }, []);

  return null;
}
