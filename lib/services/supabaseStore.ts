/**
 * Supabase Persistence Layer
 * Migrates critical AI state from KV stores to structured Supabase tables.
 */

import type { OrchestrationPlan, AgentConfig } from '@/lib/services/multiAgentService';
import type { EvolutionProposal, AgentVersion } from './agentEvolutionService';

export class SupabaseStateStore {
  private client: any = null;

  private async getClient() {
    if (!this.client) {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase/client');
      this.client = getSupabaseBrowserClient();
    }
    if (!this.client) throw new Error('Supabase client not initialized');
    return this.client;
  }

  async initialize(): Promise<void> {

  // --- Orchestration Plans ---
  async savePlan(plan: OrchestrationPlan): Promise<void> {
    const client = this.getClient();
    const { data, error } = await client
      .from('orchestration_plans')
      .upsert({
        id: plan.id,
        user_request: plan.userRequest,
        subtasks: plan.subtasks,
        parallel_groups: plan.parallelGroups,
        aggregation_strategy: plan.aggregationStrategy,
        status: plan.status,
        final_output: plan.finalOutput,
        created_at: plan.createdAt,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(`Supabase Plan Save Error: ${error.message}`);
  }

  async getPlan(id: string): Promise<OrchestrationPlan | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from('orchestration_plans')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) return null;
    return {
      id: data.id,
      userRequest: data.user_request,
      subtasks: data.subtasks,
      parallelGroups: data.parallel_groups,
      aggregationStrategy: data.aggregation_strategy,
      status: data.status,
      finalOutput: data.final_output,
      createdAt: data.created_at,
    };
  }

  // --- Agent Evolution ---
  async saveEvolutionProposal(proposal: EvolutionProposal): Promise<void> {
    const client = this.getClient();
    const { error } = await client
      .from('evolution_proposals')
      .upsert({
        id: proposal.id,
        agent_id: proposal.agentId,
        proposal_type: proposal.proposalType,
        current_value: proposal.currentValue,
        proposed_value: proposal.proposedValue,
        reasoning: proposal.reasoning,
        expected_improvement: proposal.expectedImprovement,
        status: proposal.status,
        test_results: proposal.testResults,
        created_at: proposal.createdAt,
        resolved_at: proposal.resolvedAt,
      });
    if (error) throw new Error(`Supabase Evolution Save Error: ${error.message}`);
  }

  async loadEvolutionProposals(): Promise<EvolutionProposal[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from('evolution_proposals')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return [];
    return (data || []).map(row => ({
      id: row.id,
      agentId: row.agent_id,
      proposalType: row.proposal_type as any,
      currentValue: row.current_value,
      proposedValue: row.proposed_value,
      reasoning: row.reasoning,
      expectedImprovement: row.expected_improvement,
      status: row.status as any,
      testResults: row.test_results,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    }));
  }

  async saveAgentVersion(version: AgentVersion): Promise<void> {
    const client = this.getClient();
    const { error } = await client
      .from('agent_versions')
      .insert({
        version: version.version,
        agent_id: version.agentId,
        prompt_template: version.promptTemplate,
        scoring_weights: version.scoringWeights,
        performance_score: version.performanceScore,
        applied_at: version.appliedAt,
        changed_by: version.changedBy,
      });
    if (error) throw new Error(`Supabase Version Save Error: ${error.message}`);
  }

  async loadAgentVersions(agentId: string): Promise<AgentVersion[]> {
    const client = this.getClient();
    const { data, error } = await client
      .from('agent_versions')
      .select('*')
      .eq('agent_id', agentId)
      .order('version', { ascending: false })
      .limit(20);

    if (error) return [];
    return (data || []).map(row => ({
      version: row.version,
      agentId: row.agent_id,
      promptTemplate: row.prompt_template,
      scoringWeights: row.scoring_weights,
      performanceScore: row.performance_score,
      appliedAt: row.applied_at,
      changedBy: row.changed_by as any,
    }));
  }
}

export const stateStore = new SupabaseStateStore();
