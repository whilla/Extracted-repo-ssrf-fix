// Governor Service - System Supervisor
// Oversees ALL operations, ensures quality, controls costs, and maintains stability

import { kvDelete, kvGet, kvSet } from './puterService';
import { loadBrandKit } from './memoryService';
import { loadAgents, type AgentOutput } from './multiAgentService';
import { loadEvolutionProposals } from './agentEvolutionService';

// Governor Types
export interface GovernorConfig {
  enabled: boolean;
  qualityThreshold: number; // 0-100, outputs below this are rejected
  costLimitDaily: number; // Maximum daily cost in cents
  costLimitMonthly: number;
  maxAutopilotSpeed: number; // Max posts per hour in autopilot
  maxAgentSpawns: number; // Max hybrid agents
  memoryAgingDays: number; // Days before memory is considered low-value
  failsafeMode: boolean;
  lastUpdated: string;
}

export interface GovernorState {
  isActive: boolean;
  currentMode: 'normal' | 'conservative' | 'failsafe';
  dailyCost: number;
  monthlyCost: number;
  rejectedToday: number;
  approvedToday: number;
  autopilotActive: boolean;
  lastCheck: string;
}

export interface ContentValidation {
  isValid: boolean;
  score: number;
  issues: ValidationIssue[];
  suggestions: string[];
  governorApproved: boolean;
  rejectionReason?: string;
}

export interface ValidationIssue {
  type: 'quality' | 'brand' | 'safety' | 'repetitive' | 'generic' | 'cost';
  severity: 'warning' | 'error' | 'critical';
  message: string;
  location?: string;
}

export interface CostRecord {
  timestamp: string;
  provider: string;
  model: string;
  tokens: number;
  cost: number;
  taskType: string;
}

export interface GovernorDecision {
  approved: boolean;
  action: 'approve' | 'reject' | 'regenerate' | 'downgrade' | 'switch_provider';
  reason: string;
  alternativeModel?: string;
  suggestions?: string[];
}

// Storage Keys
const GOVERNOR_CONFIG_KEY = 'nexus_governor_config';
const GOVERNOR_STATE_KEY = 'nexus_governor_state';
const COST_RECORDS_KEY = 'nexus_cost_records';
const REJECTED_CONTENT_KEY = 'nexus_rejected_content';

// Default configuration
const DEFAULT_CONFIG: GovernorConfig = {
  enabled: true,
  qualityThreshold: 65,
  costLimitDaily: 500, // $5.00
  costLimitMonthly: 5000, // $50.00
  maxAutopilotSpeed: 4, // 4 posts per hour max
  maxAgentSpawns: 5,
  memoryAgingDays: 30,
  failsafeMode: false,
  lastUpdated: new Date().toISOString(),
};

// Load governor config
export async function loadGovernorConfig(): Promise<GovernorConfig> {
  try {
    const data = await kvGet(GOVERNOR_CONFIG_KEY);
    return data ? { ...DEFAULT_CONFIG, ...JSON.parse(data) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

// Save governor config
export async function saveGovernorConfig(config: Partial<GovernorConfig>): Promise<void> {
  const current = await loadGovernorConfig();
  const updated = { ...current, ...config, lastUpdated: new Date().toISOString() };
  await kvSet(GOVERNOR_CONFIG_KEY, JSON.stringify(updated));
}

// Load governor state
export async function loadGovernorState(): Promise<GovernorState> {
  try {
    const data = await kvGet(GOVERNOR_STATE_KEY);
    if (data) {
      const state = JSON.parse(data);
      // Reset daily counters if new day
      const lastCheck = new Date(state.lastCheck);
      const now = new Date();
      if (lastCheck.getDate() !== now.getDate()) {
        state.dailyCost = 0;
        state.rejectedToday = 0;
        state.approvedToday = 0;
      }
      return state;
    }
  } catch {
    // Return default
  }
  
  return {
    isActive: true,
    currentMode: 'normal',
    dailyCost: 0,
    monthlyCost: 0,
    rejectedToday: 0,
    approvedToday: 0,
    autopilotActive: false,
    lastCheck: new Date().toISOString(),
  };
}

// Save governor state
async function saveGovernorState(state: GovernorState): Promise<void> {
  state.lastCheck = new Date().toISOString();
  await kvSet(GOVERNOR_STATE_KEY, JSON.stringify(state));
}

// Load cost records
export async function loadCostRecords(): Promise<CostRecord[]> {
  try {
    const data = await kvGet(COST_RECORDS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

async function loadRejectedContent(): Promise<Array<{ timestamp: string } & Record<string, unknown>>> {
  try {
    const data = await kvGet(REJECTED_CONTENT_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// Record cost
export async function recordCost(record: Omit<CostRecord, 'timestamp'>): Promise<void> {
  const records = await loadCostRecords();
  const state = await loadGovernorState();
  
  const newRecord: CostRecord = {
    ...record,
    timestamp: new Date().toISOString(),
  };
  
  records.push(newRecord);
  
  // Keep last 1000 records
  const trimmed = records.slice(-1000);
  await kvSet(COST_RECORDS_KEY, JSON.stringify(trimmed));
  
  // Update state
  state.dailyCost += record.cost;
  state.monthlyCost += record.cost;
  await saveGovernorState(state);
}

// Generic content patterns to reject
const GENERIC_PATTERNS = [
  /^(hey|hi|hello) (everyone|guys|friends)/i,
  /^(just|simply) (wanted|want) to (say|share|let you know)/i,
  /^(i('m| am)) (so )?excited to (announce|share)/i,
  /^(check out|check this out)/i,
  /^\d+\s*(tips|ways|reasons|steps|tricks)/i, // "5 tips..." is overused
  /^(did you know|here's a secret)/i,
  /^(attention|breaking|urgent):/i,
  /^(🔥|💯|🚀|✨)\s*(new|big|huge|exciting)/i,
];

// Robotic patterns to reject
const ROBOTIC_PATTERNS = [
  /\bin conclusion\b/i,
  /\bfurthermore\b/i,
  /\badditionally\b/i,
  /\bmoreover\b/i,
  /\bsynergy\b/i,
  /\bleverage\b/i,
  /\boptimize\b/i,
  /\bstreamline\b/i,
  /\bparadigm\b/i,
  /\bholistic\b/i,
];

// Validate content quality
export async function validateContent(
  content: string,
  context: {
    platform?: string;
    agentOutput?: AgentOutput;
    isRegeneration?: boolean;
  } = {}
): Promise<ContentValidation> {
  const config = await loadGovernorConfig();
  const state = await loadGovernorState();
  const brandKit = await loadBrandKit();
  
  const issues: ValidationIssue[] = [];
  const suggestions: string[] = [];
  let score = 100;
  
  // Skip validation if governor is disabled
  if (!config.enabled) {
    return {
      isValid: true,
      score: 100,
      issues: [],
      suggestions: [],
      governorApproved: true,
    };
  }
  
  // 1. Check for empty or too short content
  if (!content || content.trim().length < 20) {
    issues.push({
      type: 'quality',
      severity: 'critical',
      message: 'Content is too short or empty',
    });
    score -= 50;
  }
  
  // 2. Check for generic patterns
  for (const pattern of GENERIC_PATTERNS) {
    if (pattern.test(content)) {
      issues.push({
        type: 'generic',
        severity: 'error',
        message: `Content starts with generic pattern: "${content.match(pattern)?.[0]}"`,
      });
      score -= 15;
      suggestions.push('Use a more unique and attention-grabbing opening');
      break; // Only count once
    }
  }
  
  // 3. Check for robotic language
  let roboticCount = 0;
  for (const pattern of ROBOTIC_PATTERNS) {
    if (pattern.test(content)) {
      roboticCount++;
    }
  }
  if (roboticCount >= 2) {
    issues.push({
      type: 'generic',
      severity: 'error',
      message: `Content contains ${roboticCount} robotic/corporate phrases`,
    });
    score -= 10 * roboticCount;
    suggestions.push('Replace corporate jargon with conversational language');
  }
  
  // 4. Check for repetitive patterns
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const uniqueSentences = new Set(sentences.map(s => s.toLowerCase().trim()));
  if (sentences.length > 3 && uniqueSentences.size < sentences.length * 0.7) {
    issues.push({
      type: 'repetitive',
      severity: 'warning',
      message: 'Content contains repetitive sentences',
    });
    score -= 10;
    suggestions.push('Vary sentence structure and content');
  }
  
  // 5. Check brand alignment
  if (brandKit) {
    // Check tone alignment
    const toneKeywords: Record<string, string[]> = {
      professional: ['expert', 'professional', 'industry', 'solution', 'strategic'],
      casual: ['hey', 'awesome', 'cool', 'love', 'amazing'],
      friendly: ['we', 'together', 'community', 'share', 'help'],
      authoritative: ['proven', 'research', 'data', 'expert', 'leading'],
      humorous: ['lol', 'haha', '😂', 'joke', 'funny'],
    };
    
    const toneWords = toneKeywords[brandKit.tone] || [];
    const hasToneAlignment = toneWords.some(word => 
      content.toLowerCase().includes(word)
    );
    
    if (!hasToneAlignment && toneWords.length > 0) {
      issues.push({
        type: 'brand',
        severity: 'warning',
        message: `Content may not match brand tone: ${brandKit.tone}`,
      });
      score -= 10;
      suggestions.push(`Add language that reflects ${brandKit.tone} tone`);
    }
    
    // Check for avoided topics
    for (const topic of brandKit.avoidTopics) {
      if (content.toLowerCase().includes(topic.toLowerCase())) {
        issues.push({
          type: 'brand',
          severity: 'critical',
          message: `Content mentions avoided topic: "${topic}"`,
        });
        score -= 30;
      }
    }
  }
  
  // 6. Check emotional impact
  const emotionalIndicators = [
    /\!{2,}/g, // Multiple exclamation marks
    /\?{2,}/g, // Multiple question marks
    /\b(amazing|incredible|unbelievable|shocking|surprising|secret|exclusive|limited)\b/gi,
    /\b(you|your|you're|yourself)\b/gi, // Direct address
  ];
  
  let emotionalScore = 0;
  for (const indicator of emotionalIndicators) {
    const matches = content.match(indicator);
    if (matches) emotionalScore += matches.length;
  }
  
  if (emotionalScore < 2) {
    issues.push({
      type: 'quality',
      severity: 'warning',
      message: 'Content has low emotional impact',
    });
    score -= 5;
    suggestions.push('Add emotional triggers or direct reader engagement');
  }
  
  // 7. Platform-specific checks
  if (context.platform) {
    const platformLimits: Record<string, number> = {
      twitter: 280,
      instagram: 2200,
      linkedin: 3000,
      threads: 500,
      tiktok: 2200,
    };
    
    const limit = platformLimits[context.platform.toLowerCase()];
    if (limit && content.length > limit) {
      issues.push({
        type: 'quality',
        severity: 'error',
        message: `Content exceeds ${context.platform} character limit (${content.length}/${limit})`,
      });
      score -= 20;
    }
  }
  
  // 8. Failsafe mode - stricter validation
  if (config.failsafeMode || state.currentMode === 'failsafe') {
    score -= 10; // Apply penalty in failsafe mode
    if (score < config.qualityThreshold + 10) {
      issues.push({
        type: 'safety',
        severity: 'warning',
        message: 'Failsafe mode active - stricter validation applied',
      });
    }
  }
  
  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, score));
  
  // Determine if approved
  const isValid = issues.filter(i => i.severity === 'critical').length === 0;
  const governorApproved = isValid && score >= config.qualityThreshold;
  
  // Update state
  if (governorApproved) {
    state.approvedToday++;
  } else {
    state.rejectedToday++;
  }
  await saveGovernorState(state);
  
  return {
    isValid,
    score,
    issues,
    suggestions,
    governorApproved,
    rejectionReason: governorApproved 
      ? undefined 
      : issues.find(i => i.severity === 'critical')?.message || 
        `Quality score (${score}) below threshold (${config.qualityThreshold})`,
  };
}

// Make governor decision
export async function makeGovernorDecision(
  validation: ContentValidation,
  context: {
    currentProvider?: string;
    currentModel?: string;
    regenerationCount?: number;
  } = {}
): Promise<GovernorDecision> {
  const config = await loadGovernorConfig();
  const state = await loadGovernorState();
  
  // Check cost limits
  if (state.dailyCost >= config.costLimitDaily) {
    return {
      approved: false,
      action: 'reject',
      reason: 'Daily cost limit exceeded',
      suggestions: ['Wait for daily limit reset or increase budget in settings'],
    };
  }
  
  // If approved, just return
  if (validation.governorApproved) {
    return {
      approved: true,
      action: 'approve',
      reason: `Content passed validation with score ${validation.score}`,
    };
  }
  
  // If regeneration count is high, try downgrading
  const regenerationCount = context.regenerationCount || 0;
  if (regenerationCount >= 3) {
    // Try switching to a cheaper model
    const modelDowngrades: Record<string, string> = {
      'gpt-4o': 'gpt-4o-mini',
      'claude-3-opus': 'claude-3-sonnet',
      'gemini-pro': 'gemini-flash',
    };
    
    const currentModel = context.currentModel || 'gpt-4o';
    const downgradeModel = modelDowngrades[currentModel];
    
    if (downgradeModel) {
      return {
        approved: false,
        action: 'downgrade',
        reason: 'Multiple regeneration failures, trying cheaper model',
        alternativeModel: downgradeModel,
      };
    }
  }
  
  // Try regeneration if score is close to threshold
  if (validation.score >= config.qualityThreshold - 15) {
    return {
      approved: false,
      action: 'regenerate',
      reason: `Score ${validation.score} is close to threshold, attempting regeneration`,
      suggestions: validation.suggestions,
    };
  }
  
  // Final rejection
  return {
    approved: false,
    action: 'reject',
    reason: validation.rejectionReason || 'Content did not meet quality standards',
    suggestions: validation.suggestions,
  };
}

// Control autopilot
export async function setAutopilotState(active: boolean): Promise<void> {
  const state = await loadGovernorState();
  state.autopilotActive = active;
  await saveGovernorState(state);
}

// Check if autopilot can proceed
export async function canAutopilotProceed(): Promise<{
  canProceed: boolean;
  reason?: string;
  waitTime?: number;
}> {
  const config = await loadGovernorConfig();
  const state = await loadGovernorState();
  
  if (!state.autopilotActive) {
    return { canProceed: false, reason: 'Autopilot is not active' };
  }
  
  if (state.currentMode === 'failsafe') {
    return { canProceed: false, reason: 'System is in failsafe mode' };
  }
  
  if (state.dailyCost >= config.costLimitDaily) {
    return { canProceed: false, reason: 'Daily cost limit reached' };
  }
  
  // Check rate limiting
  // In a real implementation, you'd track recent posts
  return { canProceed: true };
}

// Activate failsafe mode
export async function activateFailsafeMode(reason: string): Promise<void> {
  const state = await loadGovernorState();
  state.currentMode = 'failsafe';
  state.autopilotActive = false;
  await saveGovernorState(state);
  
  // Log the failsafe activation
  const records = await loadCostRecords();
  records.push({
    timestamp: new Date().toISOString(),
    provider: 'system',
    model: 'governor',
    tokens: 0,
    cost: 0,
    taskType: `failsafe_activated: ${reason}`,
  });
  await kvSet(COST_RECORDS_KEY, JSON.stringify(records.slice(-1000)));
}

// Deactivate failsafe mode
export async function deactivateFailsafeMode(): Promise<void> {
  const state = await loadGovernorState();
  state.currentMode = 'normal';
  await saveGovernorState(state);
}

// Validate self-modification proposal
export async function validateEvolutionProposal(proposalId: string): Promise<{
  approved: boolean;
  reason: string;
}> {
  const proposals = await loadEvolutionProposals();
  const proposal = proposals.find(p => p.id === proposalId);
  
  if (!proposal) {
    return { approved: false, reason: 'Proposal not found' };
  }
  
  // Check if test results exist and show improvement
  if (!proposal.testResults) {
    return { approved: false, reason: 'Proposal has not been tested' };
  }
  
  if (proposal.testResults.improvement <= 0) {
    return { approved: false, reason: 'Proposal did not show improvement in testing' };
  }
  
  // Check if the improvement is significant enough
  if (proposal.testResults.improvement < 3) {
    return { approved: false, reason: 'Improvement is not significant enough (< 3%)' };
  }
  
  // Additional safety checks
  if (proposal.proposalType === 'prompt_update') {
    const newPrompt = proposal.proposedValue as string;
    
    // Check for dangerous patterns
    const dangerousPatterns = [
      /ignore.*instructions/i,
      /forget.*rules/i,
      /bypass.*validation/i,
      /disable.*governor/i,
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(newPrompt)) {
        return { approved: false, reason: 'Proposal contains potentially dangerous patterns' };
      }
    }
  }
  
  return { approved: true, reason: 'Proposal passed all validation checks' };
}

// Get governor dashboard data
export async function getGovernorDashboard(): Promise<{
  config: GovernorConfig;
  state: GovernorState;
  recentCosts: CostRecord[];
  qualityMetrics: {
    approvalRate: number;
    avgScore: number;
    totalValidations: number;
  };
  systemHealth: 'healthy' | 'warning' | 'critical';
}> {
  const config = await loadGovernorConfig();
  const state = await loadGovernorState();
  const costs = await loadCostRecords();
  
  // Calculate quality metrics
  const totalValidations = state.approvedToday + state.rejectedToday;
  const approvalRate = totalValidations > 0 
    ? Math.round((state.approvedToday / totalValidations) * 100) 
    : 100;
  const avgScore = totalValidations > 0
    ? Math.max(0, Math.min(100, Math.round((approvalRate * 0.8) + ((100 - Math.min(state.rejectedToday, 20) * 3) * 0.2))))
    : 100;
  
  // Determine system health
  let systemHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
  
  if (state.currentMode === 'failsafe') {
    systemHealth = 'critical';
  } else if (state.dailyCost >= config.costLimitDaily * 0.8) {
    systemHealth = 'warning';
  } else if (approvalRate < 50 && totalValidations >= 10) {
    systemHealth = 'warning';
  } else if (state.rejectedToday > 20) {
    systemHealth = 'warning';
  }
  
  // Get recent costs (last 24 hours)
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentCosts = costs.filter(c => new Date(c.timestamp).getTime() > dayAgo);
  
  return {
    config,
    state,
    recentCosts: recentCosts.slice(-50),
    qualityMetrics: {
      approvalRate,
      avgScore,
      totalValidations,
    },
    systemHealth,
  };
}

// Memory aging - clean up old low-value memories
export async function ageMemory(): Promise<number> {
  const config = await loadGovernorConfig();
  const cutoffTime = Date.now() - (config.memoryAgingDays * 24 * 60 * 60 * 1000);

  const costs = await loadCostRecords();
  const recentCosts = costs.filter(entry => new Date(entry.timestamp).getTime() > cutoffTime);
  const removedCostCount = costs.length - recentCosts.length;

  const rejectedContent = await loadRejectedContent();
  const recentRejectedContent = rejectedContent.filter(entry => new Date(entry.timestamp).getTime() > cutoffTime);
  const removedRejectedCount = rejectedContent.length - recentRejectedContent.length;

  if (removedCostCount > 0) {
    await kvSet(COST_RECORDS_KEY, JSON.stringify(recentCosts));
  }

  if (removedRejectedCount > 0) {
    await kvSet(REJECTED_CONTENT_KEY, JSON.stringify(recentRejectedContent));
  }

  if (recentCosts.length === 0 && costs.length > 0) {
    await kvDelete(COST_RECORDS_KEY);
  }

  if (recentRejectedContent.length === 0 && rejectedContent.length > 0) {
    await kvDelete(REJECTED_CONTENT_KEY);
  }

  return removedCostCount + removedRejectedCount;
}
