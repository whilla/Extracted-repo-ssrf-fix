/**
 * Agent Event Tracking API
 * Allows clients to track agent events for monitoring
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  startAgentActivity,
  updateAgentActivity,
  completeAgentActivity,
  updateAgentMetrics,
  updateAgentHealth,
  type AgentActivityStatus,
  type AgentHealthStatus,
} from '@/lib/services/agentMonitorService';

export const dynamic = 'force-dynamic';

import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

const VALID_ACTIONS = [
  'start',
  'update',
  'complete',
  'metrics',
  'health',
  'heartbeat',
] as const;

type ValidAction = typeof VALID_ACTIONS[number];

async function handleStart(body: {
  agentId: string;
  agentName: string;
  role: string;
  task: string;
  metadata?: Record<string, unknown>;
}) {
  const { agentId, agentName, role, task, metadata } = body;
  
  if (!agentId || !agentName || !role || !task) {
    return NextResponse.json(
      { error: 'Missing required fields: agentId, agentName, role, task' },
      { status: 400 }
    );
  }

  await startAgentActivity(agentId, agentName, role, task, metadata);
  return NextResponse.json({ success: true, message: 'Activity started' });
}

async function handleUpdate(body: {
  agentId: string;
  progress: number;
  status?: AgentActivityStatus;
  currentTask?: string;
  metadata?: Record<string, unknown>;
}) {
  const { agentId, progress, status, currentTask, metadata } = body;
  
  if (!agentId || typeof progress !== 'number') {
    return NextResponse.json(
      { error: 'Missing required fields: agentId, progress' },
      { status: 400 }
    );
  }

  await updateAgentActivity(agentId, progress, status, currentTask, metadata);
  return NextResponse.json({ success: true, message: 'Activity updated' });
}

async function handleComplete(body: {
  agentId: string;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}) {
  const { agentId, success, error, metadata } = body;
  
  if (!agentId || typeof success !== 'boolean') {
    return NextResponse.json(
      { error: 'Missing required fields: agentId, success' },
      { status: 400 }
    );
  }

  await completeAgentActivity(agentId, { success, error, metadata });
  return NextResponse.json({ success: true, message: 'Activity completed' });
}

async function handleMetrics(body: {
  agentId: string;
  completed?: number;
  failed?: number;
  duration?: number;
  tokens?: number;
  cost?: number;
}) {
  const { agentId, completed, failed, duration, tokens, cost } = body;
  
  if (!agentId) {
    return NextResponse.json(
      { error: 'Missing required field: agentId' },
      { status: 400 }
    );
  }

  await updateAgentMetrics(agentId, { completed, failed, duration, tokens, cost });
  return NextResponse.json({ success: true, message: 'Metrics updated' });
}

async function handleHealth(body: {
  agentId: string;
  status: AgentHealthStatus;
  errorCount?: number;
  memoryUsage?: number;
}) {
  const { agentId, status, errorCount, memoryUsage } = body;
  
  if (!agentId || !status) {
    return NextResponse.json(
      { error: 'Missing required fields: agentId, status' },
      { status: 400 }
    );
  }

  await updateAgentHealth(agentId, status, errorCount, memoryUsage);
  return NextResponse.json({ success: true, message: 'Health updated' });
}

async function handleHeartbeat(body: { agentId: string }) {
  const { agentId } = body;
  
  if (!agentId) {
    return NextResponse.json(
      { error: 'Missing required field: agentId' },
      { status: 400 }
    );
  }

  await updateAgentHealth(agentId, 'healthy');
  return NextResponse.json({ success: true, message: 'Heartbeat recorded' });
}

export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const action = body.action as ValidAction;

    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    switch (action) {
      case 'start':
        return handleStart(body as Parameters<typeof handleStart>[0]);
      case 'update':
        return handleUpdate(body as Parameters<typeof handleUpdate>[0]);
      case 'complete':
        return handleComplete(body as Parameters<typeof handleComplete>[0]);
      case 'metrics':
        return handleMetrics(body as Parameters<typeof handleMetrics>[0]);
      case 'health':
        return handleHealth(body as Parameters<typeof handleHealth>[0]);
      case 'heartbeat':
        return handleHeartbeat(body as Parameters<typeof handleHeartbeat>[0]);
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  });
}