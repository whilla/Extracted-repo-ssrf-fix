'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { getCachedAuthUser, hasCachedAuthSession } from '@/lib/services/puterService';
import { AgentProvider } from '@/lib/context/AgentContext';
import { BrandKitProvider } from '@/lib/context/BrandKitContext';
import { AppShell } from '@/components/layout/AppShell';
import { FullPageLoading } from '@/components/nexus/LoadingPulse';
import { CommandPaletteWrapper } from '@/components/CommandPalette';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import { NotificationBootstrap } from '@/components/NotificationBootstrap';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoading, isAuthenticated, onboardingComplete, brandKit } = useAuth();
  const hasLocalSession = hasCachedAuthSession() || !!getCachedAuthUser();
  const allowAppShell = isAuthenticated || hasLocalSession;
  const isReady = onboardingComplete || !!brandKit;

  useEffect(() => {
    if (isLoading) return;

    if (!allowAppShell) {
      router.replace('/');
    } else if (!isReady) {
      router.replace('/onboarding');
    }
  }, [isLoading, allowAppShell, isReady, router]);

  if (isLoading) {
    return <FullPageLoading text="Loading..." />;
  }

  if (!allowAppShell) {
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
      <ServiceWorkerRegister />
    </AuthGuard>
  );
}
