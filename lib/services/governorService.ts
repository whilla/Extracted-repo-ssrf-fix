import { governorSystem, type GovernorConfig, type GovernorState, type GovernorValidation } from '@/lib/core/GovernorSystem';
import { getSupabaseAdminClient } from '@/lib/supabase/server';

export { type GovernorConfig, type GovernorState, type GovernorValidation };

export async function loadGovernorConfig(): Promise<GovernorConfig> {
  const supabase = await getSupabaseAdminClient();
  const { data } = await supabase
    .from('system_configs')
    .select('value')
    .eq('key', 'governor_config')
    .single();

  const row = data as { value?: GovernorConfig } | null;
  if (!row?.value) {
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
  return row.value;
}

export async function saveGovernorConfig(config: GovernorConfig) {
  const supabase = await getSupabaseAdminClient();
  await (supabase.from('system_configs') as any).upsert({ key: 'governor_config' as any, value: config as unknown as Record<string, unknown> });
}

export async function loadGovernorState(): Promise<GovernorState> {
  const supabase = await getSupabaseAdminClient();
  const { data } = await supabase
    .from('system_configs')
    .select('value')
    .eq('key', 'governor_state')
    .single();

  const row = data as { value?: GovernorState } | null;
  if (!row?.value) {
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
  return row.value;
}

export async function saveGovernorState(state: GovernorState) {
  const supabase = await getSupabaseAdminClient();
  await (supabase.from('system_configs') as any).upsert({ key: 'governor_state' as any, value: state as unknown as Record<string, unknown> });
}

export async function validateContent(
  content: string, 
  context: any = {}
): Promise<GovernorValidation> {
  const config = await loadGovernorConfig();
  const state = await loadGovernorState();
  
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
    action: (validation.action === 'regenerate' ? 'regenerate' : 'reject') as 'regenerate' | 'reject', 
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
  console.log('[Governor] Recording Cost:', costData);
}

export async function activateFailsafeMode(reason: string) {
  await governorSystem.activateFailsafe(reason);
  const state = await loadGovernorState();
  await saveGovernorState({ ...state, mode: 'failsafe', failsafeReason: reason });
}

import { MusicMood } from '@/lib/types';

export async function evaluateMoodApproval(content: string, requestedMood?: MusicMood): Promise<{ mood: { primary: string; tempo: string; energy: string; }; approved: boolean; reasons: string[] }> {
  const contentLower = content.toLowerCase();
  
  let primary = 'neutral';
  let tempo = 'medium';
  let energy = 'medium';
  const reasons: string[] = [];

  if (requestedMood) {
    primary = requestedMood.primary;
    tempo = requestedMood.tempo;
    energy = String(requestedMood.energy);

    const moodKeywords: Record<string, string[]> = {
      happy: ['joy', 'excited', 'happy', 'bright', 'cheerful', 'optimistic'],
      sad: ['melancholy', 'depressing', 'gloomy', 'tearful', 'lonely'],
      energetic: ['fast', 'hype', 'power', 'electric', 'dynamic', 'intense'],
      calm: ['peaceful', 'serene', 'quiet', 'soft', 'relaxed', 'ambient'],
      dramatic: ['tense', 'epic', 'climax', 'heavy', 'stormy', 'shocking'],
      mysterious: ['dark', 'secret', 'hidden', 'foggy', 'enigmatic', 'strange'],
      inspiring: ['hope', 'rise', 'strong', 'future', 'believe', 'dream'],
      nostalgic: ['old', 'memory', 'past', 'remember', 'vintage', 'longing'],
    };

    const requestedKeywords = moodKeywords[primary] || [];
    const matchedKeywords = requestedKeywords.filter(kw => contentLower.includes(kw));
    
    if (matchedKeywords.length === 0) {
      reasons.push(`Content lacks keywords associated with ${primary} mood.`);
    }

    const conflictMoods = Object.entries(moodKeywords).filter(([mood]) => mood !== primary);
    for (const [mood, kws] of conflictMoods) {
      if (kws.some(kw => contentLower.includes(kw))) {
        reasons.push(`Content contains keywords associated with ${mood} mood, which conflicts with ${primary}.`);
      }
    }
  }

  const approved = reasons.length === 0;
  return {
    mood: { primary, tempo, energy },
    approved,
    reasons,
  };
}

export async function getGovernorDashboard(): Promise<{
  config: GovernorConfig;
  state: GovernorState;
  systemHealth: string;
}> {
  const status = governorSystem.getStatus();
  const history = governorSystem.getValidationHistory();
  const config = await loadGovernorConfig();
  
  const consecutiveRejections = status.consecutiveRejections || 0;
  const approvalRate = status.totalValidations > 0 
    ? (status.totalValidations - consecutiveRejections) / status.totalValidations * 100 
    : 100;
  
  let systemHealth: string = 'healthy';
  if (consecutiveRejections > 5 || approvalRate < 50) {
    systemHealth = 'critical';
  } else if (consecutiveRejections > 2 || approvalRate < 70) {
    systemHealth = 'warning';
  }
  
  const state: GovernorState = {
    mode: status.mode as 'normal' | 'conservative' | 'failsafe',
    consecutiveRejections,
    totalValidations: status.totalValidations,
    totalApprovals: status.totalValidations - consecutiveRejections,
    totalRejections: consecutiveRejections,
    lastValidation: new Date().toISOString(),
    failsafeReason: consecutiveRejections >= config.failsafeThreshold ? 'High rejection rate' : null,
    currentMode: status.mode,
    rejectedToday: consecutiveRejections,
    approvedToday: status.totalValidations - consecutiveRejections,
  };
  
  return { config, state, systemHealth };
}

export async function validateEvolutionProposal(proposal: any): Promise<{
  approved: boolean;
  feedback: string;
}> {
  if (!proposal.tests || proposal.tests.length === 0) {
    return { approved: false, feedback: 'Evolution proposal must include TDD test cases' };
  }
  return { approved: true, feedback: 'Proposal meets structural requirements' };
}