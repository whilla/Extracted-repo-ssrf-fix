import { createClient } from '@supabase/supabase-js';

export interface VectorMemoryItem {
  id?: string;
  agent_id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  created_at?: string;
}

export class vectorMemoryService {
  private static supabaseClient: ReturnType<typeof createClient> | null = null;

  private static getSupabase() {
    if (!this.supabaseClient) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!url || !key) {
        throw new Error('[vectorMemoryService] Missing required Supabase environment variables');
      }
      
      this.supabaseClient = createClient(url, key);
    }
    return this.supabaseClient;
  }

  private static async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-small',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate embedding: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  static async saveMemory(item: Omit<VectorMemoryItem, 'embedding'>) {
    const supabase = this.getSupabase();
    const embedding = await this.generateEmbedding(item.content);
    
    const { error } = await supabase
      .from('agent_vector_memory')
      .insert({
        ...item,
        embedding,
      });

    if (error) {
      console.error('[vectorMemoryService] Error saving memory:', error);
      throw error;
    }

    return true;
  }

  static async queryMemory(agent_id: string, query: string, limit = 5) {
    const supabase = this.getSupabase();
    const queryEmbedding = await this.generateEmbedding(query);

    const { data, error } = await supabase.rpc('match_agent_memories', {
      query_embedding: queryEmbedding,
      filter_agent_id: agent_id,
      match_threshold: 0.7,
      match_count: limit,
    });

    if (error) {
      console.error('[vectorMemoryService] Error querying memory:', error);
      throw error;
    }

    return data as VectorMemoryItem[];
  }

  static async clearAgentMemory(agent_id: string) {
    const supabase = this.getSupabase();
    const { error } = await supabase
      .from('agent_vector_memory')
      .delete()
      .eq('agent_id', agent_id);

    if (error) {
      console.error('[vectorMemoryService] Error clearing memory:', error);
      throw error;
    }

    return true;
  }
}