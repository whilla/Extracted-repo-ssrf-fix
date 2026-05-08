import { createClient } from '@supabase/supabase-js';

export interface VectorMemoryItem {
  id?: string;
  agent_id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  created_at?: string;
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key);
}

export class vectorMemoryService {
  private static _supabase: ReturnType<typeof createClient> | null = null;

  private static get supabase() {
    if (!this._supabase) {
      this._supabase = getSupabaseClient();
    }
    return this._supabase;
  }

  /**
   * Generate a vector embedding for the given text using OpenAI
   */
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

  /**
   * Save a piece of information to the vector store
   */
  static async saveMemory(item: Omit<VectorMemoryItem, 'embedding'>) {
    const supabase = this.supabase;
    if (!supabase) {
      return true;
    }
    
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

  /**
   * Retrieve the most relevant memories for a given query
   */
  static async queryMemory(agent_id: string, query: string, limit = 5) {
    const supabase = this.supabase;
    if (!supabase) {
      return [];
    }

    const queryEmbedding = await this.generateEmbedding(query);

    // We call a Supabase RPC function 'match_agent_memories' 
    // which performs the cosine similarity search in pgvector
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

  /**
   * Wipe all vector memory for a specific agent
   */
  static async clearAgentMemory(agent_id: string) {
    const supabase = this.supabase;
    if (!supabase) {
      return true;
    }

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
