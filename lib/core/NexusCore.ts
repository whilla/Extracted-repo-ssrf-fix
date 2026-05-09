/**
 * NEXUS AI CORE ENGINE
 * Central orchestration system that coordinates all AI operations
 * 
 * This is the unified core engine replacing the fragmented la-la orchestration services.
 */

import { ProviderRouter, type ProviderResponse } from './ProviderRouter';
import { ViralScoringEngine, type ViralScore } from './ViralScoringEngine';
import { LearningSystem } from './LearningSystem';
import { MemoryManager, type MemoryContext } from './MemoryManager';
import { AgentBlackboard } from './AgentBlackboard';
import { tokenBudgetManager } from '../services/tokenBudgetManager';
import { perceptionService } from '../services/multiModalPerceptionService';
import { trendScoutService } from '../services/trendScoutService';
import { 
  BaseAgent, 
  StrategistAgent, 
  WriterAgent, 
  HookAgent, 
  CriticAgent,
  OptimizerAgent,
  HybridAgent,
  SynthesisAgent,
  type AgentOutput,
  type AgentExecutionContext,
  type OrchestrationPlan,
  type SubTask,
  type AgentRole
} from '../agents';
import { GovernorSystem, type GovernorValidation } from './GovernorSystem';
import { 
  initializeAgents, 
  loadAgents, 
  getAgentByRole, 
  executeAgentTask, 
  createOrchestrationPlan,
  selectBestOutput,
  combineOutputs,
  type AgentConfig 
} from '../services/multiAgentService';
import { savePlan, getPlan } from '../services/planStorageService';
import { gatherNexusContext } from '../services/discoveryService';
import { addToApprovalQueue } from '../services/approvalQueueService';
import {
  loadGovernorConfig,
  loadGovernorState,
  validateContent,
  makeGovernorDecision,
  recordCost,
  activateFailsafeMode,
  type GovernorDecision,
  type ContentValidation,
} from '../services/governorService';
import { loadBrandKit } from '../services/memoryService';
import { buildMemoryContext } from '../services/agentMemoryService';
import { universalChat } from '../services/aiService';
import { BrandKit } from '@/lib/validators';

// Core Types
export interface NexusRequest {
  userInput: string;
  taskType: 'content' | 'strategy' | 'hook' | 'critique' | 'full' | 'optimize';
  platform?: string;
  customInstructions?: string;
  maxAgents?: number;
  forceProvider?: string;
  fileContext?: string;
}

export interface NexusResult {
  success: boolean;
  output: string;
  score: number;
  allOutputs: AgentOutput[];
  selectedAgent: string;
  provider: string;
  governorValidation: GovernorValidation;
  memoryContext: MemoryContext;
  metadata: NexusMetadata;
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
      const memoryContext = await buildMemoryContext();
      const governorState = await loadGovernorState();

      if (governorState.currentMode === 'failsafe') {
        throw new Error('System is in failsafe mode');
      }

      const plan = await createOrchestrationPlan(request.userInput, request.taskType as any);
      let regenerations = 0;
      let finalResult = null;

      while (regenerations < 3) {
        const execution = await this.runPlanExecution(plan, memoryContext, brandKit, request);
        const validation = await this.state.governor.validate(execution.combinedContent, { platform: request.platform });
        const decision = await makeGovernorDecision(validation, { regenerationCount: regenerations });

        if (decision.approved) {
          finalResult = { content: execution.combinedContent, outputs: execution.outputs, validation };
          break;
        }

        if (decision.action === 'regenerate') {
          regenerations++;
          // Trigger partial plan invalidation based on governor feedback
          plan.subtasks.forEach(t => { if(t.status === 'completed') t.status = 'pending'; });
          continue;
        }
        break;
      }

      const resultContent = finalResult?.content || '';
      const resultOutputs = finalResult?.outputs || [];
      const resultValidation = finalResult?.validation || { approved: false, feedback: 'Rejected' };

      const scoredOutputs = await this.scoreOutputs(resultOutputs);
      const bestOutput = this.selectBestOutput(scoredOutputs);

      if (resultValidation.approved && bestOutput.viralScore && bestOutput.viralScore.total >= 70) {
        await this.state.learningSystem.recordSuccess(bestOutput, request);
      }

      await this.updateAgentPerformance(scoredOutputs, bestOutput);

      return {
        success: resultValidation.approved,
        output: resultContent,
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
      const results = await Promise.all(groupTasks.map(async (task) => {
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

        const output = await this.executeAgent(agent, context);
        taskOutputs.set(task.id, output);
        outputs.push(output);
        return output;
      }));
    }

    return {
      combinedContent: selectBestOutput(outputs)?.content || '',
      outputs,
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
      output: '',
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
    const agents = [new StrategistAgent(), new WriterAgent(), new HookAgent(), new CriticAgent(), new OptimizerAgent(), new HybridAgent(), new SynthesisAgent()];
    agents.forEach(a => this.state.activeAgents.set(a.getId(), a));
  }
}

export const nexusCore = NexusCore.getInstance();
