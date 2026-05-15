'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { useNexusAutomation } from '@/hooks/useNexus';
import {
  LayoutDashboard,
  Wand2,
  Calendar,
  Palette,
  Settings,
  LogOut,
  Menu,
  X,
  BarChart3,
  Share2,
  Sparkles,
  FileText,
  Cpu,
  TrendingUp,
  TestTube2,
  Upload,
  CheckCircle2,
  Activity,
  History,
  Brain,
  Clapperboard,
  Zap,
  Radio,
  Database,
  Power,
  FlaskConical,
  Repeat,
  Gauge,
  Shield,
  ShoppingCart,
  Gamepad2,
  Cuboid,
  Users,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/nexus', label: 'Nexus AI', icon: Zap },
  { href: '/studio', label: 'Content Studio', icon: Wand2 },
  { href: '/drafts', label: 'Drafts', icon: FileText },
  { href: '/approvals', label: 'Approvals', icon: CheckCircle2 },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/discovery', label: 'Trend Discovery', icon: TrendingUp },
  { href: '/abtest', label: 'A/B Testing', icon: TestTube2 },
  { href: '/bulk-schedule', label: 'Bulk Schedule', icon: Upload },
  { href: '/social', label: 'Social Hub', icon: Share2 },
  { href: '/scenes', label: 'Scene Planner', icon: Clapperboard },
  { href: '/agent-creator', label: 'Agent Creator', icon: Zap },
  { href: '/media-providers', label: 'Media Providers', icon: Radio },
  { href: '/skills', label: 'AI Skills', icon: Sparkles },
  { href: '/memory', label: 'Agent Memory', icon: Database },
  { href: '/providers', label: 'AI Providers', icon: Cpu },
  { href: '/agents', label: 'Agent Control', icon: Brain },
  { href: '/diagnostics', label: 'Diagnostics', icon: Activity },
  { href: '/history', label: 'Run History', icon: History },
  { href: '/brand', label: 'Brand Kit', icon: Palette },
  { href: '/realtime', label: 'Live Analytics', icon: Gauge },
  { href: '/fine-tuning', label: 'Model Tuning', icon: FlaskConical },
  { href: '/repurpose', label: 'Repurpose', icon: Repeat },
  { href: '/ecommerce', label: 'E-Commerce', icon: ShoppingCart },
  { href: '/interactive', label: 'Interactive', icon: Gamepad2 },
  { href: '/dataviz', label: 'Data Viz', icon: BarChart3 },
  { href: '/spatial', label: '3D / AR / VR', icon: Cuboid },
  { href: '/predictive', label: 'Predictive', icon: TrendingUp },
  { href: '/compliance', label: 'Compliance', icon: Shield },
  { href: '/collaboration', label: 'Collaboration', icon: Users },
  { href: '/crm', label: 'CRM', icon: Database },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/admin', label: 'Admin', icon: Shield },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const automation = useNexusAutomation();

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg glass-card"
        aria-label="Toggle menu"
      >
        {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-64 z-40',
          'bg-sidebar border-r border-sidebar-border',
          'flex flex-col',
          'transition-transform duration-300 ease-in-out',
          'lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--nexus-cyan)] to-[var(--nexus-violet)] flex items-center justify-center">
              <span className="text-background font-bold text-xl">N</span>
            </div>
            <span className="font-bold text-xl gradient-text">NexusAI</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-sidebar-border scrollbar-track-transparent">
          <button
            onClick={automation.toggle}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-3 text-left',
              'transition-all duration-200 border',
              automation.state.isRunning
                ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/15'
                : 'bg-sidebar-accent/60 border-sidebar-border text-sidebar-foreground/80 hover:bg-sidebar-accent'
            )}
            aria-label={automation.state.isRunning ? 'Turn autopilot off' : 'Turn autopilot on'}
          >
            <Power className={cn('w-5 h-5', automation.state.isRunning && 'text-emerald-300')} />
            <div className="flex-1 min-w-0">
              <div className="font-medium">Autopilot {automation.state.isRunning ? 'On' : 'Off'}</div>
              <div className="text-xs opacity-70">
                {automation.state.isRunning
                  ? automation.state.nextRun
                    ? `Next run ${new Date(automation.state.nextRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Running'
                  : 'Tap to start automation'}
              </div>
            </div>
            <div
              className={cn(
                'w-11 h-6 rounded-full p-1 transition-colors',
                automation.state.isRunning ? 'bg-emerald-400/80' : 'bg-muted'
              )}
            >
              <div
                className={cn(
                  'w-4 h-4 rounded-full bg-white transition-transform',
                  automation.state.isRunning ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </div>
          </button>

          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl',
                  'transition-all duration-200',
                  'hover:bg-sidebar-accent',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground'
                )}
              >
                <Icon className={cn('w-5 h-5', isActive && 'text-[var(--nexus-cyan)]')} />
                <span className="font-medium">{item.label}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--nexus-cyan)]" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-sidebar-accent/50">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--nexus-cyan)] to-[var(--nexus-violet)] flex items-center justify-center">
              <span className="text-background font-semibold text-sm">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {user?.username || 'User'}
              </p>
              <p className="text-xs text-muted-foreground">Free Plan</p>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
