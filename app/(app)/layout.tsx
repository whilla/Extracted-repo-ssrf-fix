'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { AgentProvider } from '@/lib/context/AgentContext';
import { BrandKitProvider } from '@/lib/context/BrandKitContext';
import { AppShell } from '@/components/layout/AppShell';
import { FullPageLoading } from '@/components/nexus/LoadingPulse';
import { CommandPaletteWrapper } from '@/components/CommandPalette';
import { NotificationBootstrap } from '@/components/NotificationBootstrap';
import { toast } from 'sonner';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const INACTIVITY_WARNING_MS = 25 * 60 * 1000;

function InactivityTracker({ onTimeout }: { onTimeout: () => void }) {
  useEffect(() => {
    let warningTimer: ReturnType<typeof setTimeout>;
    let logoutTimer: ReturnType<typeof setTimeout>;

    const resetTimers = () => {
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);

      warningTimer = setTimeout(() => {
        toast.warning('Session will expire due to inactivity', { duration: 10000 });
      }, INACTIVITY_WARNING_MS);

      logoutTimer = setTimeout(() => {
        onTimeout();
      }, INACTIVITY_TIMEOUT_MS);
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    events.forEach(event => window.addEventListener(event, resetTimers));
    resetTimers();

    return () => {
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      events.forEach(event => window.removeEventListener(event, resetTimers));
    };
  }, [onTimeout]);

  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoading, isAuthenticated, isGuest, onboardingComplete, brandKit } = useAuth();
  
  const isReady = onboardingComplete || !!brandKit;
  const loginRedirect = `/?reauth=1&next=${encodeURIComponent(pathname || '/dashboard')}`;
  const canAccessApp = isAuthenticated || isGuest;

  useEffect(() => {
    if (isLoading) return;
    if (!canAccessApp) {
      router.replace(loginRedirect);
    } else if (!isReady) {
      router.replace('/onboarding');
    }
  }, [canAccessApp, isLoading, isReady, loginRedirect, router]);

  if (isLoading) {
    return <FullPageLoading text="Loading..." />;
  }
  if (!canAccessApp) {
    return <FullPageLoading text="Redirecting to login..." />;
  }
  if (!isReady) {
    return <FullPageLoading text="Redirecting to onboarding..." />;
  }

  return <>{children}</>;
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logout, isAuthenticated } = useAuth();
  const handleTimeout = React.useCallback(() => {
    toast.error('Session expired due to inactivity');
    logout();
  }, [logout]);

  return (
    <AuthGuard>
      <BrandKitProvider>
        <AgentProvider>
          {isAuthenticated && <InactivityTracker onTimeout={handleTimeout} />}
          <AppShell>{children}</AppShell>
          <CommandPaletteWrapper />
          <NotificationBootstrap />
        </AgentProvider>
      </BrandKitProvider>
    </AuthGuard>
  );
}
