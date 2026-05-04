// Orchestration Engine
// Coordinates multi-agent task execution with governor oversight

import { 
  initializeAgents,
  loadAgents,
  getAgentByRole,
  createOrchestrationPlan,
  executeAgentTask,
  selectBestOutput,
  combineOutputs,
  recordAgentTask,
  type AgentConfig,
  type AgentOutput,
  type OrchestrationPlan,
  type SubTask,
} from './multiAgentService';
import { savePlan } from './planStorageService';
import { addToApprovalQueue } from './approvalQueueService';
import {
  runEvolutionCycle,
  analyzeAgentPerformance,
} from './agentEvolutionService';
import {
  loadGovernorConfig,
  loadGovernorState,
  validateContent,
  makeGovernorDecision,
  recordCost,
  activateFailsafeMode,
  type GovernorDecision,
  type ContentValidation,
} from './governorService';
import { loadBrandKit } from './memoryService';
import { buildMemoryContext } from './agentMemoryService';
import { universalChat } from './aiService';
import { parseCriticVerdict } from './orchestrationPrimitives';

// Orchestration Types
export interface OrchestrationResult {
  success: boolean;
  finalContent: string;
  agentOutputs: AgentOutput[];
  validation: ContentValidation;
  governorDecision: GovernorDecision;
  orchestrationPlan: OrchestrationPlan;
  metadata: {
    totalDuration: number;
    agentsUsed: number;
    regenerations: number;
    modelUsed: string;
  };
}

export interface OrchestrationOptions {
  requestType: 'content' | 'strategy' | 'full';
  platform?: string;
  maxRegenerations?: number;
  preferredModel?: string;
  skipGovernor?: boolean;
}

const CRITIC_REJECT_PATTERN = /(?:^|\n)\s*(?:verdict|final verdict)\s*:\s*reject\b/i;
const ROLE_CONTEXT_KEY: Record<AgentOutput['agentRole'], string> = {
  planner: 'executionPlan',
  identity: 'identity',
  rules: 'rules',
  structure: 'structure',
  generator: 'content',
  distribution: 'distribution',
  memory: 'memoryNotes',
  trend: 'trendInsights',
  writer: 'content',
  hook: 'hook',
  strategist: 'strategy',
  optimizer: 'optimizedContent',
  critic: 'critique',
  visual: 'visualPrompt',
  hashtag: 'hashtags',
  engagement: 'engagementInsights',
  hybrid: 'hybridOutput',
};

// Initialize the system
export async function initializeOrchestrationSystem(): Promise<void> {
  // Initialize agents if not already done
  await initializeAgents();
  
  // Load governor config to ensure it exists
  await loadGovernorConfig();
}

// Main orchestration function
export async function orchestrate(
  userRequest: string,
  options: OrchestrationOptions = { requestType: 'content' }
): Promise<OrchestrationResult> {
  const startTime = Date.now();
  let regenerations = 0;
  const maxRegenerations = options.maxRegenerations ?? 3;
  
  // Initialize system
  await initializeOrchestrationSystem();
  
  // Load context
  const brandKit = await loadBrandKit();
  const memoryContext = await buildMemoryContext();
  const governorConfig = await loadGovernorConfig();
  const governorState = await loadGovernorState();
  
  // Check if system is in failsafe mode
  if (governorState.currentMode === 'failsafe' && !options.skipGovernor) {
    return {
      success: false,
      finalContent: '',
      agentOutputs: [],
      validation: {
        isValid: false,
        score: 0,
        issues: [{ type: 'safety', severity: 'critical', message: 'System is in failsafe mode' }],
        suggestions: ['Wait for failsafe to be deactivated'],
        governorApproved: false,
        rejectionReason: 'System in failsafe mode',
      },
      governorDecision: {
        approved: false,
        action: 'reject',
        reason: 'System is in failsafe mode',
      },
      orchestrationPlan: {
        id: '',
        userRequest,
        subtasks: [],
        parallelGroups: [],
        aggregationStrategy: 'best_score',
        status: 'failed',
        createdAt: new Date().toISOString(),
      },
      metadata: {
        totalDuration: Date.now() - startTime,
        agentsUsed: 0,
        regenerations: 0,
        modelUsed: options.preferredModel || 'gpt-4o',
      },
    };
  }
  
  // Create orchestration plan
  const plan = await createOrchestrationPlan(userRequest, options.requestType);
  plan.status = 'executing';
  
  // AI provider function
  const aiProvider = async (prompt: string): Promise<string> => {
    const model = options.preferredModel || 'gpt-4o';
    return await universalChat(prompt, { model, brandKit });
  };
  
  // Execute orchestration with potential regeneration
  let finalResult: OrchestrationResult | null = null;
  
  while (regenerations <= maxRegenerations) {
    const result = await executeOrchestrationPlan(
      plan,
      {
        brandContext: brandKit ? JSON.stringify(brandKit) : '',
        memoryContext,
        platform: options.platform || 'twitter',
      },
      aiProvider
    );

    if (result.criticRejected && regenerations < maxRegenerations) {
      regenerations++;
      continue;
    }
    
    // Validate with governor
    const validation = await validateContent(result.combinedContent, {
      platform: options.platform,
      isRegeneration: regenerations > 0,
    });
    
    // Get governor decision
    const decision = await makeGovernorDecision(validation, {
      currentModel: options.preferredModel,
      regenerationCount: regenerations,
    });
    
    // Track costs
    await recordCost({
      provider: 'puter',
      model: options.preferredModel || 'gpt-4o',
      tokens: result.combinedContent.length, // Approximate
      cost: Math.ceil(result.combinedContent.length / 1000), // Rough estimate
      taskType: `orchestration_${options.requestType}`,
    });
    
    if (decision.approved || options.skipGovernor) {
      plan.status = 'completed';
      plan.finalOutput = result.combinedContent;
      
      // CEO Approval Gate: Queue the result instead of immediate success
      const approvalId = await addToApprovalQueue(result.combinedContent, {
        platform: options.platform || 'twitter',
        agentRole: 'orchestrator',
        modelUsed: options.preferredModel || 'gpt-4o',
        score: result.outputs.length > 0 ? result.outputs[0].score : 0,
        createdAt: new Date().toISOString(),
        orchestrationPlanId: plan.id,
      });

      finalResult = {
        success: true,
        finalContent: `CONTENT_QUEUED_FOR_APPROVAL:${approvalId}`,
        agentOutputs: result.outputs,
        validation,
        governorDecision: decision,
        orchestrationPlan: plan,
        metadata: {
          totalDuration: Date.now() - startTime,
          agentsUsed: result.outputs.length,
          regenerations,
          modelUsed: options.preferredModel || 'gpt-4o',
          approvalId,
        },
      };
      break;
    }
    
    // Handle regeneration or model switch
    if (decision.action === 'regenerate') {
      regenerations++;
      continue;
    }
    
    if (decision.action === 'downgrade' && decision.alternativeModel) {
      options.preferredModel = decision.alternativeModel;
      regenerations++;
      continue;
    }
    
    // Final rejection
    plan.status = 'failed';
    finalResult = {
      success: false,
      finalContent: result.combinedContent,
      agentOutputs: result.outputs,
      validation,
      governorDecision: decision,
      orchestrationPlan: plan,
      metadata: {
        totalDuration: Date.now() - startTime,
        agentsUsed: result.outputs.length,
        regenerations,
        modelUsed: options.preferredModel || 'gpt-4o',
      },
    };
    break;
  }
  
  // If still no result, max regenerations reached
  if (!finalResult) {
    const lastValidation = await validateContent('', { platform: options.platform });
    plan.status = 'failed';
    
    // Consider activating failsafe if too many failures
    if (regenerations >= maxRegenerations) {
      const state = await loadGovernorState();
      if (state.rejectedToday > 10) {
        await activateFailsafeMode('Too many consecutive failures');
      }
    }
    
    finalResult = {
      success: false,
      finalContent: '',
      agentOutputs: [],
      validation: lastValidation,
      governorDecision: {
        approved: false,
        action: 'reject',
        reason: 'Maximum regenerations reached',
      },
      orchestrationPlan: plan,
      metadata: {
        totalDuration: Date.now() - startTime,
        agentsUsed: 0,
        regenerations,
        modelUsed: options.preferredModel || 'gpt-4o',
      },
    };
  }
  
  return finalResult;
}

// Execute the orchestration plan
async function executeOrchestrationPlan(
  plan: OrchestrationPlan,
  context: Record<string, string>,
  aiProvider: (prompt: string) => Promise<string>
): Promise<{
  outputs: AgentOutput[];
  combinedContent: string;
  criticRejected: boolean;
  criticFeedback: string;
}> {
  const outputs: AgentOutput[] = [];
  const taskOutputs: Map<string, AgentOutput> = new Map();
  
  // Execute each parallel group in sequence
  for (const group of plan.parallelGroups) {
    // Get subtasks for this group
    const groupTasks = plan.subtasks.filter(t => group.includes(t.id));
    
    // Check dependencies
    const readyTasks = groupTasks.filter(task => {
      if (!task.dependencies) return true;
      return task.dependencies.every(depId => taskOutputs.has(depId));
    });
    
    // Execute ready tasks in parallel
    const taskPromises = readyTasks.map(async (task) => {
      // Get assigned agent
      const agent = await loadAgents().then(agents => 
        agents.find(a => a.id === task.assignedAgent)
      );
      
      if (!agent) {
        // Fallback to role-based agent
        const fallbackAgent = await getAgentByRole(task.type as any);
        if (!fallbackAgent) {
          task.status = 'failed';
          return null;
        }
        task.assignedAgent = fallbackAgent.id;
      }
      
      const assignedAgent = await loadAgents().then(agents => 
        agents.find(a => a.id === task.assignedAgent)
      );
      
      if (!assignedAgent) {
        task.status = 'failed';
        return null;
      }
      
      // Build task-specific context
      const taskContext = { ...context };
      
      // Add dependency outputs to context
      if (task.dependencies) {
        for (const depId of task.dependencies) {
          const depOutput = taskOutputs.get(depId);
          if (depOutput) {
            const contextKey = ROLE_CONTEXT_KEY[depOutput.agentRole];
            taskContext[contextKey] = depOutput.content;
          }
        }
      }
      
      // Execute agent task
      task.status = 'running';
      const output = await executeAgentTask(
        assignedAgent,
        task.input || plan.userRequest,
        taskContext,
        aiProvider
      );
      
      task.output = output;
      task.status = output.score > 0 ? 'completed' : 'failed';
      
      return { taskId: task.id, output };
    });
    
    // Wait for all parallel tasks
    const results = await Promise.all(taskPromises);
    
    // Store outputs
    for (const result of results) {
      if (result) {
        taskOutputs.set(result.taskId, result.output);
        outputs.push(result.output);
      }
    }
  }
  
  // Combine outputs based on strategy
  let combinedContent: string;
  
  switch (plan.aggregationStrategy) {
    case 'best_score':
      const best = selectBestOutput(outputs);
      combinedContent = best?.content || '';
      break;
    
    case 'combine':
      combinedContent = combineOutputs(outputs, 'merge');
      break;
    
    case 'vote':
      // Simple voting - select most common theme
      combinedContent = selectBestOutput(outputs)?.content || '';
      break;
    
    case 'weighted':
      // Weighted combination based on agent performance scores
      const sortedByWeight = outputs.sort((a, b) => b.score - a.score);
      combinedContent = sortedByWeight[0]?.content || '';
      break;
    
    default:
      combinedContent = outputs.map(o => o.content).join('\n\n');
  }
  
  const criticOutput = outputs
    .filter((output) => output.agentRole === 'critic')
    .sort((a, b) => b.score - a.score)[0];
  const criticFeedback = criticOutput?.content || '';
  const criticVerdict = parseCriticVerdict(criticFeedback);

  if (criticOutput) {
    criticOutput.metadata = {
      ...criticOutput.metadata,
      criticVerdict,
      criticSchemaValid: criticVerdict.schemaValid,
    };
  }

  const criticRejected = criticFeedback
    ? !criticVerdict.schemaValid || criticVerdict.verdict === 'reject' || CRITIC_REJECT_PATTERN.test(criticFeedback)
    : true;

  return { outputs, combinedContent, criticRejected, criticFeedback };
}

// Quick content generation (single agent, fast path)
export async function quickGenerate(
  prompt: string,
  agentRole: 'hook' | 'writer' | 'hashtag' = 'writer'
): Promise<AgentOutput | null> {
  await initializeOrchestrationSystem();
  
  const agent = await getAgentByRole(agentRole);
  if (!agent) return null;
  
  const brandKit = await loadBrandKit();
  const memoryContext = await buildMemoryContext();
  
  const output = await executeAgentTask(
    agent,
    prompt,
    {
      brandContext: brandKit ? JSON.stringify(brandKit) : '',
      memoryContext,
      platform: 'twitter',
    },
    async (p) => await universalChat(p, { model: 'gpt-4o', brandKit })
  );
  
  return output;
}

// Run background evolution (call periodically)
export async function runBackgroundEvolution(): Promise<void> {
  const governorState = await loadGovernorState();
  
  // Don't run evolution in failsafe mode
  if (governorState.currentMode === 'failsafe') return;
  
  try {
    const result = await runEvolutionCycle();
    console.log('Evolution cycle completed:', result);
  } catch (error) {
    console.error('Evolution cycle failed:', error);
  }
}

// Get system status
export async function getOrchestrationStatus(): Promise<{
  agentsReady: boolean;
  agentCount: number;
  governorEnabled: boolean;
  systemMode: string;
  evolutionPending: number;
}> {
  const agents = await loadAgents();
  const config = await loadGovernorConfig();
  const state = await loadGovernorState();
  
  return {
    agentsReady: agents.length > 0,
    agentCount: agents.filter(a => a.evolutionState !== 'deprecated').length,
    governorEnabled: config.enabled,
    systemMode: state.currentMode,
    evolutionPending: 0, // Would need to check proposals
  };
}
