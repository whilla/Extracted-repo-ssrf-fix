'use client';

import { useEffect, useRef, useState } from 'react';
import { AppLoading } from './AppLoading';
import { usePathname } from 'next/navigation';

const LOADING_DURATION_MS = 150;
const HARD_STOP_MS = 1000;

export function AppWrapper({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();
  const isInitialMountRef = useRef(true);
  const previousPathnameRef = useRef<string | null>(null);
  const routeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.documentElement.dataset.nexusAppReady = 'true';
  }, []);

  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      previousPathnameRef.current = pathname;
      return;
    }

    if (previousPathnameRef.current === pathname) {
      return;
    }

    previousPathnameRef.current = pathname;

    if (routeTimerRef.current) clearTimeout(routeTimerRef.current);
    if (hardStopTimerRef.current) clearTimeout(hardStopTimerRef.current);

    setLoading(true);
    routeTimerRef.current = setTimeout(() => {
      setLoading(false);
    }, LOADING_DURATION_MS);
    hardStopTimerRef.current = setTimeout(() => {
      setLoading(false);
    }, HARD_STOP_MS);

    return () => {
      if (routeTimerRef.current) clearTimeout(routeTimerRef.current);
      if (hardStopTimerRef.current) clearTimeout(hardStopTimerRef.current);
    };
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (routeTimerRef.current) clearTimeout(routeTimerRef.current);
      if (hardStopTimerRef.current) clearTimeout(hardStopTimerRef.current);
    };
  }, []);

  if (loading) {
    return <AppLoading />;
  }

  return <>{children}</>;
}
