/**
 * NEXUS AI CORE ENGINE
 * Central orchestration system that coordinates all AI operations
 * 
 * This is the unified core engine replacing the fragmented la-la orchestration services.
 */

import { ProviderRouter, type ProviderResponse } from './ProviderRouter.ts';
import { ViralScoringEngine, type ViralScore } from './ViralScoringEngine.ts';
import { LearningSystem } from './LearningSystem.ts';
import { MemoryManager, type MemoryContext } from './MemoryManager.ts';
import { AgentBlackboard } from './AgentBlackboard.ts';
import { tokenBudgetManager } from '../services/tokenBudgetManager.ts';
import { perceptionService } from '../services/multiModalPerceptionService.ts';
import { trendScoutService } from '../services/trendScoutService.ts';
import { 
  BaseAgent, 
  StrategistAgent, 
  WriterAgent, 
  HookAgent, 
  CriticAgent,
  OptimizerAgent,
  HybridAgent,
  SynthesisAgent,
  VisualCriticAgent,
  type AgentOutput,
  type AgentExecutionContext,
  type OrchestrationPlan,
  type SubTask,
  type AgentRole
} from '../agents/index.ts';
import { GovernorSystem, type GovernorValidation } from './GovernorSystem.ts';
import { 
  initializeAgents, 
  loadAgents, 
  getAgentByRole, 
  executeAgentTask, 
  createOrchestrationPlan,
  selectBestOutput,
  combineOutputs,
  type AgentConfig 
} from '../services/multiAgentService.ts';
import { stateCache } from '../services/stateCache.ts';
import { savePlan, getPlan } from '../services/planStorageService.ts';
import { gatherNexusContext } from '../services/discoveryService.ts';
import { addToApprovalQueue } from '../services/approvalQueueService.ts';
import {
  loadGovernorConfig,
  loadGovernorState,
  validateContent,
  makeGovernorDecision,
  recordCost,
  activateFailsafeMode,
  type GovernorDecision,
  type ContentValidation,
} from '../services/governorService.ts';
import { loadBrandKit } from '../services/memoryService.ts';
import { buildMemoryContext } from '../services/agentMemoryService.ts';
import { universalChat } from '../services/aiService.ts';
import { BrandKit } from '@/lib/validators';

// Core Types
export interface ProductionAsset {
  type: 'image' | 'video' | 'audio' | 'music' | 'document';
  url: string;
  provider: string;
  metadata: Record<string, any>;
  status: 'pending' | 'completed' | 'failed';
}

export interface ProductionBundle {
  text: string;
  assets: ProductionAsset[];
  primaryAsset?: ProductionAsset;
  version: number;
}

export interface NexusRequest {
  userInput: string;
  taskType: 'content' | 'strategy' | 'hook' | 'critique' | 'full' | 'optimize';
  platform?: string;
  customInstructions?: string;
  maxAgents?: number;
  forceProvider?: string;
  fileContext?: string;
  requireApproval?: boolean; // HITL flag
}

export interface ProductionSuite {
  champion: ProductionBundle;
  challengers: ProductionBundle[];
}

export interface NexusResult {
  success: boolean;
  suite: ProductionSuite;
  score: number;
  allOutputs: AgentOutput[];
  selectedAgent: string;
  provider: string;
  governorValidation: GovernorValidation;
  memoryContext: MemoryContext;
  metadata: NexusMetadata;
  output?: string;
}

export interface NexusMetadata {
  totalDuration: number;
  agentsSpawned: number;
  agentsSucceeded: number;
  providersAttempted: string[];
  regenerations: number;
  learningUpdated: boolean;
}

export interface NexusState {
  initialized: boolean;
  activeAgents: Map<string, BaseAgent>;
  providerRouter: ProviderRouter;
  governor: GovernorSystem;
  memoryManager: MemoryManager;
  scoringEngine: ViralScoringEngine;
  learningSystem: LearningSystem;
  totalRequests: number;
  totalSuccesses: number;
  lastError: string | null;
}

export class NexusCore {
  private state: NexusState;
  private static instance: NexusCore | null = null;

  private constructor() {
    this.state = {
      initialized: false,
      activeAgents: new Map(),
      providerRouter: new ProviderRouter(),
      governor: new GovernorSystem(),
      memoryManager: new MemoryManager(),
      scoringEngine: new ViralScoringEngine(),
      learningSystem: new LearningSystem(),
      totalRequests: 0,
      totalSuccesses: 0,
      lastError: null,
    };
  }

  static getInstance(): NexusCore {
    if (!NexusCore.instance) {
      NexusCore.instance = new NexusCore();
    }
    return NexusCore.instance;
  }

  async initialize(): Promise<void> {
    if (this.state.initialized) return;
    await Promise.all([
      this.state.providerRouter.initialize(),
      this.state.governor.initialize(),
      this.state.memoryManager.initialize(),
      this.state.learningSystem.initialize(),
      trendScoutService.initialize(),
    ]);
    this.spawnDefaultAgents();
    this.state.initialized = true;
  }

  private spawnDefaultAgents(): void {
    const agents: BaseAgent[] = [
      new StrategistAgent(),
      new WriterAgent(),
      new HookAgent(),
      new CriticAgent(),
      new OptimizerAgent(),
      new HybridAgent(),
      new SynthesisAgent(),
      new VisualCriticAgent(),
    ];
    agents.forEach(agent => this.state.activeAgents.set(agent.getId(), agent));
  }

  /**
   * Unified entry point for all AI orchestrations.
   * Integrates Plan-based execution and collaborative state.
   */
  async execute(request: NexusRequest): Promise<NexusResult> {
    const startTime = Date.now();
    this.state.totalRequests++;

    if (!this.state.initialized) await this.initialize();

    try {
      const budgetCheck = await tokenBudgetManager.checkBudgetAvailability();
      if (!budgetCheck.allowed) throw new Error(`Budget Blocked: ${budgetCheck.reason}`);

      const brandKit = await loadBrandKit();
      // UPDATED: buildContext now takes a campaignId if available in request (metadata/context)
      const memoryContext = await this.state.memoryManager.buildContext(request.userInput);
      const governorState = await loadGovernorState();

      if (governorState.currentMode === 'failsafe') {
        throw new Error('System is in failsafe mode');
      }

      // DYNAMIC ARCHITECT: Use the PlannerAgent to dynamically design the plan instead of templates
      const plannerAgent = this.state.activeAgents.get('planner_planner') || new HybridAgent();
      const plan = await createOrchestrationPlan(request.userInput, request.taskType as any, plannerAgent);
      let regenerations = 0;
      let finalResult = null;

      while (regenerations < 3) {
        const execution = await this.runPlanExecution(plan, memoryContext, brandKit, request);
        const validation = await this.state.governor.validate(execution.combinedContent, { platform: request.platform });
        
        // VISUAL VALIDATION: If assets were produced, run the Visual Critic
        let visualValidation = { approved: true, feedback: '' };
        if (execution.assets && execution.assets.length > 0) {
          const visualCritic = this.state.activeAgents.get('critic_visual') || new VisualCriticAgent();
          const vContext: AgentExecutionContext = {
            userInput: request.userInput,
            memoryContext,
            platform: request.platform || 'twitter',
            customInstructions: `Analyze these assets: ${execution.assets.map(a => a.url).join(', ')}`,
            provider: await this.state.providerRouter.selectProvider({ taskType: 'content' }),
            blackboard: new AgentBlackboard(plan.id),
          };
          const vOutput = await this.executeAgent(visualCritic, vContext);
          const content = vOutput.content || '';
          const isFailure = !vOutput.success || 
            content.toUpperCase().includes('FAIL') || 
            content.toUpperCase().includes('REJECT') ||
            content.toUpperCase().includes('NEEDS REGENERATION');
          if (isFailure) {
            visualValidation = { approved: false, feedback: content };
          }
        }

        const decision = await makeGovernorDecision(validation, { regenerationCount: regenerations });

        if (decision.approved && visualValidation.approved) {
          finalResult = { content: execution.combinedContent, outputs: execution.outputs, validation, assets: execution.assets };
          break;
        }

        if (decision.action === 'regenerate' || !visualValidation.approved) {
          regenerations++;
          // Trigger partial plan invalidation based on governor feedback
          plan.subtasks.forEach(t => { if(t.status === 'completed') t.status = 'pending'; });
          continue;
        }
        break;
      }
//... (rest of the code)

      const resultContent = finalResult?.content || '';
      const resultOutputs = finalResult?.outputs || [];
      const resultAssets = finalResult?.assets || [];
      const resultValidation = finalResult?.validation || { approved: false, feedback: 'Rejected' };

      // HITL Integration: If approval is required, queue it and return a pending state
      if (request.requireApproval && resultValidation.approved) {
        await addToApprovalQueue({
          content: resultContent,
          platform: request.platform || 'general',
          requestId: plan.id,
          priority: 'high',
          metadata: { score: 0 } // Will be updated after scoring
        });
      }

      const scoredOutputs = await this.scoreOutputs(resultOutputs);
      
      // EMPOWERED SYNTHESIS: Instead of just picking the best, 
      // we use the SynthesisAgent to merge top candidates.
      let finalChampionText = resultContent;
      const synthesisAgent = this.state.activeAgents.get('optimizer_synthesis') || new SynthesisAgent();
      
      if (scoredOutputs.length > 1) {
        // Post the top 3 candidates to the blackboard for the SynthesisAgent
        const blackboard = new AgentBlackboard(plan.id);
        scoredOutputs.slice(0, 3).forEach((out, i) => {
          blackboard.post({
            agentId: out.agentId,
            agentRole: out.agentRole,
            type: 'observation',
            content: `Candidate #${i+1} (Score: ${out.viralScore?.total}): ${out.content}`,
            confidence: 0.9,
          });
        });

        const synthContext: AgentExecutionContext = {
          userInput: request.userInput,
          memoryContext,
          platform: request.platform || 'twitter',
          provider: await this.state.providerRouter.selectProvider({ taskType: 'content' }),
          blackboard,
        };

        const synthOutput = await this.executeAgent(synthesisAgent, synthContext);
        if (synthOutput.success) {
          finalChampionText = synthOutput.content;
        }
      }

      const bestOutput = this.selectBestOutput(scoredOutputs);

      if (resultValidation.approved && bestOutput.viralScore && bestOutput.viralScore.total >= 70) {
        await this.state.learningSystem.recordSuccess(bestOutput, request);
      }

      await this.updateAgentPerformance(scoredOutputs, bestOutput);
      
      await stateCache.flush();

      return {
        success: resultValidation.approved,
        suite: {
          champion: {
            text: finalChampionText,
            assets: [],
            version: 1,
          },
          challengers: scoredOutputs.slice(1, 4).map(out => ({
            text: out.content,
            assets: [],
            version: 1,
          })),
        },
        score: bestOutput.viralScore?.total || 0,
        allOutputs: scoredOutputs,
        selectedAgent: bestOutput.agentId,
        provider: 'unified-core',
        governorValidation: resultValidation,
        memoryContext,
        metadata: {
          totalDuration: Date.now() - startTime,
          agentsSpawned: resultOutputs.length,
          agentsSucceeded: resultOutputs.filter(o => o.success).length,
          providersAttempted: ['unified-core'],
          regenerations,
          learningUpdated: true,
        },
      };
    } catch (error) {
      this.state.lastError = error instanceof Error ? error.message : 'Unknown error';
      return this.createErrorResult(error);
    }
  }

  private async runPlanExecution(plan: OrchestrationPlan, memoryContext: any, brandKit: BrandKit | null, request: NexusRequest) {
    const outputs: AgentOutput[] = [];
    const taskOutputs = new Map<string, AgentOutput>();
    const blackboard = new AgentBlackboard(plan.id);

    for (const group of plan.parallelGroups) {
      const groupTasks = plan.subtasks.filter(t => group.includes(t.id));
      
      // ADAPTIVE ROUTING: Check if previous groups failed or had low confidence
      const previousFailures = plan.subtasks
        .filter(t => !group.includes(t.id) && t.status === 'failed')
        .map(t => t.id);

      const groupResults = await Promise.all(groupTasks.map(async (task) => {
        let attempt = 0;
        const maxSurgicalRetries = 2;

        while (attempt <= maxSurgicalRetries) {
          const agent = await getAgentByRole(task.type as any) || new HybridAgent();
          const surgicalBrand = this.getSurgicalBrandContext(agent.getRole(), brandKit);
          
          const context: AgentExecutionContext = {
            userInput: request.userInput,
            memoryContext,
            platform: request.platform || 'twitter',
            customInstructions: request.customInstructions,
            provider: await this.state.providerRouter.selectProvider({ taskType: 'content' }),
            blackboard,
          };

          // Inject adaptive instructions if previous tasks failed
          if (previousFailures.length > 0 && context.customInstructions) {
            context.customInstructions += `\n\nNote: Some previous pipeline steps failed. Please be extra thorough in your execution of this task.`;
          } else if (previousFailures.length > 0) {
            context.customInstructions = `Note: Some previous pipeline steps failed. Please be extra thorough.`;
          }

          const output = await this.executeAgent(agent, context);
          
          if (output.success) {
            // COLLABORATION STEP: Agent posts result to the blackboard
            blackboard.post({
              agentId: output.agentId,
              agentRole: output.agentRole,
              type: 'observation',
              content: output.content,
              confidence: 0.9,
            });

            taskOutputs.set(task.id, output);
            outputs.push(output);
            task.status = 'completed';
            return output;
          }

          attempt++;
          if (attempt <= maxSurgicalRetries) {
            console.warn(`[SurgicalRetry] Task ${task.id} (${task.type}) failed. Attempt ${attempt}/${maxSurgicalRetries}...`);
            
            // ERROR-AWARE RETRY: Pass the failure reason into the next attempt's instructions
            const failureReason = output.error || 'Unknown execution error';
            if (context.customInstructions) {
              context.customInstructions += `\n\nPREVIOUS ATTEMPT FAILED: ${failureReason}. Please analyze why this failed and correct it in this attempt.`;
            } else {
              context.customInstructions = `PREVIOUS ATTEMPT FAILED: ${failureReason}. Please analyze why this failed and correct it in this attempt.`;
            }
          } else {
            task.status = 'failed';
            taskOutputs.set(task.id, output);
            outputs.push(output);
            return output;
          }
        }
        return null!; // Should not be reached
      }));
    }

    return {
      combinedContent: selectBestOutput(outputs)?.content || '',
      outputs,
      assets: taskOutputs.values()
        .filter(o => o.agentRole === 'visual' && o.success)
        .map(o => ({
          type: 'image' as const,
          url: o.content, // Assuming content is the URL for visual agents
          provider: o.metadata.provider as string || 'unknown',
          metadata: o.metadata,
          status: 'completed' as const,
        })),
    };
  }

  private getSurgicalBrandContext(role: AgentRole, brandKit: BrandKit | null): string {
    if (!brandKit) return '';
    const parts: string[] = [];
    switch (role) {
      case 'planner':
      case 'identity':
        parts.push(`Brand: ${brandKit.brandName}\nNiche: ${brandKit.niche}\nUSP: ${brandKit.uniqueSellingPoint}`);
        break;
      case 'generator':
      case 'writer':
        parts.push(`Tone: ${brandKit.tone}\nUSP: ${brandKit.uniqueSellingPoint}`);
        break;
      default:
        parts.push(`Brand: ${brandKit.brandName}\nTone: ${brandKit.tone}`);
    }
    return parts.join('\n');
  }

  private async executeAgent(agent: BaseAgent, context: AgentExecutionContext): Promise<AgentOutput> {
    try {
      return await agent.execute(context);
    } catch (error) {
      return { agentId: agent.getId(), agentRole: agent.getRole(), content: '', success: false, error: String(error), reasoning: 'Failed', metadata: {} };
    }
  }

  private async scoreOutputs(outputs: AgentOutput[]): Promise<AgentOutput[]> {
    const scored = await Promise.all(outputs.map(async o => ({ ...o, viralScore: await this.state.scoringEngine.score(o.content) })));
    return scored.sort((a, b) => (b.viralScore?.total || 0) - (a.viralScore?.total || 0));
  }

  private selectBestOutput(scoredOutputs: AgentOutput[]): AgentOutput {
    if (scoredOutputs.length === 0) throw new Error('No outputs');
    return scoredOutputs[0];
  }

  private async updateAgentPerformance(all: AgentOutput[], best: AgentOutput) {
    for (const o of all) {
      const agent = this.state.activeAgents.get(o.agentId);
      if (!agent) continue;
      await agent.recordPerformance({ score: o.viralScore?.total || 0, wasSelected: o.agentId === best.agentId, timestamp: new Date().toISOString() });
    }
  }

  private createErrorResult(error: any): NexusResult {
    return {
      success: false,
      suite: {
        champion: { text: '', assets: [], version: 0 },
        challengers: [],
      },
      score: 0,
      allOutputs: [],
      selectedAgent: '',
      provider: 'none',
      governorValidation: { approved: false, score: 0, issues: [], feedback: String(error) },
      memoryContext: {} as any,
      metadata: { totalDuration: 0, agentsSpawned: 0, agentsSucceeded: 0, providersAttempted: [], regenerations: 0, learningUpdated: false },
    };
  }

  // Singleton and State management
  static getInstance(): NexusCore {
    if (!NexusCore.instance) NexusCore.instance = new NexusCore();
    return NexusCore.instance;
  }

  async initialize(): Promise<void> {
    if (this.state.initialized) return;
    await Promise.all([
      this.state.providerRouter.initialize(),
      this.state.governor.initialize(),
      this.state.memoryManager.initialize(),
      this.state.learningSystem.initialize(),
      trendScoutService.initialize(),
    ]);
    this.spawnDefaultAgents();
    this.state.initialized = true;
  }

  private spawnDefaultAgents(): void {
    const agents: BaseAgent[] = [
      new StrategistAgent(),
      new WriterAgent(),
      new HookAgent(),
      new CriticAgent(),
      new OptimizerAgent(),
      new HybridAgent(),
      new SynthesisAgent(),
      new VisualCriticAgent(),
    ];
    agents.forEach(agent => this.state.activeAgents.set(agent.getId(), agent));
  }
}

export const nexusCore = NexusCore.getInstance();
