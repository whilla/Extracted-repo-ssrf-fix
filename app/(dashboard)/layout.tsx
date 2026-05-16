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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <BrandKitProvider>
        <AgentProvider>
          <AppShell>{children}</AppShell>
          <CommandPaletteWrapper />
          <NotificationBootstrap />
        </AgentProvider>
      </BrandKitProvider>
    </AuthGuard>
  );
}
