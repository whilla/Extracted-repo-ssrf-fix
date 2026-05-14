import { createClient } from '@supabase/supabase-js';

export interface Plan {
  id: string;
  agent_id: string;
  goal: string;
  description?: string;
  status: 'active' | 'completed' | 'paused' | 'archived';
  created_at?: string;
  updated_at?: string;
}

export interface PlanStep {
  id: string;
  plan_id: string;
  step_order: number;
  description: string;
  action_type?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  dependencies?: string[];
  result_summary?: string;
  updated_at?: string;
}

function getSupabaseClient(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key);
}

export class planService {
  private static _supabase: ReturnType<typeof createClient> | null = null;

  private static get supabase(): any {
    if (!this._supabase) {
      this._supabase = getSupabaseClient();
    }
    return this._supabase as any;
  }

  private static requireSupabase(method: string) {
    const supabase = this.supabase;
    if (!supabase) {
      throw new Error(`[planService.${method}] Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.`);
    }
    return supabase;
  }

  static async createPlan(agentId: string, goal: string, description: string, steps: Omit<PlanStep, 'id' | 'plan_id'>[]) {
    const supabase = this.requireSupabase('createPlan');

    const { data: plan, error: planError } = await (supabase as any)
      .from('autonomous_plans')
      .insert({ agent_id: agentId, goal, description })
      .select()
      .single();

    if (planError) {
      console.error('[planService] Error creating plan:', planError);
      throw planError;
    }

    const stepsWithPlanId = steps.map((step, index) => ({
      ...step,
      plan_id: (plan as any).id,
      step_order: index + 1,
    }));

    const { error: stepsError } = await (supabase as any)
      .from('plan_steps')
      .insert(stepsWithPlanId);

    if (stepsError) {
      console.error('[planService] Error creating steps:', stepsError);
      throw stepsError;
    }

    return { plan, steps: stepsWithPlanId };
  }

  static async getActivePlan(agentId: string) {
    const supabase = this.requireSupabase('getActivePlan');

    const { data: plan, error: planError } = await (supabase as any)
      .from('autonomous_plans')
      .select('*')
      .eq('agent_id', agentId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (planError) {
      if (planError.code === 'PGRST116') {
        return null;
      }
      console.error('[planService] Error fetching active plan:', planError);
      throw planError;
    }
    if (!plan) return null;

    const { data: steps, error: stepsError } = await (supabase as any)
      .from('plan_steps')
      .select('*')
      .eq('plan_id', (plan as any).id)
      .order('step_order', { ascending: true });

    if (stepsError) throw stepsError;

    return { ...(plan as any), steps: steps as PlanStep[] };
  }

  static async updateStepStatus(stepId: string, status: PlanStep['status'], result?: string) {
    const supabase = this.requireSupabase('updateStepStatus');

    const { error } = await (supabase as any)
      .from('plan_steps')
      .update({ 
        status, 
        result_summary: result,
        updated_at: new Date().toISOString() 
      })
      .eq('id', stepId);

    if (error) {
      console.error('[planService] Error updating step status:', error);
      throw error;
    }

    return true;
  }

  static async getNextStep(agentId: string) {
    const plan = await this.getActivePlan(agentId);
    if (!plan) return null;

    const pendingSteps = plan.steps.filter((s: PlanStep) => s.status === 'pending' || s.status === 'failed');
    
    for (const step of pendingSteps) {
      const deps = step.dependencies || [];
      const depsCompleted = deps.every((depId: string) => 
        plan.steps.find((s: PlanStep) => s.id === depId)?.status === 'completed'
      );
      
      if (depsCompleted) return step;
    }

    return null;
  }

  static async completePlan(planId: string) {
    const supabase = this.requireSupabase('completePlan');

    const { error } = await (supabase as any)
      .from('autonomous_plans')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', planId);

    if (error) throw error;
    return true;
  }
}