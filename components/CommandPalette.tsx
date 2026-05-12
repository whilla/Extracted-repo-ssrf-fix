'use client';

import { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Command,
  LayoutDashboard,
  Wand2,
  Calendar,
  Palette,
  Settings,
  Search,
  FileText,
  Image,
  Hash,
  Clock,
  BarChart3,
  Users,
  TrendingUp,
  Sparkles,
  Cpu,
  Share2,
  Download,
  Plus,
  Bot,
  Zap,
  MessageSquare,
} from 'lucide-react';
import { AgentContext } from '@/lib/context/AgentContext';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords: string[];
  category: 'navigation' | 'actions' | 'tools' | 'ai';
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  
  // Use context directly to avoid throwing if not available
  const agentContext = useContext(AgentContext);
  const openAgent = agentContext?.openAgent ?? (() => {});
  const toggleGodMode = agentContext?.toggleGodMode ?? (() => {});

  const commands: CommandItem[] = useMemo(() => [
    // Navigation
    { id: 'dashboard', label: 'Go to Dashboard', icon: LayoutDashboard, action: () => router.push('/dashboard'), keywords: ['home', 'main'], category: 'navigation' },
    { id: 'studio', label: 'Go to Content Studio', icon: Wand2, action: () => router.push('/studio'), keywords: ['create', 'write'], category: 'navigation' },
    { id: 'drafts', label: 'Go to Drafts', icon: FileText, action: () => router.push('/drafts'), keywords: ['saved', 'posts'], category: 'navigation' },
    { id: 'calendar', label: 'Go to Calendar', icon: Calendar, action: () => router.push('/calendar'), keywords: ['schedule', 'plan'], category: 'navigation' },
    { id: 'analytics', label: 'Go to Analytics', icon: BarChart3, action: () => router.push('/analytics'), keywords: ['stats', 'metrics'], category: 'navigation' },
    { id: 'social', label: 'Go to Social Hub', icon: Share2, action: () => router.push('/social'), keywords: ['connect', 'platforms'], category: 'navigation' },
    { id: 'brand', label: 'Go to Brand Kit', icon: Palette, action: () => router.push('/brand'), keywords: ['colors', 'style'], category: 'navigation' },
    { id: 'settings', label: 'Go to Settings', icon: Settings, action: () => router.push('/settings'), keywords: ['config', 'preferences'], category: 'navigation' },
    { id: 'providers', label: 'Go to AI Providers', icon: Cpu, action: () => router.push('/providers'), keywords: ['models', 'api'], category: 'navigation' },
    { id: 'skills', label: 'Go to AI Skills', icon: Sparkles, action: () => router.push('/skills'), keywords: ['abilities', 'functions'], category: 'navigation' },
    { id: 'templates', label: 'Go to Templates', icon: FileText, action: () => router.push('/templates'), keywords: ['library', 'presets'], category: 'navigation' },
    { id: 'trending', label: 'Go to Trending', icon: TrendingUp, action: () => router.push('/trending'), keywords: ['viral', 'topics'], category: 'navigation' },
    { id: 'competitors', label: 'Go to Competitors', icon: Users, action: () => router.push('/competitors'), keywords: ['analysis', 'compare'], category: 'navigation' },
    { id: 'linkinbio', label: 'Go to Link in Bio', icon: Share2, action: () => router.push('/linkinbio'), keywords: ['links', 'page'], category: 'navigation' },
    
    // Actions
    { id: 'new-post', label: 'Create New Post', description: 'Start writing a new post', icon: Plus, action: () => { router.push('/studio'); }, keywords: ['write', 'content'], category: 'actions' },
    { id: 'generate-image', label: 'Generate Image', description: 'Create AI image', icon: Image, action: () => { router.push('/studio?tab=image'); }, keywords: ['ai', 'visual'], category: 'actions' },
    { id: 'find-hashtags', label: 'Find Hashtags', description: 'Research trending hashtags', icon: Hash, action: () => { router.push('/studio?tab=hashtags'); }, keywords: ['tags', 'discover'], category: 'actions' },
    { id: 'best-time', label: 'Best Time to Post', description: 'Find optimal posting times', icon: Clock, action: () => { router.push('/analytics?tab=timing'); }, keywords: ['schedule', 'optimal'], category: 'actions' },
    { id: 'export', label: 'Export Report', description: 'Download analytics report', icon: Download, action: () => { router.push('/analytics?export=true'); }, keywords: ['download', 'pdf'], category: 'actions' },
    
    // AI Tools
    { id: 'open-agent', label: 'Open AI Agent', description: 'Chat with Nexus AI', icon: Bot, action: () => { openAgent(); setOpen(false); }, keywords: ['chat', 'assistant'], category: 'ai' },
    { id: 'god-mode', label: 'Toggle God Mode', description: 'Multi-model AI thinking', icon: Zap, action: () => { toggleGodMode(); openAgent(); setOpen(false); }, keywords: ['advanced', 'multi'], category: 'ai' },
    { id: 'generate-ideas', label: 'Generate Content Ideas', description: 'Get AI-powered ideas', icon: Sparkles, action: () => { openAgent(); setOpen(false); }, keywords: ['brainstorm', 'suggest'], category: 'ai' },
    { id: 'reply-suggestions', label: 'Comment Replies', description: 'AI reply suggestions', icon: MessageSquare, action: () => { router.push('/comments'); }, keywords: ['respond', 'engage'], category: 'ai' },
  ], [router, openAgent, toggleGodMode]);

  const filteredCommands = useMemo(() => {
    if (!search) return commands;
    
    const searchLower = search.toLowerCase();
    return commands.filter(cmd =>
      cmd.label.toLowerCase().includes(searchLower) ||
      cmd.description?.toLowerCase().includes(searchLower) ||
      cmd.keywords.some(k => k.includes(searchLower))
    );
  }, [commands, search]);

  // PERFORMANCE FIX: Pre-compute indices to avoid O(n) indexOf calls in render loop
  const commandIndices = useMemo(() => {
    const indices = new Map<string, number>();
    filteredCommands.forEach((cmd, idx) => {
      indices.set(cmd.id, idx);
    });
    return indices;
  }, [filteredCommands]);

  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {
      navigation: [],
      actions: [],
      tools: [],
      ai: [],
    };
    
    filteredCommands.forEach(cmd => {
      groups[cmd.category].push(cmd);
    });
    
    return groups;
  }, [filteredCommands]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Open with Cmd+K or Ctrl+K (skip if typing in an input)
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      setOpen(prev => !prev);
      return;
    }

    if (!open) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          setOpen(false);
          setSearch('');
        }
        break;
      case 'Escape':
        setOpen(false);
        setSearch('');
        break;
    }
    // PERFORMANCE FIX: Use ref-based state to avoid dependency on mutable state
  }, [open, filteredCommands, selectedIndex]);

  // PERFORMANCE FIX: Memoize event listener to prevent memory leak from re-adding on every render
  useEffect(() => {
    if (!open) return;
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => { setOpen(false); setSearch(''); }}
      />
      
      {/* Command palette */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl">
        <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type a command or search..."
              className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-xs bg-muted rounded text-muted-foreground">
              ESC
            </kbd>
          </div>
          
          {/* Results */}
          <div className="max-h-[400px] overflow-y-auto p-2">
            {filteredCommands.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No results found
              </div>
            ) : (
              <>
                {groupedCommands.ai.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                      AI Tools
                    </div>
                    {groupedCommands.ai.map((cmd, i) => {
                      const globalIndex = filteredCommands.indexOf(cmd);
                      return (
                        <CommandRow
                          key={cmd.id}
                          command={cmd}
                          isSelected={selectedIndex === globalIndex}
                          onClick={() => {
                            cmd.action();
                            setOpen(false);
                            setSearch('');
                          }}
                        />
                      );
                    })}
                  </div>
                )}
                
                {groupedCommands.actions.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                      Actions
                    </div>
                    {groupedCommands.actions.map((cmd) => {
                      const globalIndex = filteredCommands.indexOf(cmd);
                      return (
                        <CommandRow
                          key={cmd.id}
                          command={cmd}
                          isSelected={selectedIndex === globalIndex}
                          onClick={() => {
                            cmd.action();
                            setOpen(false);
                            setSearch('');
                          }}
                        />
                      );
                    })}
                  </div>
                )}
                
                {groupedCommands.navigation.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                      Navigation
                    </div>
                    {groupedCommands.navigation.map((cmd) => {
                      const globalIndex = filteredCommands.indexOf(cmd);
                      return (
                        <CommandRow
                          key={cmd.id}
                          command={cmd}
                          isSelected={selectedIndex === globalIndex}
                          onClick={() => {
                            cmd.action();
                            setOpen(false);
                            setSearch('');
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
          
          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-muted rounded">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-muted rounded">↓</kbd>
                to navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-muted rounded">↵</kbd>
                to select
              </span>
            </div>
            <span className="flex items-center gap-1">
              <Command className="w-3 h-3" />K to toggle
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommandRow({ 
  command, 
  isSelected, 
  onClick 
}: { 
  command: CommandItem; 
  isSelected: boolean; 
  onClick: () => void;
}) {
  const Icon = command.icon;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
        isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
      )}
    >
      <Icon className={cn('w-4 h-4', isSelected ? 'text-primary' : 'text-muted-foreground')} />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{command.label}</div>
        {command.description && (
          <div className="text-xs text-muted-foreground truncate">{command.description}</div>
        )}
      </div>
      {isSelected && (
        <kbd className="px-1.5 py-0.5 text-xs bg-primary/20 rounded">↵</kbd>
      )}
    </button>
  );
}

// Wrapper component that manages its own state and renders inside AgentProvider
export function CommandPaletteWrapper() {
  return <CommandPalette />;
}
