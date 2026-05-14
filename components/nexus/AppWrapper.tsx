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
  }, []);
  
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
