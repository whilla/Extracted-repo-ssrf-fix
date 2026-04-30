/**
 * Connection Diagnostics Service
 * Tests and monitors external service connections
 */

import { kvGet } from './puterService';
import { isPuterAvailable } from './puterService';
import { getWorkerHealthSummary } from './workerHeartbeatService';
import { getGenerationPerformanceSummary } from './generationTrackerService';
import { sanitizeApiKey } from './providerCredentialUtils';

export interface DiagnosticResult {
  service: string;
  status: 'healthy' | 'degraded' | 'offline' | 'unconfigured';
  latency?: number;
  message: string;
  lastChecked: string;
  details?: Record<string, unknown>;
}

export interface FullDiagnostics {
  timestamp: string;
  overallHealth: 'healthy' | 'degraded' | 'critical';
  services: DiagnosticResult[];
  recommendations: string[];
}

// Run diagnostics for a single service
async function diagnoseService(
  name: string,
  testFn: () => Promise<{ success: boolean; latency: number; details?: Record<string, unknown> }>
): Promise<DiagnosticResult> {
  const startTime = Date.now();
  
  try {
    const result = await testFn();
    return {
      service: name,
      status: result.success ? 'healthy' : 'degraded',
      latency: result.latency,
      message: result.success ? 'Connection successful' : 'Connection issues detected',
      lastChecked: new Date().toISOString(),
      details: result.details,
    };
  } catch (error) {
    return {
      service: name,
      status: 'offline',
      latency: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Connection failed',
      lastChecked: new Date().toISOString(),
    };
  }
}

// Test Puter.js connection
async function testPuter(): Promise<{ success: boolean; latency: number; details?: Record<string, unknown> }> {
  const start = Date.now();
  const available = isPuterAvailable();
  
  if (!available) {
    return { success: false, latency: Date.now() - start };
  }

  try {
    // Test auth
    const user = await window.puter.auth.getUser();
    const latency = Date.now() - start;
    
    return {
      success: !!user,
      latency,
      details: {
        username: user?.username,
        authenticated: !!user,
      },
    };
  } catch {
    return { success: false, latency: Date.now() - start };
  }
}

// Test Ayrshare connection
async function testAyrshare(): Promise<{ success: boolean; latency: number; details?: Record<string, unknown> }> {
  const start = Date.now();
  const apiKey = sanitizeApiKey(await kvGet('ayrshare_key'));
  
  if (!apiKey) {
    return { success: false, latency: 0, details: { configured: false } };
  }

  try {
    const response = await fetch('https://api.ayrshare.com/api/user', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    const latency = Date.now() - start;
    const data = await response.json();

    return {
      success: response.ok,
      latency,
      details: {
        configured: true,
        profiles: data.profiles?.length || 0,
        status: response.status,
      },
    };
  } catch (error) {
    return {
      success: false,
      latency: Date.now() - start,
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}

// Test Groq connection
async function testGroq(): Promise<{ success: boolean; latency: number; details?: Record<string, unknown> }> {
  const start = Date.now();
  const apiKey = sanitizeApiKey(await kvGet('groq_key'));
  
  if (!apiKey) {
    return { success: false, latency: 0, details: { configured: false } };
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    const latency = Date.now() - start;

    return {
      success: response.ok,
      latency,
      details: {
        configured: true,
        status: response.status,
      },
    };
  } catch (error) {
    return {
      success: false,
      latency: Date.now() - start,
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}

// Test OpenRouter connection
async function testOpenRouter(): Promise<{ success: boolean; latency: number; details?: Record<string, unknown> }> {
  const start = Date.now();
  const apiKey = sanitizeApiKey(await kvGet('openrouter_key'));
  
  if (!apiKey) {
    return { success: false, latency: 0, details: { configured: false } };
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    const latency = Date.now() - start;

    return {
      success: response.ok,
      latency,
      details: {
        configured: true,
        status: response.status,
      },
    };
  } catch (error) {
    return {
      success: false,
      latency: Date.now() - start,
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}

// Test Ollama local connection
async function testOllama(): Promise<{ success: boolean; latency: number; details?: Record<string, unknown> }> {
  const start = Date.now();
  const ollamaUrl = await kvGet('ollama_url') || 'http://localhost:11434';

  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    const latency = Date.now() - start;
    const data = await response.json();

    return {
      success: response.ok,
      latency,
      details: {
        configured: true,
        models: data.models?.length || 0,
        url: ollamaUrl,
      },
    };
  } catch (error) {
    return {
      success: false,
      latency: Date.now() - start,
      details: { 
        configured: true,
        url: ollamaUrl,
        error: 'Ollama server not running or not accessible',
      },
    };
  }
}

// Test ElevenLabs connection
async function testElevenLabs(): Promise<{ success: boolean; latency: number; details?: Record<string, unknown> }> {
  const start = Date.now();
  const apiKey = sanitizeApiKey(await kvGet('elevenlabs_key'));
  
  if (!apiKey) {
    return { success: false, latency: 0, details: { configured: false } };
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/user', {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
      },
      signal: AbortSignal.timeout(10000),
    });

    const latency = Date.now() - start;

    return {
      success: response.ok,
      latency,
      details: {
        configured: true,
        status: response.status,
      },
    };
  } catch (error) {
    return {
      success: false,
      latency: Date.now() - start,
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}

// Run full diagnostics
export async function runFullDiagnostics(): Promise<FullDiagnostics> {
  const services: DiagnosticResult[] = [];
  const recommendations: string[] = [];

  // Test all services
  const puterResult = await diagnoseService('Puter.js', testPuter);
  services.push(puterResult);
  if (puterResult.status !== 'healthy') {
    recommendations.push('Puter.js connection issues detected. Try refreshing the page or logging in again.');
  }

  const ayrshareResult = await diagnoseService('Ayrshare', testAyrshare);
  services.push(ayrshareResult);
  if (ayrshareResult.status === 'unconfigured' || !ayrshareResult.details?.configured) {
    services[services.length - 1].status = 'unconfigured';
    recommendations.push('Configure your Ayrshare API key in Settings to enable social media publishing.');
  } else if (ayrshareResult.status !== 'healthy') {
    recommendations.push('Ayrshare connection issues. Check your API key and try again.');
  }

  const groqResult = await diagnoseService('Groq', testGroq);
  services.push(groqResult);
  if (!groqResult.details?.configured) {
    services[services.length - 1].status = 'unconfigured';
  }

  const openRouterResult = await diagnoseService('OpenRouter', testOpenRouter);
  services.push(openRouterResult);
  if (!openRouterResult.details?.configured) {
    services[services.length - 1].status = 'unconfigured';
  }

  const ollamaResult = await diagnoseService('Ollama', testOllama);
  services.push(ollamaResult);
  if (ollamaResult.status === 'offline' && ollamaResult.details?.configured) {
    recommendations.push('Ollama server not detected. Start Ollama locally to use local models.');
  }

  const elevenLabsResult = await diagnoseService('ElevenLabs', testElevenLabs);
  services.push(elevenLabsResult);
  if (!elevenLabsResult.details?.configured) {
    services[services.length - 1].status = 'unconfigured';
  }

  const [uploadWorkerHealth, monitorWorkerHealth, performanceSummary] = await Promise.all([
    getWorkerHealthSummary('upload_worker'),
    getWorkerHealthSummary('monitor_retry'),
    getGenerationPerformanceSummary(200),
  ]);

  services.push({
    service: 'Upload Worker',
    status: uploadWorkerHealth.status,
    latency:
      typeof uploadWorkerHealth.details.lastDurationMs === 'number'
        ? uploadWorkerHealth.details.lastDurationMs
        : undefined,
    message: uploadWorkerHealth.message,
    lastChecked: new Date().toISOString(),
    details: uploadWorkerHealth.details,
  });

  services.push({
    service: 'Monitor & Retry',
    status: monitorWorkerHealth.status,
    latency:
      typeof monitorWorkerHealth.details.lastDurationMs === 'number'
        ? monitorWorkerHealth.details.lastDurationMs
        : undefined,
    message: monitorWorkerHealth.message,
    lastChecked: new Date().toISOString(),
    details: monitorWorkerHealth.details,
  });

  services.push({
    service: 'Generation Outcomes',
    status:
      performanceSummary.posted > 0
        ? performanceSummary.withPerformance > 0
          ? 'healthy'
          : 'degraded'
        : 'unconfigured',
    message:
      performanceSummary.posted > 0
        ? `Posted: ${performanceSummary.posted}, with analytics: ${performanceSummary.withPerformance}, avg engagement rate: ${performanceSummary.avgEngagementRate}%`
        : 'No posted generation outcomes yet.',
    lastChecked: new Date().toISOString(),
    details: performanceSummary,
  });

  if (uploadWorkerHealth.status !== 'healthy' || monitorWorkerHealth.status !== 'healthy') {
    recommendations.push('Background worker reliability needs attention. Check queue health and worker failures in Diagnostics.');
  }

  if (performanceSummary.posted > 0 && performanceSummary.withPerformance === 0) {
    recommendations.push('Engagement analytics are not syncing yet. Verify social analytics permissions and run engagement sync.');
  }

  // Calculate overall health
  const healthyCount = services.filter(s => s.status === 'healthy').length;
  const criticalServices = ['Puter.js'];
  const criticalHealthy = services
    .filter(s => criticalServices.includes(s.service))
    .every(s => s.status === 'healthy');

  let overallHealth: FullDiagnostics['overallHealth'];
  if (!criticalHealthy) {
    overallHealth = 'critical';
  } else if (healthyCount >= services.length * 0.7) {
    overallHealth = 'healthy';
  } else {
    overallHealth = 'degraded';
  }

  // Add general recommendations
  if (services.filter(s => s.status === 'unconfigured').length > 2) {
    recommendations.push('Configure additional AI providers in Settings for better reliability and model variety.');
  }

  return {
    timestamp: new Date().toISOString(),
    overallHealth,
    services,
    recommendations,
  };
}

// Quick health check (just critical services)
export async function quickHealthCheck(): Promise<{
  healthy: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  // Check Puter
  if (!isPuterAvailable()) {
    issues.push('Puter.js not available');
  }

  // Check if at least one AI provider is available
  const groqKey = sanitizeApiKey(await kvGet('groq_key'));
  const openrouterKey = sanitizeApiKey(await kvGet('openrouter_key'));
  const geminiKey = sanitizeApiKey(await kvGet('gemini_key'));
  const puterAvailable = isPuterAvailable();

  if (!puterAvailable && !groqKey && !openrouterKey && !geminiKey) {
    issues.push('No AI providers configured');
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}

// Get service status badge color
export function getStatusColor(status: DiagnosticResult['status']): string {
  switch (status) {
    case 'healthy':
      return 'bg-green-500';
    case 'degraded':
      return 'bg-yellow-500';
    case 'offline':
      return 'bg-red-500';
    case 'unconfigured':
      return 'bg-gray-500';
    default:
      return 'bg-gray-500';
  }
}
