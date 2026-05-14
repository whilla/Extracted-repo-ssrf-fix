'use client';

import { GlassCard } from './GlassCard';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtext?: string;
}

export function StatCard({ label, value, icon, subtext }: StatCardProps) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">{label}</span>
        {icon}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-white">{value}</span>
        {subtext && <span className="text-xs text-gray-500">{subtext}</span>}
      </div>
    </GlassCard>
  );
}
