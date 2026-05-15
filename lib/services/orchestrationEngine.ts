import { getSupabaseAdminClient } from '@/lib/supabase/server';
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
  type AgentRole,
} from './multiAgentService';
import { savePlan, getPlan } from './planStorageService';
import { gatherNexusContext } from './discoveryService';
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
  type GovernorValidation,
} from './governorService';
import { loadBrandKit } from './memoryService';
import { buildMemoryContext } from './agentMemoryService';
import { universalChat } from './aiService';
import type { BrandKit } from '@/lib/validators';
import { parseCriticVerdict } from './orchestrationPrimitives';
import type { CriticVerdict as PrimitiveCriticVerdict } from './orchestrationPrimitives';
import { jobQueueService } from './jobQueueService';
import { updateJobProgress, getJobStatus } from './executeWithQueueService';

interface GovernorDecision {
  approved: boolean;
  action: 'approve' | 'reject' | 'regenerate' | 'switch_provider';
  reason: string;
  alternativeModel?: string;
}

interface ContentValidation {
  isValid: boolean;
  score: number;
  issues: Array<{ type: string; severity: string; message: string }>;
  suggestions: string[];
  governorApproved: boolean;
  rejectionReason?: string;
}

// Keyword-based context retrieval for RAG-lite
interface ContextSection {
  id: string;
  title: string;
  content: string;
  keywords: string[];
}

function splitBrandKitIntoSections(brandKit: BrandKit): ContextSection[] {
  const sections: ContextSection[] = [
    {
      id: 'voice',
      title: 'Brand Voice',
      content: `Tone: ${brandKit.tone}\nLanguage: ${brandKit.language}`,
      keywords: ['tone', 'voice', 'language', 'style'],
    },
    {
      id: 'pillars',
      title: 'Content Pillars',
      content: brandKit.contentPillars.join('\n'),
      keywords: ['pillar', 'focus', 'core', 'strategy'],
    },
    {
      id: 'avoid',
      title: 'Avoid Topics',
      content: brandKit.avoidTopics.join('\n'),
      keywords: ['avoid', 'exclude', 'restrict', 'limit'],
    },
    {
      id: 'usp',
      title: 'Unique Selling Point',
      content: brandKit.uniqueSellingPoint,
      keywords: ['usp', 'unique', 'differentiator', 'value'],
    },
    {
      id: 'niche',
      title: 'Niche',
      content: `Niche: ${brandKit.niche}\nAudience: ${brandKit.targetAudience}`,
      keywords: ['niche', 'audience', 'target', 'segment'],
    },
  ];

  return sections;
}

function retrieveRelevantContext(
  query: string,
  sections: ContextSection[],
  role: AgentRole
): string {
  const relevantSections: ContextSection[] = [];

  // Role-based filtering
  switch (role) {
    case 'planner':
    case 'identity':
    case 'rules':
      relevantSections.push(...sections.filter(s => ['voice', 'pillars', 'avoid', 'usp'].includes(s.id)));
      break;
    case 'generator':
    case 'writer':
      relevantSections.push(...sections.filter(s => ['voice', 'usp'].includes(s.id)));
      break;
    case 'distribution':
    case 'hashtag':
      relevantSections.push(...sections.filter(s => ['niche', 'pillars'].includes(s.id)));
      break;
    default:
      relevantSections.push(...sections);
  }

  // Keyword matching
  const queryKeywords = query.toLowerCase().split(/\s+/);
  const matchedSections = relevantSections.filter(section =>
    section.keywords.some(keyword =>
      queryKeywords.includes(keyword.toLowerCase())
    )
  );

  // Fallback to all relevant sections if no matches
  const finalSections = matchedSections.length > 0 ? matchedSections : relevantSections;

  return finalSections.map(s => `### ${s.title}\n${s.content}`).join('\n\n');
}

function getSurgicalBrandContext(role: AgentRole, brandKit: BrandKit | null): string {
  if (!brandKit) return '';

  const parts: string[] = [];
  
  switch (role) {
    case 'planner':
    case 'identity':
      parts.push(`Brand: ${brandKit.brandName}`);
      parts.push(`Niche: ${brandKit.niche}`);
      parts.push(`Audience: ${brandKit.targetAudience}`);
      parts.push(`USP: ${brandKit.uniqueSellingPoint}`);
      parts.push(`Tone: ${brandKit.tone}`);
      parts.push(`Pillars: ${brandKit.contentPillars.join(', ')}`);
      parts.push(`Avoid: ${brandKit.avoidTopics.join(', ')}`);
      break;
      
    case 'rules':
      parts.push(`Tone: ${brandKit.tone}`);
      parts.push(`Pillars: ${brandKit.contentPillars.join(', ')}`);
      parts.push(`Avoid: ${brandKit.avoidTopics.join(', ')}`);
      break;
      
    case 'generator':
    case 'writer':
      parts.push(`Tone: ${brandKit.tone}`);
      parts.push(`USP: ${brandKit.uniqueSellingPoint}`);
      parts.push(`Pillars: ${brandKit.contentPillars.join(', ')}`);
      break;
      
    case 'distribution':
    case 'hashtag':
      parts.push(`Audience: ${brandKit.targetAudience}`);
      parts.push(`Hashtag Strategy: ${Array.isArray(brandKit.hashtagStrategy) ? brandKit.hashtagStrategy.join(', ') : brandKit.hashtagStrategy}`);
      break;
      
    default:
      parts.push(`Brand: ${brandKit.brandName} (${brandKit.niche})`);
      parts.push(`Tone: ${brandKit.tone}`);
  }

  return parts.join('\n');
}


// Helper to handle Ultimate Brain fallback when specialized agents fail
async function handleBrainFallback(
  task: any, 
  context: any, 
  originalError: any
): Promise<AgentOutput> {
  console.warn(`[Brand Manager] Specialized agent failed for task ${task.id}. Stepping in as the Ultimate Brain...`);
  
  const prompt = `The specialized agent for the role ${task.type} failed to complete this task. 
As the Brand Manager and Ultimate Brain of this operation, you must now handle this perfectly.

TASK: ${task.input || 'Main Goal'}
CONTEXT: ${JSON.stringify(context)}
ERROR ENCOUNTERED: ${originalError instanceof Error ? originalError.message : String(originalError)}

Requirement: Provide the final, perfect output that a specialized agent would have provided, ensuring total alignment with brand identity and quality standards.`;

  const content = await universalChat(prompt, { model: 'gpt-4o' });

  return {
    agentId: 'brand-manager-brain',
    agentRole: 'orchestrator' as AgentRole,
    content,
    score: 100,
    reasoning: 'Handled by Brand Manager fallback after specialized agent failure',
    fullPrompt: prompt,
    metadata: { duration: 0 },
  };
}

// Orchestration Types
export interface OrchestrationResult {
  success: boolean;
  finalContent: string;
  agentOutputs: AgentOutput[];
  trace: Array<{
    taskId: string;
    agentId: string;
    role: AgentRole;
    input: string;
    prompt: string;
    output: string;
    score: number;
    duration: number;
    timestamp: string;
  }>;
  validation: ContentValidation;
  governorDecision: GovernorDecision;
  orchestrationPlan: OrchestrationPlan;
  metadata: {
    totalDuration: number;
    agentsUsed: number;
    regenerations: number;
    modelUsed: string;
    pausedAtTaskId?: string;
  };
}

export interface OrchestrationOptions {
  requestType: 'content' | 'strategy' | 'full';
  platform?: string;
  maxRegenerations?: number;
  preferredModel?: string;
  skipGovernor?: boolean;
  orchestrationPlanId?: string;
  resumeFromTaskId?: string;
  pauseAtRole?: AgentRole;
}

const CRITIC_REJECT_PATTERN = /(?:^|\n)\s*(?:verdict|final verdict)\s*:\s*reject\b/i;
const ROLE_CONTEXT_KEY = {
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
  critic: 'critic',
  visual: 'visualPrompt',
  hashtag: 'hashtags',
  engagement: 'engagementInsights',
  hybrid: 'hybridOutput',
  mediaDirector: 'mediaDirectives',
};

function convertToValidation(v: GovernorValidation): ContentValidation {
  return {
    isValid: v.approved,
    score: v.score,
    issues: v.issues.map(i => ({ type: i.type, severity: i.severity, message: i.message })),
    suggestions: v.feedback ? [v.feedback] : [],
    governorApproved: v.approved,
    rejectionReason: v.feedback || undefined,
  };
}

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
      trace: [],
      metadata: {
        totalDuration: Date.now() - startTime,
        agentsUsed: 0,
        regenerations: 0,
        modelUsed: options.preferredModel || 'gpt-4o',
      },
    };
  }
  
  // Create or Load orchestration plan
  let plan: OrchestrationPlan;
  if (options.orchestrationPlanId) {
    const savedPlan = await getPlan(options.orchestrationPlanId);
    if (!savedPlan) throw new Error(`Plan ${options.orchestrationPlanId} not found`);
    plan = savedPlan.plan_data;
  } else {
    plan = await createOrchestrationPlan(userRequest, options.requestType);
  }
  plan.status = 'executing';
  await savePlan(plan);

  
  // AI provider function
  const aiProvider = async (prompt: string, role: AgentRole): Promise<string> => {
    const model = options.preferredModel || 'gpt-4o';
    const brandKitSections = brandKit ? splitBrandKitIntoSections(brandKit) : [];
    const surgicalBrand = getSurgicalBrandContext(role, brandKit);
    const retrievedContext = retrieveRelevantContext(prompt, brandKitSections, role);
    const enhancedContext = `${surgicalBrand}\n\n${retrievedContext}`;
    return await universalChat(prompt, { model, brandKit: { ...brandKit!, uniqueSellingPoint: enhancedContext } as any });
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
      aiProvider,
      options
    );

    if (result.pausedAtTaskId) {
      return {
        success: false,
        finalContent: `PAUSED_AT_TASK:${result.pausedAtTaskId}`,
        agentOutputs: result.outputs,
        trace: result.trace,
        validation: {
          isValid: false,
          score: 0,
          issues: [{ type: 'info', severity: 'low', message: 'Orchestration paused for human review' }],
          suggestions: ['Review current outputs and resume'],
          governorApproved: false,
          rejectionReason: 'Paused',
        },
        governorDecision: {
          approved: false,
          action: 'reject',
          reason: `Paused at task ${result.pausedAtTaskId}`,
        },
        orchestrationPlan: plan,
        metadata: {
          totalDuration: Date.now() - startTime,
          agentsUsed: result.outputs.length,
          regenerations,
          modelUsed: options.preferredModel || 'gpt-4o',
          pausedAtTaskId: result.pausedAtTaskId,
        },
      };
    }

    const criticRejected = result.criticFeedback
      ? !result.criticVerdict.schemaValid || result.criticVerdict.verdict === 'reject' || CRITIC_REJECT_PATTERN.test(result.criticFeedback)
      : false;

    if (criticRejected && regenerations < maxRegenerations) {
      regenerations++;
      
      // Adaptive Planning: If critic specifies a target agent, invalidate that task and its descendants
      const targetRole = result.criticVerdict.targetAgent;
      if (targetRole) {
        const targetTask = plan.subtasks.find(t => t.type === targetRole || t.assignedAgent === targetRole);
        if (targetTask) {
          // Invalidate target and all downstream tasks
          plan.subtasks.forEach(t => {
            if (t.id === targetTask.id || (t.dependencies && t.dependencies.includes(targetTask.id))) {
              t.status = 'pending';
              t.output = undefined;
            }
          });
        }
      } else {
        // Full reset if no target specified
        plan.subtasks.forEach(t => {
          t.status = 'pending';
          t.output = undefined;
        });
      }
      
      await savePlan(plan);
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
      
      // CEO Approval Gate: Queue the result for tracking
      const approvalId = await addToApprovalQueue(result.combinedContent, {
        platform: options.platform || 'twitter',
        metadata: {
          orchestrationPlanId: plan.id,
        },
      });

      finalResult = {
        success: true,
        finalContent: result.combinedContent,
        agentOutputs: result.outputs,
        trace: result.trace,
        validation: convertToValidation(validation),
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
    
    // Handle regeneration or model switch
    if (decision.action === 'regenerate') {
      regenerations++;
      continue;
    }
    
    if (decision.action === 'switch_provider' && decision.alternativeModel) {
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
      trace: result.trace,
      validation: convertToValidation(validation),
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
      if (state.rejectedToday !== undefined && state.rejectedToday > 10) {
        await activateFailsafeMode('Too many consecutive failures');
      }
    }
    
    finalResult = {
      success: false,
      finalContent: '',
      agentOutputs: [],
      trace: [],
      validation: convertToValidation(lastValidation),
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
  aiProvider: (prompt: string, role: AgentRole) => Promise<string>,
  options: OrchestrationOptions = { requestType: 'content' as const }
): Promise<{
  outputs: AgentOutput[];
  combinedContent: string;
  criticVerdict: PrimitiveCriticVerdict;
  criticFeedback: string;
  trace: Array<{
    taskId: string;
    agentId: string;
    role: AgentRole;
    input: string;
    prompt: string;
    output: string;
    score: number;
    duration: number;
    timestamp: string;
  }>;
  pausedAtTaskId?: string;
}> {
  const outputs: AgentOutput[] = [];
  const taskOutputs: Map<string, AgentOutput> = new Map();
  const trace: any[] = [];
  let externalContext = '';
  
  // If resuming, load previous outputs
  if (plan.status === 'paused' || options.resumeFromTaskId) {
    // We assume plan.subtasks contains the outputs of completed tasks
    plan.subtasks.forEach(task => {
      if (task.output) {
        taskOutputs.set(task.id, task.output);
        outputs.push(task.output);
      }
    });
  }

  // Execute each parallel group in sequence
  for (const group of plan.parallelGroups) {
    // Get subtasks for this group
    const groupTasks = plan.subtasks.filter(t => group.includes(t.id));
    
    // Skip already completed tasks (for resume)
    const remainingTasks = groupTasks.filter(task => {
      if (task.status === 'completed') return false;
      if (options.resumeFromTaskId && task.id !== options.resumeFromTaskId) {
        // This is a simplified resume logic: skip everything before the target task
        // In a real app, we'd check if the task is in the current or future group
      }
      return true;
    });

    // Check dependencies
    const readyTasks = remainingTasks.filter(task => {
      if (!task.dependencies) return true;
      return task.dependencies.every(depId => taskOutputs.has(depId));
    });
    
    // Execute ready tasks in parallel
    const taskPromises = readyTasks.map(async (task) => {
      // Handle Data Gathering
      if (task.type === 'data_gathering') {
        const discovery = await gatherNexusContext(task.input || plan.userRequest);
        externalContext = discovery.summary;
        
        const output: AgentOutput = {
          agentId: 'system',
          agentRole: 'trend' as AgentRole,
          content: discovery.summary,
          score: 100,
          reasoning: 'Real-time discovery data fetched successfully',
          fullPrompt: `Fetch real-time trends and geo-data for: ${task.input || plan.userRequest}`,
          metadata: { duration: 0, discovery },
        };
        
        task.output = output;
        task.status = 'completed';
        taskOutputs.set(task.id, output);
        outputs.push(output);
        
        trace.push({
          taskId: task.id,
          agentId: 'system',
          role: 'trend' as AgentRole,
          input: task.input || plan.userRequest,
          prompt: output.fullPrompt,
          output: output.content,
          score: output.score,
          duration: 0,
          timestamp: new Date().toISOString(),
        });
        
        return { taskId: task.id, output };
      }

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
      
      // Check if we should pause at this role
      if (options.pauseAtRole === assignedAgent.role) {
        plan.status = 'paused';
        await savePlan(plan);
        return { taskId: task.id, paused: true };
      }
      
      // Build task-specific context
      const taskContext: Record<string, string> = { 
        ...context, 
        externalContext,
      };
      
      // Add dependency outputs to context
      if (task.dependencies) {
        for (const depId of task.dependencies) {
          const depOutput = taskOutputs.get(depId);
          if (depOutput) {
            const contextKey = (ROLE_CONTEXT_KEY as Record<string, string>)[depOutput.agentRole] ?? 'context';
            taskContext[contextKey] = depOutput.content;
          }
        }
      }
      
      // Execute agent task with error recovery and Ultimate Brain fallback
      task.status = 'running';
      let output: AgentOutput;
      try {
        output = await executeAgentTask(
          assignedAgent,
          task.input || plan.userRequest,
          taskContext,
          (p) => aiProvider(p, assignedAgent.role)
        );
      } catch (error) {
        // Fallback 1: Try alternative agent with same role
        const alternativeAgent = await getAgentByRole(assignedAgent.role);
        if (alternativeAgent && alternativeAgent.id !== assignedAgent.id) {
          try {
            output = await executeAgentTask(
              alternativeAgent,
              task.input || plan.userRequest,
              taskContext,
              (p) => aiProvider(p, alternativeAgent.role)
            );
          } catch (altError) {
            output = await handleBrainFallback(task, taskContext, altError);
          }
        } else {
          // Fallback 2: Immediate Ultimate Brain fallback
          output = await handleBrainFallback(task, taskContext, error);
        }
      }

      
      task.output = output;
      task.status = output.score > 0 ? 'completed' : 'failed';
      
      // Record trace
      trace.push({
        taskId: task.id,
        agentId: assignedAgent.id,
        role: assignedAgent.role,
        input: task.input || plan.userRequest,
        prompt: output.fullPrompt,
        output: output.content,
        score: output.score,
        duration: output.metadata.duration as number,
        timestamp: new Date().toISOString(),
      });
      
      return { taskId: task.id, output };
    });
    
    // Wait for all parallel tasks
    const results = await Promise.all(taskPromises);
    
    // Store outputs
    for (const result of results) {
      if (result) {
        if ((result as any).paused) {
          return { 
            outputs, 
            combinedContent: '', 
            criticFeedback: '', 
            criticVerdict: { verdict: 'approve' as const, score: 0, schemaValid: true, critique: '', fixes: [] },
            trace, 
            pausedAtTaskId: (result as any).taskId 
          };
        }
        taskOutputs.set(result.taskId, (result as any).output);
        outputs.push((result as any).output);
      }
    }
    
    // Save plan state after each group for resilience
    await savePlan(plan);
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
  const rawVerdict = parseCriticVerdict(criticFeedback);
  const criticVerdict: PrimitiveCriticVerdict = {
    verdict: rawVerdict.verdict as 'approve' | 'reject' | 'unknown',
    score: rawVerdict.score ?? 0,
    schemaValid: rawVerdict.schemaValid,
    targetAgent: rawVerdict.targetAgent,
    critique: (rawVerdict as any).critique || '',
    fixes: (rawVerdict as any).fixes || [],
  };

  if (criticOutput) {
    criticOutput.metadata = {
      ...criticOutput.metadata,
      criticVerdict,
      criticSchemaValid: criticVerdict.schemaValid,
    };
  }

  return { outputs, combinedContent, criticVerdict, criticFeedback, trace };
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
    systemMode: state.currentMode ?? 'normal',
    evolutionPending: 0,
  };
}

/**
 * Queue-based orchestration that returns immediately with a job ID.
 * The caller can poll /api/jobs/[id] for progress and result.
 */
export async function orchestrateViaQueue(
  userRequest: string,
  userId: string,
  workspaceId?: string,
  options: OrchestrationOptions = { requestType: 'content' }
): Promise<{ jobId: string }> {
  if (!userRequest || typeof userRequest !== 'string' || !userRequest.trim()) {
    throw new Error('userRequest must be a non-empty string');
  }
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('userId must be a non-empty string');
  }
  const jobId = await jobQueueService.enqueueJob(
    'orchestration',
    { userRequest, options },
    userId,
    workspaceId,
    { priority: 2, maxAttempts: 2 }
  );
  return { jobId };
}

/**
 * Execute an orchestration job (for use with the background worker).
 * This wraps the synchronous orchestrate() call with job progress tracking.
 */
interface OrchestrationJobPayload {
  id: string;
  payload?: { userRequest?: string; options?: OrchestrationOptions };
}

export async function executeOrchestrationJob(job: OrchestrationJobPayload, supabase: ReturnType<typeof getSupabaseAdminClient>): Promise<{
  success: boolean;
  result?: OrchestrationResult;
  error?: string;
}> {
  const jobId = job.id;
  const { userRequest, options } = job.payload || {};

  if (!userRequest) {
    return { success: false, error: 'Missing userRequest in job payload' };
  }

  try {
    await updateJobProgress(jobId, { percent: 10, message: 'Initializing orchestration system...' });
    await updateJobProgress(jobId, { percent: 20, message: 'Loading agents and context...' });

    const result = await orchestrate(userRequest, options);

    const { error: updateError } = await (supabase.from('system_jobs') as any)
      .update({
        progress: { percent: 100, message: 'Orchestration complete' },
        result: {
          success: result.success,
          finalContent: result.finalContent,
          metadata: result.metadata,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('[orchestrationEngine] Failed to update job result:', updateError);
    }

    return { success: true, result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Orchestration failed';
    try {
      await (supabase.from('system_jobs') as any)
        .update({
          status: 'failed',
          error: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    } catch (persistError) {
      console.error('[orchestrationEngine] Failed to persist job failure:', persistError);
    }
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export { getJobStatus, updateJobProgress };
