export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { intelligentChat, analyzeScheduling } from '@/lib/services/intelligentChatService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']).optional(),
    content: z.string().optional(),
    message: z.string().optional(),
  })).optional(),
  platform: z.string().optional(),
  taskType: z.string().optional(),
  customContext: z.string().optional(),
});

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  return withApiMiddleware(request, async () => {
    try {
      const result = ChatRequestSchema.safeParse(body);
      
      if (!result.success) {
        const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return jsonError(`Validation failed: ${errors}`, 400);
      }
      
      const { message, history, platform, taskType, customContext } = result.data;

      // Check if this is a scheduling request
      const isSchedulingRequest = 
        message.toLowerCase().includes('schedule') ||
        message.toLowerCase().includes('post at') ||
        message.toLowerCase().includes('when should') ||
        message.toLowerCase().includes('best time');

      if (isSchedulingRequest && platform) {
        // Extract content to schedule from message
        const content = message
          .replace(/schedule/i, '')
          .replace(/when should i post/i, '')
          .replace(/best time to post/i, '')
          .replace(/post at/i, '')
          .trim();

        if (content) {
          const scheduleAnalysis = await analyzeScheduling(content, [platform]);
          
          return NextResponse.json({
            response: `Based on your content and ${platform}'s best practices:\n\n${scheduleAnalysis.reasoning}\n\n**Recommended**: Post on ${platform} at ${scheduleAnalysis.suggestedTimes[platform] || 'your audience peak times'}`,
            reasoning: scheduleAnalysis.reasoning,
            suggestions: [
              `Confirm this schedule?`,
              `Adjust the time?`,
              `Schedule for multiple platforms?`,
            ],
            scheduling: scheduleAnalysis,
            brandUsed: true,
          });
        }
      }

      // Normal intelligent chat
      const chatHistory = Array.isArray(history) 
        ? history.map((h: any) => ({
            role: h.role || 'user',
            content: h.content || h.message || '',
          }))
        : [];

      const chatResult = await intelligentChat(message, chatHistory, {
        platform,
        taskType,
        customContext,
      });

      return NextResponse.json({
        response: chatResult.response,
        reasoning: chatResult.reasoning,
        suggestions: chatResult.suggestions,
        brandUsed: chatResult.brandUsed,
        context: chatResult.context,
      });

    } catch (error) {
      console.error('[AgentChat] Error:', error);
      return jsonError(error instanceof Error ? error.message : 'Chat failed.', 500);
    }
  });
}

export async function GET() {
  return NextResponse.json({
    status: 'ready',
    capabilities: [
      'Brand-aware responses',
      'Step-by-step reasoning',
      'Proactive suggestions',
      'Smart scheduling analysis',
      'Content optimization',
    ],
    brandContext: 'automatically loaded from brand_kit',
  });
}