/**
 * Health Check Endpoint
 * Used by container orchestration (K8s, Docker Compose, etc.)
 */

import { NextResponse } from 'next/server';
import { getRateLimitStats } from '@/lib/utils/rateLimiter';
import { isSupabaseConfigured } from '@/lib/config/envConfig';
import { kvGet } from '@/lib/services/puterService';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail' | 'warn';
      message?: string;
      latency?: number;
    };
  };
}

const startTime = Date.now();

export async function GET() {
  const checks: HealthStatus['checks'] = {};
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  const start = Date.now();

  try {
    const supabaseConfigured = isSupabaseConfigured();
    checks.supabase = {
      status: supabaseConfigured ? 'pass' : 'warn',
      message: supabaseConfigured ? 'Configured' : 'Not configured',
    };
    if (!supabaseConfigured) overallStatus = 'degraded';
  } catch (error) {
    checks.supabase = {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
    overallStatus = 'unhealthy';
  }

  checks.rateLimiter = {
    status: 'pass',
    ...getRateLimitStats(),
  };

  try {
    const puterTest = await Promise.race([
      kvGet('health_check'),
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 2000)
      ),
    ]);
    checks.puter = {
      status: 'pass',
      latency: Date.now() - start,
    };
  } catch {
    checks.puter = {
      status: warn => 'warn',
      message: 'Puter not available or timeout',
    };
    if (overallStatus === 'healthy') overallStatus = 'degraded';
  }

  const health: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: Date.now() - startTime,
    version: process.env.npm_package_version || '1.0.0',
    checks,
  };

  const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}

export async function HEAD() {
  return GET();
}