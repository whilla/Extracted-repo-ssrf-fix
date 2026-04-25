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
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import { CommandPaletteWrapper } from '@/components/CommandPalette';
import { NotificationBootstrap } from '@/components/NotificationBootstrap';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoading, isAuthenticated, onboardingComplete, brandKit } = useAuth();
  const hasLocalSession = hasCachedAuthSession() || !!getCachedAuthUser();
  const allowAppShell = isAuthenticated || hasLocalSession;
  
  // Consider onboarding complete if either flag is true OR brandKit exists
  const isReady = onboardingComplete || !!brandKit;

  useEffect(() => {
    if (isLoading) return;
    
    if (!allowAppShell) {
      router.replace('/');
    } else if (!isReady) {
      router.replace('/onboarding');
    }
  }, [isLoading, allowAppShell, isReady, router]);

  // Show loading while auth is being checked
  if (isLoading) {
    return <FullPageLoading text="Loading..." />;
  }

  // If not authenticated, show redirecting
  if (!allowAppShell) {
    return <FullPageLoading text="Redirecting to login..." />;
  }
  
  // If onboarding not complete, show redirecting
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
