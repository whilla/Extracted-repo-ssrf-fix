/**
 * Health Check Endpoint
 * Used by container orchestration (K8s, Docker Compose, etc.)
 */

import { NextResponse } from 'next/server';
import { getRateLimitStats } from '@/lib/utils/rateLimiter';
import { isSupabaseConfigured } from '@/lib/config/envConfig';
import { kvGet } from '@/lib/services/puterService';
import { healthCheckAllProviders } from '@/lib/services/providerCapabilityService';
import { automationEngine } from '@/lib/core/AutomationEngine';
import { nexusCore } from '@/lib/core/NexusCore';

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
  // Health endpoint is intended for container orchestration (K8s, Docker Compose).
  // In production, restrict access to internal networks only via firewall/reverse proxy.
  // Return only status code for unauthenticated requests to limit information disclosure.
  const isInternal = process.env.NODE_ENV === 'development' ||
    process.env.HEALTH_CHECK_PUBLIC === 'true';

  if (!isInternal) {
    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() }, { status: 200 });
  }

  const checks: HealthStatus['checks'] = {};
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Check Supabase
  try {
    const supabaseConfigured = isSupabaseConfigured();
    checks.supabase = {
      status: supabaseConfigured ? 'pass' : 'warn',
      message: supabaseConfigured ? 'Configured' : 'Not configured',
    };
    if (!supabaseConfigured) overallStatus = 'degraded';
  } catch (error) {
    checks.supabase = { status: 'fail', message: error instanceof Error ? error.message : 'Unknown error' };
    overallStatus = 'unhealthy';
  }

  // Check Puter KV storage
  try {
    const puterStart = Date.now();
    await Promise.race([
      kvGet('health_check'),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)),
    ]);
    checks.puter = { status: 'pass', latency: Date.now() - puterStart };
  } catch {
    checks.puter = { status: 'warn', message: 'Puter not available or timeout' };
    if (overallStatus === 'healthy') overallStatus = 'degraded';
  }

  // Check AI providers
  try {
    const providerStart = Date.now();
    const capabilities = await healthCheckAllProviders();
    const values = Object.values(capabilities);
    const onlineCount = values.filter((s): s is 'healthy' => s === 'healthy').length;
    const totalCount = Object.keys(capabilities).length;
    checks.aiProviders = {
      status: onlineCount > 0 ? 'pass' : 'warn',
      message: `${onlineCount}/${totalCount} providers online`,
      latency: Date.now() - providerStart,
    };
    if (onlineCount === 0) overallStatus = 'degraded';
  } catch (error) {
    checks.aiProviders = { status: 'warn', message: 'Provider check failed' };
  }

  // Check Automation Engine
  try {
    const autoState = automationEngine.getState();
    checks.automation = {
      status: autoState.isRunning ? 'pass' : 'warn',
      message: autoState.isRunning ? 'Running' : (autoState.pausedReason || 'Stopped'),
    };
  } catch {
    checks.automation = { status: 'warn', message: 'Automation engine not initialized' };
  }

  // Rate limiter stats
  checks.rateLimiter = { status: 'pass', ...getRateLimitStats() };

  // Memory usage
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const mem = process.memoryUsage();
    checks.memory = {
      status: mem.heapUsed / mem.heapTotal < 0.9 ? 'pass' : 'warn',
      message: `${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
    };
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
