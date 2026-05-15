'use client';

import { useState, useEffect, useRef } from 'react';
import { AppLoading } from './AppLoading';
import { usePathname } from 'next/navigation';

export function AppWrapper({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const pathname = usePathname();
  const routeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const checkReady = () => {
      if (document.documentElement.dataset.nexusAppReady === 'true') {
        setInitialCheckDone(true);
      } else {
        setTimeout(checkReady, 50);
      }
    };

    checkReady();

    const forceReadyTimeout = setTimeout(() => {
      document.documentElement.dataset.nexusAppReady = 'true';
      setInitialCheckDone(true);
    }, 3000);

    return () => clearTimeout(forceReadyTimeout);
  }, []);

  useEffect(() => {
    if (!initialCheckDone) return;

    if (routeTimerRef.current) clearTimeout(routeTimerRef.current);

    setLoading(true);
    routeTimerRef.current = setTimeout(() => {
      setLoading(false);
    }, 150);

    return () => {
      if (routeTimerRef.current) clearTimeout(routeTimerRef.current);
    };
  }, [pathname, initialCheckDone]);

  if (loading) {
    return <AppLoading />;
  }

  return <>{children}</>;
}
