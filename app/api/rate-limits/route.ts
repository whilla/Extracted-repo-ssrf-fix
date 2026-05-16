import { NextResponse } from 'next/server';
import { RateLimiter } from '@/lib/services/rateLimiter';

export async function GET() {
  const stats = RateLimiter.getStats();
  const limits = [
    {
      service: 'Nexus API',
      scope: 'in-memory fallback',
      activeEntries: stats.activeEntries,
      totalKeys: stats.totalKeys,
      isNearLimit: false,
    },
  ];

  return NextResponse.json({ limits });
}
