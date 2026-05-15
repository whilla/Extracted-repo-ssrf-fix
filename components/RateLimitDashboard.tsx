'use client';

import React, { useState, useEffect } from 'react';

export interface RateLimitStatus {
  service: string;
  limit: number;
  remaining: number;
  resetAt: string;
  usage: number;
  isNearLimit: boolean;
}

interface RateLimitDashboardProps {
  services: string[];
}

export function RateLimitDashboard({ services }: RateLimitDashboardProps) {
  const [rateLimits, setRateLimits] = useState<RateLimitStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRateLimits();
    const interval = setInterval(fetchRateLimits, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [services]);

  const fetchRateLimits = async () => {
    try {
      const response = await fetch('/api/rate-limits');
      const data = await response.json();
      setRateLimits(data.limits || []);
    } catch (error) {
      console.error('Failed to fetch rate limits:', error);
    } finally {
      setLoading(false);
    }
  };

  const getUsagePercentage = (limit: number, remaining: number) => {
    return ((limit - remaining) / limit) * 100;
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-orange-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (loading) {
    return <div className="p-4">Loading rate limits...</div>;
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">API Rate Limits</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rateLimits.map((limit) => {
          const usagePercentage = getUsagePercentage(limit.limit, limit.remaining);
          
          return (
            <div key={limit.service} className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-medium">{limit.service}</h3>
                {limit.isNearLimit && (
                  <span className="px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded">
                    Near Limit
                  </span>
                )}
              </div>
              
              <div className="mb-2">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>{limit.remaining} / {limit.limit}</span>
                  <span>{Math.round(usagePercentage)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${getUsageColor(usagePercentage)}`}
                    style={{ width: `${usagePercentage}%` }}
                  />
                </div>
              </div>
              
              <p className="text-xs text-gray-500">
                Resets: {new Date(limit.resetAt).toLocaleTimeString()}
              </p>
            </div>
          );
        })}
      </div>
      
      {rateLimits.length === 0 && (
        <p className="text-gray-500 text-center py-8">No rate limit data available</p>
      )}
    </div>
  );
}
