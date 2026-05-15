import { logger } from '@/lib/utils/logger';
import { getSupabaseAdminClient } from '@/lib/supabase/server';

export interface CRMCustomer {
  id: string;
  email: string;
  name: string;
  source?: string;
  tags: string[];
  engagementHistory: {
    contentId: string;
    contentTitle: string;
    action: 'view' | 'like' | 'comment' | 'share' | 'click';
    timestamp: string;
  }[];
  lifecycleStage: 'lead' | 'prospect' | 'customer' | 'advocate';
  score: number;
  lastContact?: string;
  notes?: string;
}

export interface CRMResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CRMAggregate {
  totalContacts: number;
  byStage: Record<string, number>;
  avgScore: number;
  topSources: string[];
}

export interface CRMSegment {
  id: string;
  name: string;
  customerCount: number;
  engagementScore: number;
}

export class CRMService {
  private static getClient(): any {
    try {
      return getSupabaseAdminClient();
    } catch {
      return null;
    }
  }

  private static async fetchEngagementHistory(supabase: any, customerId: string): Promise<CRMCustomer['engagementHistory']> {
    try {
      const { data, error } = await supabase
        .from('crm_interactions')
        .select('content_id, content_title, action, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error || !data) return [];

      return data.map((interaction: any) => ({
        contentId: interaction.content_id,
        contentTitle: interaction.content_title,
        action: interaction.action,
        timestamp: interaction.created_at,
      }));
    } catch {
      return [];
    }
  }

  private static mapCustomerRow(c: any, engagementHistory: CRMCustomer['engagementHistory'] = []): CRMCustomer {
    return {
      id: c.id,
      email: c.email,
      name: c.name,
      source: c.source,
      tags: c.tags || [],
      engagementHistory,
      lifecycleStage: c.lifecycle_stage || 'lead',
      score: c.score || 0,
      lastContact: c.last_contact,
      notes: c.notes,
    };
  }

  static async createCustomer(data: {
    email: string;
    name: string;
    source?: string;
    tags?: string[];
    userId?: string;
  }): Promise<CRMResult<CRMCustomer>> {
    try {
      const supabase = this.getClient();
      const id = `cust_${Date.now()}`;

      const customer: CRMCustomer = {
        id,
        email: data.email,
        name: data.name,
        source: data.source,
        tags: data.tags || [],
        engagementHistory: [],
        lifecycleStage: 'lead',
        score: 0,
      };

      if (supabase) {
        const { error } = await supabase.from('crm_customers').insert({
          id,
          user_id: data.userId || null,
          email: data.email,
          name: data.name,
          source: data.source,
          tags: data.tags || [],
          lifecycle_stage: 'lead',
          score: 0,
        });
        if (error) throw error;
      }

      logger.info('[CRMService] Created customer', { id, email: data.email });
      return { success: true, data: customer };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async addEngagement(customerId: string, engagement: {
    contentId: string;
    contentTitle: string;
    action: 'view' | 'like' | 'comment' | 'share' | 'click';
  }): Promise<CRMResult<CRMCustomer>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
      }

      const { data: customer, error: fetchError } = await supabase
        .from('crm_customers')
        .select('*')
        .eq('id', customerId)
        .single();

      if (fetchError || !customer) {
        return { success: false, error: 'Customer not found' };
      }

      const actionScores: Record<string, number> = {
        view: 1, like: 2, comment: 5, share: 10, click: 3,
      };
      const newScore = (customer.score || 0) + (actionScores[engagement.action] || 0);

      let lifecycleStage = customer.lifecycle_stage || 'lead';
      if (newScore > 100) lifecycleStage = 'advocate';
      else if (newScore > 50) lifecycleStage = 'customer';
      else if (newScore > 20) lifecycleStage = 'prospect';

      await supabase.from('crm_interactions').insert({
        customer_id: customerId,
        content_id: engagement.contentId,
        content_title: engagement.contentTitle,
        action: engagement.action,
      });

      await supabase.from('crm_customers').update({
        score: newScore,
        lifecycle_stage: lifecycleStage,
        updated_at: new Date().toISOString(),
      }).eq('id', customerId);

      const engagementHistory = await this.fetchEngagementHistory(supabase, customerId);

      logger.info('[CRMService] Added engagement', { customerId, action: engagement.action });
      return { success: true, data: this.mapCustomerRow({
        ...customer,
        score: newScore,
        lifecycle_stage: lifecycleStage,
      }, engagementHistory) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getCustomer(customerId: string): Promise<CRMResult<CRMCustomer>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
      }

      const { data, error } = await supabase
        .from('crm_customers')
        .select('*')
        .eq('id', customerId)
        .single();

      if (error || !data) {
        return { success: false, error: 'Customer not found' };
      }

      const engagementHistory = await this.fetchEngagementHistory(supabase, customerId);

      return {
        success: true,
        data: this.mapCustomerRow(data, engagementHistory),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getAllCustomers(): Promise<CRMResult<CRMCustomer[]>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
      }

      const { data, error } = await supabase
        .from('crm_customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const customers = await Promise.all(
        (data || []).map(async (c: any) => {
          const engagementHistory = await this.fetchEngagementHistory(supabase, c.id);
          return this.mapCustomerRow(c, engagementHistory);
        })
      );

      return {
        success: true,
        data: customers,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getCustomersByStage(stage: CRMCustomer['lifecycleStage']): Promise<CRMResult<CRMCustomer[]>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
      }

      const { data, error } = await supabase
        .from('crm_customers')
        .select('*')
        .eq('lifecycle_stage', stage)
        .order('score', { ascending: false });

      if (error) throw error;

      const customers = await Promise.all(
        (data || []).map(async (c: any) => {
          const engagementHistory = await this.fetchEngagementHistory(supabase, c.id);
          return this.mapCustomerRow(c, engagementHistory);
        })
      );

      return {
        success: true,
        data: customers,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async updateCustomer(customerId: string, updates: Partial<CRMCustomer>): Promise<CRMResult<CRMCustomer>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
      }

      const dbUpdates: Record<string, any> = {};
      if (updates.email) dbUpdates.email = updates.email;
      if (updates.name) dbUpdates.name = updates.name;
      if (updates.source) dbUpdates.source = updates.source;
      if (updates.tags) dbUpdates.tags = updates.tags;
      if (updates.lifecycleStage) dbUpdates.lifecycle_stage = updates.lifecycleStage;
      if (updates.score !== undefined) dbUpdates.score = updates.score;
      if (updates.notes) dbUpdates.notes = updates.notes;
      if (updates.lastContact) dbUpdates.last_contact = updates.lastContact;
      dbUpdates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('crm_customers')
        .update(dbUpdates)
        .eq('id', customerId)
        .select()
        .single();

      if (error) throw error;

      const engagementHistory = await this.fetchEngagementHistory(supabase, customerId);

      return {
        success: true,
        data: this.mapCustomerRow(data, engagementHistory),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async addTag(customerId: string, tag: string): Promise<CRMResult<CRMCustomer>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
      }

      const { data: customer } = await supabase
        .from('crm_customers')
        .select('tags')
        .eq('id', customerId)
        .single();

      const currentTags = customer?.tags || [];
      if (currentTags.includes(tag)) {
        return { success: false, error: 'Tag already exists' };
      }

      const newTags = [...currentTags, tag];
      return this.updateCustomer(customerId, { tags: newTags } as any);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getAggregate(): Promise<CRMResult<CRMAggregate>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
      }

      const { data: customers, error } = await supabase
        .from('crm_customers')
        .select('*');

      if (error) throw error;

      const byStage: Record<string, number> = {};
      let totalScore = 0;
      const sources: string[] = [];

      (customers || []).forEach((c: any) => {
        const stage = c.lifecycle_stage || 'lead';
        byStage[stage] = (byStage[stage] || 0) + 1;
        totalScore += c.score || 0;
        if (c.source) sources.push(c.source);
      });

      const sourceCounts: Record<string, number> = {};
      sources.forEach((s: string) => { sourceCounts[s] = (sourceCounts[s] || 0) + 1; });
      const topSources = Object.entries(sourceCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([s]) => s);

      return {
        success: true,
        data: {
          totalContacts: (customers || []).length,
          byStage,
          avgScore: customers?.length ? totalScore / customers.length : 0,
          topSources,
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getHighValueCustomers(limit: number = 10): Promise<CRMResult<CRMCustomer[]>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
      }

      const { data, error } = await supabase
        .from('crm_customers')
        .select('*')
        .order('score', { ascending: false })
        .limit(limit);

      if (error) throw error;

      const customers = await Promise.all(
        (data || []).map(async (c: any) => {
          const engagementHistory = await this.fetchEngagementHistory(supabase, c.id);
          return this.mapCustomerRow(c, engagementHistory);
        })
      );

      return {
        success: true,
        data: customers,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async searchCustomers(query: string): Promise<CRMResult<CRMCustomer[]>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
      }

      const q = `%${query.toLowerCase()}%`;
      const { data, error } = await supabase
        .from('crm_customers')
        .select('*')
        .or(`email.ilike.${q},name.ilike.${q}`)
        .order('score', { ascending: false });

      if (error) throw error;

      const customers = await Promise.all(
        (data || []).map(async (c: any) => {
          const engagementHistory = await this.fetchEngagementHistory(supabase, c.id);
          return this.mapCustomerRow(c, engagementHistory);
        })
      );

      return {
        success: true,
        data: customers,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async createSegment(name: string, criteria?: { tag?: string; engagementScore?: number }): Promise<CRMResult<{ id: string; name: string }>> {
    try {
      const supabase = this.getClient();
      const id = `seg_${Date.now()}`;

      if (supabase) {
        const { error } = await supabase.from('crm_segments').insert({
          id,
          name,
          customer_count: 0,
          engagement_score: criteria?.engagementScore || 0,
        });
        if (error) throw error;
      }

      logger.info('[CRMService] Created segment', { id, name });
      return { success: true, data: { id, name } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getAllSegments(): Promise<CRMResult<CRMSegment[]>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
      }

      const { data, error } = await supabase
        .from('crm_segments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return {
        success: true,
        data: (data || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          customerCount: s.customer_count || 0,
          engagementScore: s.engagement_score || 0,
        })),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async updateSegment(segmentId: string, updates: { name?: string; criteria?: any }): Promise<CRMResult<{ id: string; name: string }>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
      }

      const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (updates.name) dbUpdates.name = updates.name;
      if (updates.criteria?.engagementScore !== undefined) dbUpdates.engagement_score = updates.criteria.engagementScore;

      const { data, error } = await supabase
        .from('crm_segments')
        .update(dbUpdates)
        .eq('id', segmentId)
        .select()
        .single();

      if (error) throw error;

      logger.info('[CRMService] Updated segment', { segmentId });
      return { success: true, data: { id: segmentId, name: updates.name || data?.name || 'Updated' } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async trackInteraction(interaction: {
    customerId?: string;
    email?: string;
    contentId: string;
    contentTitle: string;
    action: 'view' | 'like' | 'comment' | 'share' | 'click';
  }): Promise<CRMResult<any>> {
    if (interaction.customerId) {
      return this.addEngagement(interaction.customerId, {
        contentId: interaction.contentId,
        contentTitle: interaction.contentTitle,
        action: interaction.action,
      });
    }

    if (interaction.email) {
      const supabase = this.getClient();
      if (supabase) {
        const { data: customer } = await supabase
          .from('crm_customers')
          .select('id')
          .eq('email', interaction.email)
          .single();

        if (customer) {
          return this.addEngagement(customer.id, {
            contentId: interaction.contentId,
            contentTitle: interaction.contentTitle,
            action: interaction.action,
          });
        }
      }
    }

    return { success: false, error: 'customerId or email required to track interaction' };
  }

  static async getSegmentsByCustomer(customerId: string): Promise<CRMResult<{ id: string; name: string; matchScore: number }[]>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
      }

      const { data: customer } = await supabase
        .from('crm_customers')
        .select('score')
        .eq('id', customerId)
        .single();

      if (!customer) {
        return { success: false, error: 'Customer not found' };
      }

      const { data: segments } = await supabase
        .from('crm_segments')
        .select('*');

      const matchingSegments = (segments || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        matchScore: (s.engagement_score || 0) + ((customer.score || 0) / 100),
      })).sort((a: any, b: any) => b.matchScore - a.matchScore);

      return { success: true, data: matchingSegments };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
