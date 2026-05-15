export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { aiService } from '@/lib/services/aiService';

async function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const supabase = await getSupabaseClient();
      const { agent_id } = await request.json();

      if (!agent_id) {
        return NextResponse.json({ error: 'Missing agent_id' }, { status: 400 });
      }

      if (!supabase) {
        return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
      }

      const { data: performance, error: perfError } = await supabase
        .from('content_performance')
        .select('*')
        .eq('agent_id', agent_id)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (perfError) throw perfError;

      if (!performance || performance.length === 0) {
        return NextResponse.json({ 
          success: true, 
          message: 'No performance data available for reflection yet.' 
        });
      }

      const performanceSummary = performance.map((p: { post_id: string; platform: string; metrics: Record<string, unknown> }) => 
        `Post ID: ${p.post_id}, Platform: ${p.platform}, Metrics: ${JSON.stringify(p.metrics)}`
      ).join('\n');

      const reflectionPrompt = `
        You are a senior social media strategist analyzing performance data.

        Performance Data:
        ${performanceSummary}

        Provide:
        1. Top 3 successful patterns (specific hooks, topics, or formats that worked).
        2. Top 3 failed patterns (what underperformed and why).
        3. Three concrete "Lessons Learned" as actionable guidelines for future content.

        Be specific. Reference actual metrics. No generic advice like "post more consistently".
      `;

      const insights = await aiService.chat(reflectionPrompt);

      const { error: memoryError } = await supabase
        .from('agent_vector_memory')
        .insert({
          agent_id,
          content: `[REFLECTION - ${new Date().toISOString()}]\n${insights}`,
          metadata: { type: 'performance_reflection', priority: 'high' },
        });

      if (memoryError) throw memoryError;

      return NextResponse.json({ 
        success: true, 
        insights,
        message: 'Agent reflection completed and stored in memory.' 
      });

    } catch (error: any) {
      console.error('[api/agent/reflect] Reflection error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  });
}
