export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { aiService } from '@/lib/services/aiService';

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseClient();
    const { agent_id } = await request.json();

    if (!agent_id) {
      return NextResponse.json({ error: 'Missing agent_id' }, { status: 400 });
    }

    // 1. Fetch performance data for the agent
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

    // 2. Synthesize data for the AI
    const performanceSummary = performance.map(p => 
      `Post ID: ${p.post_id}, Platform: ${p.platform}, Metrics: ${JSON.stringify(p.metrics)}`
    ).join('\n');

    const reflectionPrompt = `
      You are a Social Media Strategist. Analyze the following performance data for an AI agent.
      
      Performance Data:
      ${performanceSummary}
      
      Task:
      1. Identify the top 3 most successful patterns (hooks, topics, or formats).
      2. Identify the top 3 least successful patterns.
      3. Provide 3 concrete "Lessons Learned" as actionable guidelines for future content generation.
      
      Format your response as a structured set of guidelines.
    `;

    // 3. Generate insights using the AI
    const insights = await aiService.chat(reflectionPrompt);

    // 4. Store the reflection in the agent's vector memory
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
}
