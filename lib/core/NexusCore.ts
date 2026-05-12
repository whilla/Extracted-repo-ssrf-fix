/**
 * NEXUS AI CORE ENGINE
 * Central orchestration system that coordinates all AI operations
 * 
 * This is the unified core engine replacing the fragmented la-la orchestration services.
 */

import { ProviderRouter } from './ProviderRouter.ts';
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
  type AgentRole
} from '../agents/index.ts';
import { GovernorSystem, type GovernorValidation } from './GovernorSystem.ts';
import { 
  getAgentByRole, 
  createOrchestrationPlan,
  selectBestOutput,
  type AgentOutput as MultiAgentOutput
} from '../services/multiAgentService.ts';
import { stateCache } from '../services/stateCache.ts';
import { addToApprovalQueue } from '../services/approvalQueueService.ts';
import {
  loadGovernorState,
  makeGovernorDecision
} from '../services/governorService.ts';
import { loadBrandKit } from '../services/memoryService.ts';

export interface ProductionAsset {
  type: 'image' | 'video' | 'audio' | 'music' | 'document';
  url: string;
  provider: string;
  metadata: Record<string, unknown>;
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
  requireApproval?: boolean;
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

export interface NexusStatus {
  isInitialized: boolean;
  activeAgents: number;
  totalRequests: number;
  totalSuccesses: number;
  lastError: string | null;
}

export interface AgentStats {
  id: string;
  name: string;
  role: string;
  performanceScore: number;
  trend: number;
  evolutionVersion: number;
  heartbeatAt: string | null;
  brainState: string;
  lastDecision: string | null;
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

  getAgents(): BaseAgent[] {
    return Array.from(this.state.activeAgents.values());
  }

  getStatus(): NexusStatus {
    return {
      isInitialized: this.state.initialized,
      activeAgents: this.state.activeAgents.size,
      totalRequests: this.state.totalRequests,
      totalSuccesses: this.state.totalSuccesses,
      lastError: this.state.lastError,
    };
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

  async execute(request: NexusRequest): Promise<NexusResult> {
    const startTime = Date.now();
    this.state.totalRequests++;

    if (!this.state.initialized) await this.initialize();

    try {
      const budgetCheck = await tokenBudgetManager.checkBudgetAvailability();
      if (!budgetCheck.allowed) throw new Error(`Budget Blocked: ${budgetCheck.reason}`);

      const brandKit = await loadBrandKit();
      const memoryContext = await this.state.memoryManager.buildContext(request.userInput);

      // Persist custom instructions to long-term memory
      if (request.customInstructions) {
        await this.state.memoryManager.addInstruction(
          request.customInstructions,
          'user',
          'high'
        );
      }
      // Inject remembered instructions into agent context
      const rememberedInstructions = this.state.memoryManager.getActiveInstructions();
      const combinedInstructions = [
        request.customInstructions,
        ...rememberedInstructions.filter(i => i !== request.customInstructions),
      ].filter(Boolean).join('\n');

      const governorState = await loadGovernorState();

      if (governorState.currentMode === 'failsafe') {
        throw new Error('System is in failsafe mode');
      }

      const plannerAgent = this.state.activeAgents.get('planner_planner') || new HybridAgent();
      const plan = await createOrchestrationPlan(request.userInput, request.taskType as any, plannerAgent);
      let regenerations = 0;
      let finalResult: { content: string; outputs: AgentOutput[]; validation: GovernorValidation; assets: ProductionAsset[] } | null = null;

      while (regenerations < 3) {
        const execution = await this.runPlanExecution(plan, memoryContext, brandKit, request, combinedInstructions);
        const validation = await this.state.governor.validate(execution.combinedContent, { platform: request.platform });
        
        const decision = await makeGovernorDecision(validation, { regenerationCount: regenerations });

        if (decision.approved) {
          finalResult = { content: execution.combinedContent, outputs: execution.outputs as unknown as AgentOutput[], validation, assets: execution.assets };
          break;
        }

        if (decision.action === 'regenerate') {
          regenerations++;
          plan.subtasks.forEach(t => { if(t.status === 'completed') t.status = 'pending'; });
          continue;
        }
        break;
      }

      const resultContent = finalResult?.content || '';
      const resultOutputs = finalResult?.outputs || [];
      const resultValidation = finalResult?.validation || { approved: false, feedback: 'Rejected' };

      if (request.requireApproval && resultValidation.approved) {
        await addToApprovalQueue(resultContent, {
          platform: request.platform || 'general',
          requestId: plan.id,
          priority: 'high',
          metadata: { score: 0 }
        });
      }

      const scoredOutputs = await this.scoreOutputs(resultOutputs);
      const bestOutput = scoredOutputs[0] || this.createFallbackOutput();

      return {
        success: resultValidation.approved,
        suite: {
          champion: { text: resultContent, assets: [], version: 1 },
          challengers: scoredOutputs.slice(1, 4).map(out => ({ text: out.content, assets: [], version: 1 })),
        },
        score: bestOutput.viralScore?.total || 0,
        allOutputs: scoredOutputs,
        selectedAgent: bestOutput.agentId,
        provider: 'unified-core',
        governorValidation: resultValidation as GovernorValidation,
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

  private createFallbackOutput(): AgentOutput {
    return {
      agentId: 'fallback',
      agentRole: 'hybrid',
      content: '',
      success: false,
      error: 'No outputs generated',
      reasoning: 'Fallback due to execution failure',
      metadata: {},
    };
  }

  private async runPlanExecution(plan: any, memoryContext: any, brandKit: any, request: NexusRequest, combinedInstructions?: string) {
    const outputs: AgentOutput[] = [];
    const taskOutputs = new Map<string, AgentOutput>();
    const blackboard = new AgentBlackboard(plan.id);

    for (const group of plan.parallelGroups) {
      const groupTasks = plan.subtasks.filter((t: any) => group.includes(t.id));

      const groupResults = await Promise.all(groupTasks.map(async (task: any) => {
        let attempt = 0;
        const maxSurgicalRetries = 2;

        while (attempt <= maxSurgicalRetries) {
          const agent = await getAgentByRole(task.type as any) || new HybridAgent();
          
          const context: AgentExecutionContext = {
            userInput: request.userInput,
            memoryContext,
            platform: request.platform || 'twitter',
            customInstructions: combinedInstructions || request.customInstructions,
            provider: await this.state.providerRouter.selectProvider({ taskType: 'content' }),
            blackboard,
          };

          const output = await this.executeAgent(agent, context);
          
          if (output.success) {
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
            const failureReason = output.error || 'Unknown execution error';
            context.customInstructions = context.customInstructions
              ? `${context.customInstructions}\n\nPREVIOUS ATTEMPT FAILED: ${failureReason}. Please correct.`
              : `PREVIOUS ATTEMPT FAILED: ${failureReason}. Please correct.`;
          } else {
            task.status = 'failed';
            taskOutputs.set(task.id, output);
            outputs.push(output);
            return output;
          }
        }
        
        return {
          agentId: 'unknown',
          agentRole: 'hybrid' as AgentRole,
          content: '',
          success: false,
          error: 'Max retries exceeded',
          reasoning: 'Agent execution failed after all retry attempts',
          metadata: {},
        };
      }));
    }

    return {
      combinedContent: selectBestOutput(outputs as unknown as MultiAgentOutput[])?.content || '',
      outputs: outputs as unknown as MultiAgentOutput[],
      assets: Array.from(taskOutputs.values())
        .filter(o => (o.agentRole as string) === 'visual' && o.success)
        .map(o => ({
          type: 'image' as const,
          url: o.content,
          provider: o.metadata?.provider as string || 'unknown',
          metadata: o.metadata ?? {},
          status: 'completed' as const,
        })),
    };
  }

  private async executeAgent(agent: BaseAgent, context: AgentExecutionContext): Promise<AgentOutput> {
    try {
      return await agent.execute(context);
    } catch (error) {
      return { 
        agentId: agent.getId(), 
        agentRole: agent.getRole(), 
        content: '', 
        success: false, 
        error: String(error), 
        reasoning: 'Failed', 
        metadata: {} 
      };
    }
  }

  private async scoreOutputs(outputs: AgentOutput[]): Promise<AgentOutput[]> {
    const scored = await Promise.all(outputs.map(async o => ({ 
      ...o, 
      viralScore: await this.state.scoringEngine.score(o.content) 
    })));
    return scored.sort((a, b) => (b.viralScore?.total || 0) - (a.viralScore?.total || 0));
  }

  private createErrorResult(error: unknown): NexusResult {
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
      memoryContext: {} as MemoryContext,
      metadata: { totalDuration: 0, agentsSpawned: 0, agentsSucceeded: 0, providersAttempted: [], regenerations: 0, learningUpdated: false },
    };
  }
}

export const nexusCore = NexusCore.getInstance();
