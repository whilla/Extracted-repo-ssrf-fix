'use client';

import { useState, useEffect } from 'react';
import { AppLoading } from './AppLoading';
import { usePathname, useSearchParams } from 'next/navigation';

export function AppWrapper({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    // App is ready when layout marks it as ready
    const checkReady = () => {
      if (document.documentElement.dataset.nexusAppReady === 'true') {
        setLoading(false);
      } else {
        setTimeout(checkReady, 100);
      }
    };
    
    checkReady();
    
    // SECURITY FIX: Add timeout to prevent infinite loading if nexusAppReady is never set
    // This can happen if Puter.js fails to load or runtime bootstrap errors
    const forceReadyTimeout = setTimeout(() => {
      if (loading) {
        console.warn('[AppWrapper] Forcing app ready after timeout - nexusAppReady was not set');
        document.documentElement.dataset.nexusAppReady = 'true';
        setLoading(false);
      }
    }, 8000); // 8 second timeout matches PUTER_READY_TIMEOUT
    
    return () => clearTimeout(forceReadyTimeout);
  }, [loading]);
  
  // Show loading indicator on route changes
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(timer);
  }, [pathname, searchParams]);
  
  if (loading) {
    return <AppLoading />;
  }
  
  return <>{children}</>;
}
