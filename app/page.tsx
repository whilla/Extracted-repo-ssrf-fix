'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { waitForPuter } from '@/lib/services/puterService';
import { NeonButton } from '@/components/nexus/NeonButton';
import { GlassCard } from '@/components/nexus/GlassCard';

function LandingContent() {
  const router = useRouter();
  const { isAuthenticated, onboardingComplete, user, login } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [shouldAutoReauth, setShouldAutoReauth] = useState(false);
  const [puterReady, setPuterReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setNextPath(params.get('next'));
    setShouldAutoReauth(params.get('reauth') === '1');
  }, []);

  useEffect(() => {
    let active = true;
    void waitForPuter().then((ready) => {
      if (active) setPuterReady(ready);
    });
    return () => {
      active = false;
    };
  }, []);

  // Redirect authenticated users - only once
  useEffect(() => {
    if (isAuthenticated && user && !hasRedirected) {
      setHasRedirected(true);
      try {
        if (nextPath) {
          router.push(nextPath);
        } else if (onboardingComplete) {
          router.push('/dashboard');
        } else {
          router.push('/onboarding');
        }
      } catch (error) {
        console.error('[LandingPage] Navigation error:', error);
        // Fallback to onboarding on error
        router.push('/onboarding');
      }
    }
  }, [isAuthenticated, user, onboardingComplete, hasRedirected, nextPath, router]);

  const handleSignIn = useCallback(async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setAuthError(null);
    try {
      if (!puterReady) {
        const ready = await waitForPuter();
        setPuterReady(ready);
        if (!ready) {
          setAuthError('Puter failed to load. Check your connection and retry.');
          return;
        }
      }

      const success = await login();
      if (success) {
        // Auth context will handle the redirect
      } else {
        setAuthError('Puter sign-in did not complete. Please try again.');
      }
    } finally {
      setIsSigningIn(false);
    }
  }, [isSigningIn, login, puterReady]);

  useEffect(() => {
    if (!shouldAutoReauth || isAuthenticated || hasRedirected || isSigningIn) return;
    void handleSignIn();
  }, [shouldAutoReauth, isAuthenticated, hasRedirected, isSigningIn, handleSignIn]);

  // Don't show loading screen - page loads instantly
  // Auth check happens in background

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
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
            <NeonButton
              onClick={handleSignIn}
              loading={isSigningIn}
              size="lg"
              className="px-10"
            >
              {isSigningIn ? 'Signing In...' : !puterReady ? 'Connect Puter' : 'Get Started with Puter'}
            </NeonButton>
            <p className="text-sm text-muted-foreground">
              Free to use - pay only for AI credits
            </p>
            {authError && (
              <p className="text-sm text-destructive max-w-md">
                {authError}
              </p>
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
