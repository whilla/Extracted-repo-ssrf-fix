'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { GlassCard } from '@/components/nexus/GlassCard';

export default function SimpleLandingPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  // Redirect if authenticated
  if (isAuthenticated) {
    router.push('/dashboard');
    return null;
  }

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
          <h1 className="text-4xl sm:text-5xl font-bold mb-6 leading-tight">
            <span className="gradient-text">Simplified</span> NexusAI
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Working version - core functionality only
          </p>

          <div className="flex flex-col items-center justify-center gap-4 mb-12">
            <button
              onClick={() => router.push('/dashboard')}
              className="inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background bg-gradient-to-r from-[var(--nexus-cyan)] to-[var(--nexus-violet)] text-background hover:shadow-[0_0_30px_rgba(0,245,255,0.5)] focus:ring-[var(--nexus-cyan)] h-12 text-base gap-2.5 px-10"
            >
              Enter Dashboard
            </button>

            <p className="text-sm text-muted-foreground">
              Simplified version without Puter.js dependency
            </p>
          </div>

          {/* Features */}
          <div className="grid sm:grid-cols-2 gap-4">
            <GlassCard className="p-4">
              <h3 className="font-semibold mb-2 text-[var(--nexus-cyan)]">Working Core</h3>
              <p className="text-sm text-muted-foreground">
                Basic dashboard and navigation
              </p>
            </GlassCard>

            <GlassCard className="p-4">
              <h3 className="font-semibold mb-2 text-[var(--nexus-violet)]">No External Deps</h3>
              <p className="text-sm text-muted-foreground">
                Removed Puter.js requirement
              </p>
            </GlassCard>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 border-t border-border text-center text-sm text-muted-foreground">
        <p>Simplified NexusAI - Core functionality only</p>
      </footer>
    </div>
  );
}