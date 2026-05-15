import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';

/**
 * Incoming Webhook Handler
 * Receives external webhooks to trigger NexusAI actions.
 * 
 * POST /api/webhooks/incoming
 * X-Webhook-Token: <shared-secret>
 * 
 * Body: { event: string, data: any }
 * 
 * Supported events:
 * - content.generate: Generate content from external trigger
 * - content.publish: Publish existing content
 * - system.activate: Activate automation
 * - crm.sync: Sync external CRM data
 */
export async function POST(request: NextRequest) {
  try {
    const webhookToken = request.headers.get('x-webhook-token');
    const expectedToken = process.env.WEBHOOK_SECRET_TOKEN;

    if (!expectedToken) {
      return NextResponse.json({ error: 'Webhook authentication not configured' }, { status: 503 });
    }

    if (!webhookToken || webhookToken !== expectedToken) {
      return NextResponse.json({ error: 'Invalid webhook token' }, { status: 401 });
    }

    const body = await request.json();
    const { event, data } = body;

    if (!event || typeof event !== 'string') {
      return NextResponse.json({ error: 'event field is required' }, { status: 400 });
    }

    logger.info('[WebhookIncoming] Received', { event });

    switch (event) {
      case 'content.generate': {
        const { prompt, platform = 'twitter', count = 1 } = data || {};
        if (!prompt) return NextResponse.json({ error: 'prompt is required for content.generate' }, { status: 400 });

        const { nexusCore } = await import('@/lib/core/NexusCore');
        const results = [];
        for (let i = 0; i < count; i++) {
          const result = await nexusCore.execute({
            userInput: prompt,
            taskType: 'content',
            platform,
            requireApproval: true,
          });
          results.push(result);
        }
        return NextResponse.json({ success: true, results });
      }

      case 'system.activate': {
        const { activateFullSystem } = await import('@/lib/services/systemActivation');
        const result = await activateFullSystem(data?.goal || 'Automated content generation');
        return NextResponse.json(result);
      }

      case 'crm.sync': {
        const { CRMService } = await import('@/lib/services/crmService');
        const customers = data?.customers || [];
        const imported = [];
        for (const c of customers) {
          if (c.email && c.name) {
            const result = await CRMService.createCustomer({ email: c.email, name: c.name, source: c.source || 'webhook' });
            if (result.success) imported.push(result.data);
          }
        }
        return NextResponse.json({ success: true, imported: imported.length });
      }

      case 'ping':
        return NextResponse.json({ success: true, message: 'pong', event });

      default:
        return NextResponse.json({ error: `Unknown event: ${event}` }, { status: 400 });
    }
  } catch (error) {
    logger.error('[WebhookIncoming] Error', error as any);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'NexusAI Incoming Webhooks',
    version: '1.0',
    events: ['content.generate', 'system.activate', 'crm.sync', 'ping'],
  });
}
