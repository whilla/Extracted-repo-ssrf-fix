'use client';

import { useAgent } from '@/lib/context/AgentContext';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

// Brain/AI icon SVG
function AgentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a8 8 0 0 0-8 8v4a8 8 0 0 0 16 0v-4a8 8 0 0 0-8-8z" />
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
      <path d="M9.5 15a3.5 3.5 0 0 0 5 0" />
      <path d="M12 2v-1" />
      <path d="M8 3l-1-1" />
      <path d="M16 3l1-1" />
    </svg>
  );
}

export function NexusAgentFAB() {
  const { isOpen, closeAgent, isThinking, toggleAgent, pendingFiles } = useAgent();
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Handle mounting animation
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeAgent();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) return;
        e.preventDefault();
        toggleAgent();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeAgent, toggleAgent]);

  // Handle virtual keyboard on mobile
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      if (window.visualViewport) {
        const offset = window.innerHeight - window.visualViewport.height;
        setKeyboardOffset(offset > 0 ? offset : 0);
      }
    };

    window.visualViewport?.addEventListener('resize', handleResize);
    return () => window.visualViewport?.removeEventListener('resize', handleResize);
  }, []);

  // Don't render FAB if panel is open
  if (isOpen) return null;

  return (
    <button
      onClick={toggleAgent}
      className={cn(
        'fixed z-[9999] flex items-center justify-center',
        'w-14 h-14 rounded-full',
        'bg-gradient-to-br from-[var(--nexus-cyan)] to-[var(--nexus-violet)]',
        'shadow-lg hover:shadow-[0_0_30px_rgba(0,245,255,0.5)]',
        'transition-all duration-300 ease-out',
        'focus:outline-none focus:ring-2 focus:ring-[var(--nexus-cyan)] focus:ring-offset-2 focus:ring-offset-background',
        mounted ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
      )}
      style={{
        bottom: `calc(80px + ${keyboardOffset}px + env(safe-area-inset-bottom, 0px))`,
        right: '20px',
      }}
      aria-label="Open AI Assistant"
    >
      {/* Pulse ring when thinking */}
      {isThinking && (
        <span
          className="absolute inset-0 rounded-full bg-[var(--nexus-cyan)] opacity-30 pulse-ring"
          aria-hidden="true"
        />
      )}

      {/* Icon */}
      <AgentIcon
        className={cn(
          'w-7 h-7 text-background',
          isThinking && 'animate-pulse'
        )}
      />

      {/* Pending files badge */}
      {pendingFiles.length > 0 && (
        <span
          className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 rounded-full bg-[var(--nexus-warning)] text-background text-xs font-bold"
          aria-label={`${pendingFiles.length} files attached`}
        >
          {pendingFiles.length}
        </span>
      )}
    </button>
  );
}
