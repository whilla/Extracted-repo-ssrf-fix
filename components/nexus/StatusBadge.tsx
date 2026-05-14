'use client';

import React from 'react';

interface StatusBadgeProps {
  status: any;
  label?: string;
  children?: React.ReactNode;
  dot?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ status, label, children, dot, size = 'md' }: StatusBadgeProps) {
  const colors: Record<string, string> = {
    online: 'bg-green-500/20 text-green-400 border-green-500/30',
    offline: 'bg-red-500/20 text-red-400 border-red-500/30',
    active: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    inactive: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    success: 'bg-green-500/20 text-green-400 border-green-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
    warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    neutral: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    default: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  const dots: Record<string, string> = {
    online: 'bg-green-400',
    offline: 'bg-red-400',
    active: 'bg-cyan-400 animate-pulse',
    inactive: 'bg-gray-400',
    success: 'bg-green-400',
    error: 'bg-red-400',
    warning: 'bg-amber-400',
    info: 'bg-blue-400',
    pending: 'bg-amber-400',
    neutral: 'bg-gray-400',
    default: 'bg-gray-400',
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  const content = children || label;

  return (
    <div className={`flex items-center gap-2 rounded-full border ${colors[status] || colors.neutral} ${sizeClasses[size]}`}>
      {dot && (
        <span className={`w-2 h-2 rounded-full ${dots[status] || dots.neutral}`} />
      )}
      {content}
    </div>
  );
}
