// Agent Evolution Service
// Implements self-modifying agents with performance-based evolution

import { kvGet, kvSet } from './puterService';
import { generateId } from './memoryService';
import { loadBrandKit } from './memoryService';
import {
  loadAgents,
  saveAgents,
  getAgentById,
  updateAgent,
  createHybridAgent,
  type AgentConfig,
  type AgentRole,
} from './multiAgentService';
import { PromptManager } from './promptManager';
import { stateStore } from './supabaseStore';

import { validateContent, validateEvolutionProposal } from './governorService';
import { universalChat as aiUniversalChat } from './aiService';

const universalChat = aiUniversalChat;

// Evolution Types
export interface EvolutionProposal {
  id: string;
  agentId: string;
  proposalType: 'prompt_update' | 'weight_adjustment' | 'capability_add' | 'strategy_change';
  currentValue: string | number | Record<string, number>;
  proposedValue: string | number | Record<string, number>;
  reasoning: string;
  expectedImprovement: number;
  status: 'pending' | 'testing' | 'approved' | 'rejected' | 'applied';
  testResults?: {
    beforeScore: number;
    afterScore: number;
    improvement: number;
  };
  createdAt: string;
  resolvedAt?: string;
}

export interface PerformanceAnalysis {
  agentId: string;
  period: 'day' | 'week' | 'month';
  totalTasks: number;
  avgScore: number;
  scoresTrend: 'improving' | 'stable' | 'declining';
  weaknesses: string[];
  strengths: string[];
  recommendations: string[];
}

export interface AgentVersion {
  version: number;
  agentId: string;
  promptTemplate: string;
  scoringWeights: AgentConfig['scoringWeights'];
  performanceScore: number;
  appliedAt: string;
  changedBy: 'evolution' | 'manual' | 'hybrid_creation';
}

// Storage Keys
const EVOLUTION_PROPOSALS_KEY = 'nexus_evolution_proposals';
const AGENT_VERSIONS_KEY = 'nexus_agent_versions';

// Load evolution proposals
export async function loadEvolutionProposals(): Promise<EvolutionProposal[]> {
  return stateStore.loadEvolutionProposals();
}

// Save evolution proposals
async function saveEvolutionProposals(proposals: EvolutionProposal[]): Promise<void> {
  for (const p of proposals) {
    await stateStore.saveEvolutionProposal(p);
  }
}

// Load agent versions
export async function loadAgentVersions(agentId: string): Promise<AgentVersion[]> {
  return stateStore.loadAgentVersions(agentId);
}

// Save agent version
async function saveAgentVersion(version: AgentVersion): Promise<void> {
  await stateStore.saveAgentVersion(version);
}

// Analyze agent performance
export async function analyzeAgentPerformance(
  agentId: string,
  period: 'day' | 'week' | 'month' = 'week'
): Promise<PerformanceAnalysis> {
  const agent = await getAgentById(agentId);
  if (!agent) {
    throw new Error('Agent not found');
  }
  
  // Filter tasks by period
  const now = Date.now();
  const periodMs = {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
  };
  
  const relevantTasks = agent.taskHistory.filter(
    t => now - new Date(t.timestamp).getTime() < periodMs[period]
  );
  
  if (relevantTasks.length === 0) {
    return {
      agentId,
      period,
      totalTasks: 0,
      avgScore: agent.performanceScore,
      scoresTrend: 'stable',
      weaknesses: [],
      strengths: [],
      recommendations: ['Not enough data to analyze'],
    };
  }
  
  // Calculate average score
  const avgScore = Math.round(
    relevantTasks.reduce((sum, t) => sum + t.score, 0) / relevantTasks.length
  );
  
  // Determine trend
  const halfPoint = Math.floor(relevantTasks.length / 2);
  const firstHalfAvg = relevantTasks.slice(0, halfPoint)
    .reduce((sum, t) => sum + t.score, 0) / (halfPoint || 1);
  const secondHalfAvg = relevantTasks.slice(halfPoint)
    .reduce((sum, t) => sum + t.score, 0) / (relevantTasks.length - halfPoint || 1);
  
  let scoresTrend: 'improving' | 'stable' | 'declining';
  if (secondHalfAvg - firstHalfAvg > 5) {
    scoresTrend = 'improving';
  } else if (firstHalfAvg - secondHalfAvg > 5) {
    scoresTrend = 'declining';
  } else {
    scoresTrend = 'stable';
  }
  
  // Identify weaknesses and strengths
  const weaknesses: string[] = [];
  const strengths: string[] = [];
  const recommendations: string[] = [];
  
  // Analyze by scoring weights
  if (agent.scoringWeights.creativity < 0.2 && avgScore < 70) {
    weaknesses.push('Low creativity weight may limit output variety');
    recommendations.push('Consider increasing creativity weight');
  }
  
  if (agent.scoringWeights.engagement > 0.3 && avgScore > 80) {
    strengths.push('Strong engagement optimization');
  }
  
  // Task-specific analysis
  const lowScoreTasks = relevantTasks.filter(t => t.score < 60);
  if (lowScoreTasks.length > relevantTasks.length * 0.3) {
    weaknesses.push('High proportion of low-scoring outputs');
    recommendations.push('Review prompt template for clarity');
  }
  
  const highScoreTasks = relevantTasks.filter(t => t.score > 85);
  if (highScoreTasks.length > relevantTasks.length * 0.5) {
    strengths.push('Consistently high-quality outputs');
  }
  
  // Duration analysis
  const avgDuration = relevantTasks.reduce((sum, t) => sum + t.duration, 0) / relevantTasks.length;
  if (avgDuration > 10000) {
    weaknesses.push('Slow response times');
    recommendations.push('Consider simplifying prompt template');
  } else if (avgDuration < 3000) {
    strengths.push('Fast response generation');
  }
  
  return {
    agentId,
    period,
    totalTasks: relevantTasks.length,
    avgScore,
    scoresTrend,
    weaknesses,
    strengths,
    recommendations,
  };
}

// Detect weaknesses and propose improvements
export async function proposeEvolution(agentId: string): Promise<EvolutionProposal | null> {
  const analysis = await analyzeAgentPerformance(agentId, 'week');
  const agent = await getAgentById(agentId);
  
  if (!agent || analysis.weaknesses.length === 0) {
    return null;
  }
  
  const proposals = await loadEvolutionProposals();
  
  // Check if there's already a pending proposal for this agent
  const pendingProposal = proposals.find(
    p => p.agentId === agentId && (p.status === 'pending' || p.status === 'testing')
  );
  if (pendingProposal) return pendingProposal;
  
  // Generate proposal based on weaknesses
  let proposalType: EvolutionProposal['proposalType'] = 'prompt_update';
  let currentValue: string | number | Record<string, number> = agent.promptTemplate;
  let proposedValue: string | number | Record<string, number> = agent.promptTemplate;
  let reasoning = '';
  let expectedImprovement = 5;
  
  if (analysis.weaknesses.includes('Low creativity weight may limit output variety')) {
    proposalType = 'weight_adjustment';
    currentValue = agent.scoringWeights;
    proposedValue = {
      ...agent.scoringWeights,
      creativity: Math.min(0.4, agent.scoringWeights.creativity + 0.1),
    };
    reasoning = 'Increasing creativity weight to improve output variety';
    expectedImprovement = 8;
  } else if (analysis.weaknesses.includes('High proportion of low-scoring outputs')) {
    proposalType = 'prompt_update';
    currentValue = agent.promptTemplate;
    proposedValue = PromptManager.updateTemplate(agent.promptTemplate, '', 'enhance');
    reasoning = 'Adding quality emphasis to prompt template';
    expectedImprovement = 10;
  } else if (analysis.weaknesses.includes('Slow response times')) {
    proposalType = 'prompt_update';
    currentValue = agent.promptTemplate;
    proposedValue = PromptManager.updateTemplate(agent.promptTemplate, '', 'simplify');
    reasoning = 'Simplifying prompt to improve response time';
    expectedImprovement = 5;
  }
  
  const proposal: EvolutionProposal = {
    id: generateId(),
    agentId,
    proposalType,
    currentValue,
    proposedValue,
    reasoning,
    expectedImprovement,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  
  proposals.push(proposal);
  await saveEvolutionProposals(proposals);
  
  return proposal;
}

// Test evolution proposal
export async function testEvolutionProposal(
  proposalId: string,
  testRunner: (prompt: string) => Promise<{ content: string; score: number }>
): Promise<EvolutionProposal> {
  const proposals = await loadEvolutionProposals();
  const proposal = proposals.find(p => p.id === proposalId);
  
  if (!proposal) {
    throw new Error('Proposal not found');
  }
  
  const agent = await getAgentById(proposal.agentId);
  if (!agent) {
    throw new Error('Agent not found');
  }
  
  proposal.status = 'testing';
  await saveEvolutionProposals(proposals);
  
  // Run test with current configuration
  const beforeResult = await testRunner(agent.promptTemplate);
  
  // Run test with proposed configuration
  let testPrompt = agent.promptTemplate;
  if (proposal.proposalType === 'prompt_update') {
    testPrompt = proposal.proposedValue as string;
  }
  const afterResult = await testRunner(testPrompt);
  
  proposal.testResults = {
    beforeScore: beforeResult.score,
    afterScore: afterResult.score,
    improvement: afterResult.score - beforeResult.score,
  };
  
  // Approve if improvement exists
  if (proposal.testResults.improvement > 0) {
    proposal.status = 'approved';
  } else {
    proposal.status = 'rejected';
  }
  
  proposal.resolvedAt = new Date().toISOString();
  await saveEvolutionProposals(proposals);
  
  return proposal;
}

async function runDefaultEvolutionTest(agent: AgentConfig, promptTemplate: string): Promise<{ content: string; score: number }> {
  const brandKit = await loadBrandKit();
  const candidateInput = 'Create a concise, platform-native social media post about turning one useful idea into a monetizable short-form content series.';

  let renderedPrompt = promptTemplate;
  renderedPrompt = renderedPrompt.includes('{{input}}')
    ? renderedPrompt.replace(/{{input}}/g, candidateInput)
    : `${renderedPrompt}\n\nInput: ${candidateInput}`;

  const brandStr = brandKit
    ? `Brand: ${brandKit.brandName || 'N/A'}\nTone: ${brandKit.tone || 'conversational'}\nAudience: ${brandKit.targetAudience || 'general'}\nNiche: ${brandKit.niche || 'general'}`
    : 'No brand context available';

  renderedPrompt = renderedPrompt.replace(/{{brandContext}}/g, brandStr);
  renderedPrompt = renderedPrompt.replace(/{{platform}}/g, 'instagram');
  renderedPrompt = renderedPrompt.replace(/{{charLimit}}/g, '2200');
  renderedPrompt = renderedPrompt.replace(/{{tone}}/g, brandKit?.tone || 'conversational');
  renderedPrompt = renderedPrompt.replace(/{{content}}/g, candidateInput);
  renderedPrompt = renderedPrompt.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '');

  const content = await universalChat(renderedPrompt, {
    model: 'gpt-4o-mini',
    brandKit,
  });

  const validation = await validateContent(content, {
    platform: 'instagram',
    isRegeneration: false,
  });

  return {
    content,
    score: validation.score,
  };
}

// Apply approved evolution
export async function applyEvolution(proposalId: string): Promise<boolean> {
  const proposals = await loadEvolutionProposals();
  const proposal = proposals.find(p => p.id === proposalId);
  
  if (!proposal || proposal.status !== 'approved') {
    return false;
  }

  const governorDecision = await validateEvolutionProposal(proposalId);
  if (!governorDecision.approved) {
    proposal.status = 'rejected';
    proposal.resolvedAt = new Date().toISOString();
    await saveEvolutionProposals(proposals);
    return false;
  }
  
  const agent = await getAgentById(proposal.agentId);
  if (!agent) return false;
  
  // Save current version before updating
  await saveAgentVersion({
    version: agent.version,
    agentId: agent.id,
    promptTemplate: agent.promptTemplate,
    scoringWeights: agent.scoringWeights,
    performanceScore: agent.performanceScore,
    appliedAt: new Date().toISOString(),
    changedBy: 'evolution',
  });
  
  // Apply the change
  const updates: Partial<AgentConfig> = {
    version: agent.version + 1,
  };
  
  switch (proposal.proposalType) {
    case 'prompt_update':
      updates.promptTemplate = proposal.proposedValue as string;
      break;
    case 'weight_adjustment':
      updates.scoringWeights = proposal.proposedValue as AgentConfig['scoringWeights'];
      break;
    case 'capability_add':
      // Would need to handle capability additions
      break;
  }
  
  await updateAgent(agent.id, updates);
  
  proposal.status = 'applied';
  await saveEvolutionProposals(proposals);
  
  return true;
}

// Rollback to previous version
export async function rollbackAgent(agentId: string, targetVersion?: number): Promise<boolean> {
  const versions = await loadAgentVersions(agentId);
  if (versions.length === 0) return false;
  
  const target = targetVersion 
    ? versions.find(v => v.version === targetVersion)
    : versions[versions.length - 1];
  
  if (!target) return false;
  
  await updateAgent(agentId, {
    promptTemplate: target.promptTemplate,
    scoringWeights: target.scoringWeights,
    version: target.version,
  });
  
  return true;
}

// Promote high-performing agent
export async function promoteAgent(agentId: string): Promise<void> {
  await updateAgent(agentId, { evolutionState: 'promoted' });
}

// Demote low-performing agent
export async function demoteAgent(agentId: string): Promise<void> {
  await updateAgent(agentId, { evolutionState: 'demoted' });
}

// Deprecate agent
export async function deprecateAgent(agentId: string): Promise<void> {
  await updateAgent(agentId, { evolutionState: 'deprecated' });
}

// Run evolution cycle for all agents
export async function runEvolutionCycle(): Promise<{
  analyzed: number;
  proposed: number;
  applied: number;
  hybridsCreated: number;
}> {
  const agents = await loadAgents();
  const activeAgents = agents.filter(a => a.evolutionState !== 'deprecated');
  
  let analyzed = 0;
  let proposed = 0;
  let applied = 0;
  let hybridsCreated = 0;
  
  for (const agent of activeAgents) {
    analyzed++;
    
    // Analyze and propose evolution
    const proposal = await proposeEvolution(agent.id);
    if (proposal) {
      proposed++;
    }

    const proposals = await loadEvolutionProposals();
    const pending = proposals.filter(
      p => p.agentId === agent.id && p.status === 'pending'
    );

    for (const p of pending) {
      await testEvolutionProposal(p.id, (candidatePrompt) =>
        runDefaultEvolutionTest(agent, candidatePrompt)
      );
    }

    const refreshedProposals = await loadEvolutionProposals();
    const approved = refreshedProposals.filter(
      p => p.agentId === agent.id && p.status === 'approved'
    );

    for (const p of approved) {
      const success = await applyEvolution(p.id);
      if (success) applied++;
    }
    
    // Promote/demote based on performance
    const analysis = await analyzeAgentPerformance(agent.id, 'week');
    
    if (analysis.avgScore >= 90 && agent.evolutionState === 'active') {
      await promoteAgent(agent.id);
    } else if (analysis.avgScore < 50 && analysis.totalTasks >= 10) {
      await demoteAgent(agent.id);
    }
  }
  
  // Create hybrid from top performers
  const promotedAgents = agents.filter(a => a.evolutionState === 'promoted');
  if (promotedAgents.length >= 2) {
    const topTwo = promotedAgents
      .sort((a, b) => b.performanceScore - a.performanceScore)
      .slice(0, 2);
    
    // Only create hybrid if we don't have too many
    const existingHybrids = agents.filter(a => a.evolutionState === 'hybrid');
    if (existingHybrids.length < 5) {
      const hybrid = await createHybridAgent(
        topTwo.map(a => a.id),
        `Hybrid_${topTwo[0].role}_${topTwo[1].role}`
      );
      if (hybrid) hybridsCreated++;
    }
  }
  
  return { analyzed, proposed, applied, hybridsCreated };
}

// Get evolution history
export async function getEvolutionHistory(): Promise<{
  proposals: EvolutionProposal[];
  applied: number;
  rejected: number;
  pending: number;
}> {
  const proposals = await loadEvolutionProposals();
  
  return {
    proposals: proposals.slice(-50), // Last 50 proposals
    applied: proposals.filter(p => p.status === 'applied').length,
    rejected: proposals.filter(p => p.status === 'rejected').length,
    pending: proposals.filter(p => p.status === 'pending' || p.status === 'testing').length,
  };
}
