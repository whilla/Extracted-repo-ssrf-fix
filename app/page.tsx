'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { getPuterAuthDiagnostics, waitForPuter, type PuterAuthDiagnostics } from '@/lib/services/puterService';
import { sanitizeRedirectUrl } from '@/lib/utils';
import { GlassCard } from '@/components/nexus/GlassCard';

function LandingContent() {
  const router = useRouter();
  const { isAuthenticated, isGuest, onboardingComplete, user } = useAuth();
  const [hasRedirected, setHasRedirected] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [needsManualReauth, setNeedsManualReauth] = useState(false);
  const [authUnavailable, setAuthUnavailable] = useState(false);
  const [puterReady, setPuterReady] = useState(false);
  const [authDiagnostics, setAuthDiagnostics] = useState<PuterAuthDiagnostics | null>(null);
  const guestEntryHref = `/onboarding?guest=1${nextPath ? `&next=${encodeURIComponent(nextPath)}` : ''}`;
  const connectEntryHref = `/onboarding?guest=1&connect=1${nextPath ? `&next=${encodeURIComponent(nextPath)}` : ''}`;

  const refreshDiagnostics = useCallback(async () => {
    const diagnostics = await getPuterAuthDiagnostics();
    setAuthDiagnostics(diagnostics);
    setPuterReady(diagnostics.sdkReady);
    return diagnostics;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    // SECURITY FIX: Validate redirect URL to prevent open redirect attacks
    const next = params.get('next');
    setNextPath(next);
    setNeedsManualReauth(params.get('reauth') === '1');
    const authStatus = params.get('auth');
    if (authStatus === 'unconfigured' || authStatus === 'unavailable') {
      setAuthUnavailable(true);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      await refreshDiagnostics();
      const ready = await waitForPuter();
      if (!active) return;

      if (ready) {
        await refreshDiagnostics();
      }
    })();

    return () => {
      active = false;
    };
  }, [refreshDiagnostics]);

  // Redirect authenticated users - only once
  useEffect(() => {
    if (isGuest && !hasRedirected) {
      setHasRedirected(true);
      // SECURITY FIX: Sanitize redirect URL before navigation
      const safeUrl = sanitizeRedirectUrl(nextPath, onboardingComplete ? '/dashboard' : '/onboarding');
      router.push(safeUrl);
      return;
    }

    if (isAuthenticated && user && !hasRedirected) {
      setHasRedirected(true);
      try {
        // SECURITY FIX: Validate nextPath before redirect
        const safeUrl = sanitizeRedirectUrl(nextPath, onboardingComplete ? '/dashboard' : '/onboarding');
        router.push(safeUrl);
      } catch (error) {
        console.error('[LandingPage] Navigation error:', error);
        // Fallback to dashboard on error
        router.push('/dashboard');
      }
    }
  }, [isAuthenticated, isGuest, user, onboardingComplete, hasRedirected, nextPath, router]);

  const isRedirecting = (isGuest || (isAuthenticated && user)) && !hasRedirected;

  // Don't show loading screen - page loads instantly
  // Auth check happens in background

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {isRedirecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-[var(--nexus-cyan)] to-[var(--nexus-violet)] animate-pulse mx-auto mb-4" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="p-6 border-b border-border">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--nexus-cyan)] to-[var(--nexus-violet)] flex items-center justify-center neon-glow">
            <span className="text-background font-bold text-xl">N</span>
          </div>
          <span className="font-bold text-xl gradient-text">NexusAI</span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-2xl mx-auto text-center">
          {/* Hero */}
          <h1 className="text-4xl sm:text-5xl font-bold mb-6 leading-tight">
            <span className="gradient-text">AI-Powered</span> Social Media Automation
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Create, validate, and publish high-quality content across all major platforms with your personal AI assistant.
          </p>

          {/* CTA */}
          <div className="flex flex-col items-center justify-center gap-4 mb-12">
            <a
              href={guestEntryHref}
              className="inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background bg-gradient-to-r from-[var(--nexus-cyan)] to-[var(--nexus-violet)] text-background hover:shadow-[0_0_30px_rgba(0,245,255,0.5)] focus:ring-[var(--nexus-cyan)] h-12 text-base gap-2.5 px-10"
            >
              Enter App
            </a>
            <p className="text-sm text-muted-foreground max-w-md">
              Start in guest mode and connect Puter later from inside the app.
            </p>
            <a
              href={connectEntryHref}
              className="inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background bg-transparent text-foreground border border-border hover:bg-muted/50 focus:ring-muted h-12 text-base gap-2.5 px-10"
            >
              Connect Puter
            </a>
            <p className="text-sm text-muted-foreground">
              Free to use - pay only for AI credits
            </p>
            {!puterReady && (
              <p className="text-sm text-muted-foreground max-w-md">
                Puter is optional on this screen. If it is not cooperating, enter the app and connect it later.
              </p>
            )}
            {needsManualReauth && (
              <p className="text-sm text-muted-foreground max-w-md">
                Your session needs to be reconnected. Tap the button to authorize Puter.
              </p>
            )}
            {authUnavailable && (
              <p className="text-sm text-amber-400 max-w-md">
                Authentication service is currently unavailable. You can still explore the app in guest mode.
              </p>
            )}
            {authDiagnostics && (
              <div className="text-xs text-muted-foreground text-left w-full max-w-md rounded-lg border border-border bg-background/40 p-3">
                <p>SDK: {authDiagnostics.sdkReady ? 'ready' : 'not ready'}</p>
                <p>Script: {authDiagnostics.scriptPresent ? 'present' : 'missing'}</p>
                <p>Dialog: {authDiagnostics.authDialogAvailable ? 'available' : 'fallback auth.signIn()'}</p>
                <p>Session: {authDiagnostics.signedIn ? 'signed in' : 'not signed in'}</p>
                <p>User: {authDiagnostics.userPresent ? 'present' : 'missing'}</p>
                <p>Cached: {authDiagnostics.cachedSession ? 'true' : 'false'}</p>
              </div>
            )}
          </div>

          {/* Features */}
          <div className="grid sm:grid-cols-2 gap-4">
            <GlassCard className="p-4">
              <h3 className="font-semibold mb-2 text-[var(--nexus-cyan)]">AI Content Generation</h3>
              <p className="text-sm text-muted-foreground">
                Generate engaging posts, images, and scripts with advanced AI models.
              </p>
            </GlassCard>

            <GlassCard className="p-4">
              <h3 className="font-semibold mb-2 text-[var(--nexus-violet)]">Quality Validation</h3>
              <p className="text-sm text-muted-foreground">
                AI validates every piece of content before publishing.
              </p>
            </GlassCard>

            <GlassCard className="p-4">
              <h3 className="font-semibold mb-2 text-[var(--nexus-success)]">Multi-Platform</h3>
              <p className="text-sm text-muted-foreground">
                Publish to Twitter, Instagram, TikTok, LinkedIn, and more.
              </p>
            </GlassCard>

            <GlassCard className="p-4">
              <h3 className="font-semibold mb-2 text-[var(--nexus-warning)]">Zero Backend</h3>
              <p className="text-sm text-muted-foreground">
                Runs entirely in your browser with Puter.js.
              </p>
            </GlassCard>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 border-t border-border text-center text-sm text-muted-foreground">
        <p>Powered by Puter.js - Users pay their own AI credits</p>
      </footer>
    </div>
  );
}

export default function LandingPage() {
  return <LandingContent />;
}
