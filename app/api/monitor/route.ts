/**
 * Agent Monitoring API
 * Provides real-time agent monitoring data
 */

import { NextResponse } from 'next/server';
import { getSystemOverview, getAgentActivities, getAgentMetrics, getAgentHealth, getAgentTimeline, exportAgentMonitorData, clearAgentMonitorData } from '@/lib/services/agentMonitorService';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'overview';
    const agentId = searchParams.get('agentId') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    let data;

    switch (type) {
      case 'overview':
        data = await getSystemOverview();
        break;

      case 'activities':
        data = await getAgentActivities();
        break;

      case 'metrics':
        data = await getAgentMetrics(agentId);
        break;

      case 'health':
        data = await getAgentHealth(agentId);
        break;

      case 'timeline':
        data = await getAgentTimeline(agentId, limit);
        break;

      case 'export':
        data = await exportAgentMonitorData();
        return NextResponse.json({ data, exportedAt: new Date().toISOString() });

      default:
        return NextResponse.json({ error: `Unknown monitoring type: ${type}` }, { status: 400 });
    }

    return NextResponse.json({ data, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[api/monitor] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Monitoring error' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await clearAgentMonitorData();
    return NextResponse.json({ success: true, message: 'Monitor data cleared' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Clear failed' },
      { status: 500 }
    );
  }
}