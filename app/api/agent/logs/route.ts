export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { logService } from '@/lib/services/logService';

export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { agent_id, status, message, plan_id, step_id, metadata } = body;

      if (!agent_id || !status || !message) {
        return NextResponse.json({ error: 'Missing required fields (agent_id, status, message)' }, { status: 400 });
      }

      await logService.logEvent({
        agent_id,
        status,
        message,
        plan_id,
        step_id,
        metadata,
      });

      return NextResponse.json({ success: true });
    } catch (error: any) {
      console.error('[api/agent/logs] Error processing log:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  });
}
