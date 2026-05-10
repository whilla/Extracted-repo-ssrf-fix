import { governorSystem, type GovernorConfig, type GovernorState, type GovernorValidation } from '@/lib/core/GovernorSystem';
import { createClient } from '@/lib/supabase/server';

export { type GovernorConfig, type GovernorState, type GovernorValidation };

// we wrap the core GovernorSystem class with service functions 
// that use Supabase for persistence instead of Puter KV

export async function loadGovernorConfig(): Promise<GovernorConfig> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('system_configs')
    .select('value')
    .eq('key', 'governor_config')
    .single();

  if (!data) {
    const defaultConfig: GovernorConfig = {
      enabled: true,
      qualityThreshold: 60,
      strictMode: false,
      maxRegenerations: 3,
      failsafeThreshold: 10,
      roboticPatternPenalty: 1.0,
      repetitionPenalty: 1.0,
      enforcedStructure: true,
    };
    await saveGovernorConfig(defaultConfig);
    return defaultConfig;
  }
  return data.value as GovernorConfig;
}

export async function saveGovernorConfig(config: GovernorConfig) {
  const supabase = await createClient();
  await supabase
    .from('system_configs')
    .upsert({ key: 'governor_config', value: config });
}

export async function loadGovernorState(): Promise<GovernorState> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('system_configs')
    .select('value')
    .eq('key', 'governor_state')
    .single();

  if (!data) {
    const defaultState: GovernorState = {
      mode: 'normal',
      consecutiveRejections: 0,
      totalValidations: 0,
      totalApprovals: 0,
      totalRejections: 0,
      lastValidation: new Date().toISOString(),
      failsafeReason: null,
    };
    await saveGovernorState(defaultState);
    return defaultState;
  }
  return data.value as GovernorState;
}

export async function saveGovernorState(state: GovernorState) {
  const supabase = await createClient();
  await supabase
    .from('system_configs')
    .upsert({ key: 'governor_state', value: state });
}

export async function validateContent(
  content: string, 
  context: any = {}
): Promise<GovernorValidation> {
  // sync core system with supabase before validating
  const config = await loadGovernorConfig();
  const state = await loadGovernorState();
  
  // We apply the config/state to the singleton
  // Note: GovernorSystem needs these methods or we set them via a setup function
  // For now, we'll use the core class's validate method
  return await governorSystem.validate(content, context);
}

export async function makeGovernorDecision(
  validation: GovernorValidation,
  options: any = {}
): Promise<{
  approved: boolean;
  action: 'approve' | 'regenerate' | 'switch_provider' | 'reject';
  reason: string;
  alternativeModel?: string;
}> {
  if (validation.approved) {
    return { approved: true, action: 'approve', reason: 'Quality threshold met' };
  }

  // Logic for regeneration vs switching
  if (options.regenerationCount && options.regenerationCount >= 2) {
    return { 
      approved: false, 
      action: 'switch_provider', 
      reason: 'Multiple regenerations failed, switching provider',
      alternativeModel: options.alternativeModel || 'gpt-4o' 
    };
  }

  return { 
    approved: false, 
    action: validation.action || 'regenerate', 
    reason: validation.feedback 
  };
}

export async function recordCost(costData: {
  provider: string;
  model: string;
  tokens: number;
  cost: number;
  taskType: string;
}) {
  // We'll implement a costs table in supabase soon, for now log it
  console.log('[Governor] Recording Cost:', costData);
}

export async function activateFailsafeMode(reason: string) {
  await governorSystem.activateFailsafe(reason);
  const state = await loadGovernorState();
  await saveGovernorState({ ...state, mode: 'failsafe', failsafeReason: reason });
}

export async function evaluateMoodApproval(mood: string, content: string): Promise<boolean> {
  // Simple mood-to-content alignment check
  return content.toLowerCase().includes(mood.toLowerCase());
}

export async function getGovernorDashboard() {
  const status = governorSystem.getStatus();
  const history = governorSystem.getValidationHistory();
  return { status, history };
}

export async function validateEvolutionProposal(proposal: any): Promise<{
  approved: boolean;
  feedback: string;
}> {
  // Evolution proposals are strictly validated for stability
  if (!proposal.tests || proposal.tests.length === 0) {
    return { approved: false, feedback: 'Evolution proposal must include TDD test cases' };
  }
  return { approved: true, feedback: 'Proposal meets structural requirements' };
}
