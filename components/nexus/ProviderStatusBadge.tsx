'use client';

export interface ProviderStatusProps {
  name: string;
  status: 'healthy' | 'degraded' | 'offline' | 'unknown';
  latency?: number;
}

export function ProviderStatusBadge({ name, status, latency }: ProviderStatusProps) {
  const statusColors = {
    healthy: 'text-green-400',
    degraded: 'text-yellow-400',
    offline: 'text-red-400',
    unknown: 'text-gray-400',
  };

  return (
    <div role="status" aria-live="polite" aria-label={`${name} status: ${status}`} className="flex items-center justify-between p-2 bg-black/30 rounded-lg">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={`w-2 h-2 rounded-full ${
          status === 'healthy' ? 'bg-green-400' :
          status === 'degraded' ? 'bg-yellow-400' : status === 'offline' ? 'bg-red-400' : 'bg-gray-400'
        }`} />
        <span className="text-sm text-gray-300">{name}</span>
      </div>
      <div className="flex items-center gap-2">
        {latency != null && <span className="text-xs text-gray-500">{latency}ms</span>}
        <span className={`text-xs font-medium ${statusColors[status]}`}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </div>
    </div>
  );
}
