'use client';

import { useId } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { GlassCard } from './GlassCard';

interface CollapsiblePanelProps {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  badge?: number;
  children: React.ReactNode;
}

export function CollapsiblePanel({ title, icon, expanded, onToggle, badge, children }: CollapsiblePanelProps) {
  const panelId = useId();
  return (
    <GlassCard padding="none">
      <button
        onClick={onToggle}
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {badge !== undefined && badge > 0 && (
            <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded-full">
              {badge}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        )}
      </button>
      {expanded && (
        <div id={panelId} className="px-4 pb-4 border-t border-gray-700/50">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </GlassCard>
  );
}
