import { createClient } from '@supabase/supabase-js';

export interface PerformanceMetrics {
  views: number;
  likes: number;
  shares: number;
  comments: number;
  engagementRate: number;
}

export interface PerformanceInsight {
  id: string;
  insight: string;
  confidence: number;
  category: string;
  evidence_post_ids: string[];
}

export class performanceService {
  private static supabase: ReturnType<typeof createClient> | null = null;

  private static getSupabase() {
    if (!this.supabase) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!url || !key) {
        throw new Error('[performanceService] Missing required Supabase environment variables');
      }
      
      this.supabase = createClient(url, key);
    }
    return this.supabase;
  }

  static async updatePostMetrics(postId: string, platform: string, agentId: string, metrics: PerformanceMetrics) {
    const supabase = this.getSupabase();
    const { error } = await supabase
      .from('content_performance')
      .upsert({
        post_id: postId,
        platform: platform,
        agent_id: agentId,
        metrics: metrics,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'post_id, platform' });

    if (error) {
      console.error('[performanceService] Error updating metrics:', error);
      throw error;
    }

    return true;
  }

  static async getTopPerformingContent(agentId: string, limit = 5) {
    const supabase = this.getSupabase();
    const { data, error } = await supabase
      .from('content_performance')
      .select('*')
      .eq('agent_id', agentId)
      .order('metrics->>views', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[performanceService] Error fetching top content:', error);
      throw error;
    }

    return data;
  }

  static async synthesizeInsights(agentId: string) {
    const supabase = this.getSupabase();
    const topContent = await this.getTopPerformingContent(agentId, 10);
    const worstContent = await supabase
      .from('content_performance')
      .select('*')
      .eq('agent_id', agentId)
      .order('metrics->>views', { ascending: true })
      .limit(10);

    const prompt = `Analyze the following content performance data for an AI Agent.
    
    TOP PERFORMING:
    ${JSON.stringify(topContent)}
    
    LOW PERFORMING:
    ${JSON.stringify(worstContent.data)}
    
    Task: Identify 3-5 concrete "Lessons Learned" for future content generation.
    Focus on: Hook style, video length, topic appeal, and hashtags.
    
    Return strict JSON:
    [
      { "insight": "...", "confidence": 0.9, "category": "hook", "evidence_post_ids": ["..."] },
      ...
    ]`;

    try {
      const { universalChat } = await import('./aiService');
      const response = await universalChat(prompt, { model: 'gpt-4o' });
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];
      
      const insights: PerformanceInsight[] = JSON.parse(jsonMatch[0]);
      
      const { error } = await supabase
        .from('performance_insights')
        .insert(insights.map(i => ({ ...i, agent_id: agentId })));

      if (error) throw error;
      
      return insights;
    } catch (e) {
      console.error('[performanceService] Synthesis error:', e);
      return [];
    }
  }

  static async getActiveInsights(agentId: string, limit = 3) {
    const supabase = this.getSupabase();
    const { data, error } = await supabase
      .from('performance_insights')
      .select('*')
      .eq('agent_id', agentId)
      .order('confidence', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data as PerformanceInsight[];
  }
}