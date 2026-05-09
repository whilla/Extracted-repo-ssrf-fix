/**
 * NEXUS AI CORE ENGINE
 * Central orchestration system that coordinates all AI operations
 * 
 * Responsibilities:
 * 1. Accept user input
 * 2. Inject memory context
 * 3. Select providers dynamically
 * 4. Spawn multiple agents
 * 5. Run agents in parallel (Promise.all)
 * 6. Collect outputs
 * 7. Score outputs via Viral Scoring Engine
 * 8. Pass through Governor validation
 * 9. Return BEST output only
 */

import { ProviderRouter, type ProviderResponse } from './ProviderRouter';
import { ViralScoringEngine, type ViralScore } from './ViralScoringEngine';
import { LearningSystem } from './LearningSystem';
import { MemoryManager, type MemoryContext } from './MemoryManager';
import { 
  BaseAgent, 
  StrategistAgent, 
  WriterAgent, 
  HookAgent, 
  CriticAgent,
  OptimizerAgent,
  HybridAgent,
  type AgentOutput,
  type AgentExecutionContext 
} from '../agents';
import { GovernorSystem, type GovernorValidation } from './GovernorSystem';

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

/**
 * NexusCore - The Central AI Engine
 */
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

  /**
   * Singleton instance getter
   */
  static getInstance(): NexusCore {
    if (!NexusCore.instance) {
      NexusCore.instance = new NexusCore();
    }
    return NexusCore.instance;
  }

  /**
   * Initialize the core system
   */
  async initialize(): Promise<void> {
    if (this.state.initialized) return;

    console.log('[NexusCore] Initializing system...');

    // Initialize all subsystems in parallel
    await Promise.all([
      this.state.providerRouter.initialize(),
      this.state.governor.initialize(),
      this.state.memoryManager.initialize(),
      this.state.learningSystem.initialize(),
    ]);

    // Initialize default agents
    this.spawnDefaultAgents();

    this.state.initialized = true;
    console.log('[NexusCore] System initialized successfully');
  }

  /**
   * Spawn default agent instances
   */
  private spawnDefaultAgents(): void {
    const agents: BaseAgent[] = [
      new StrategistAgent(),
      new WriterAgent(),
      new HookAgent(),
      new CriticAgent(),
      new OptimizerAgent(),
      new HybridAgent(),
    ];

    agents.forEach(agent => {
      this.state.activeAgents.set(agent.getId(), agent);
    });
  }

  /**
   * Main execution method - orchestrates the entire AI pipeline
   */
  async execute(request: NexusRequest): Promise<NexusResult> {
    const startTime = Date.now();
    this.state.totalRequests++;

    // Ensure initialized
    if (!this.state.initialized) {
      await this.initialize();
    }

    const metadata: NexusMetadata = {
      totalDuration: 0,
      agentsSpawned: 0,
      agentsSucceeded: 0,
      providersAttempted: [],
      regenerations: 0,
      learningUpdated: false,
    };

    try {
      // Step 1: Build memory context
      const memoryContext = await this.state.memoryManager.buildContext(request.userInput);

      // Step 2: Select provider dynamically
      const provider = await this.state.providerRouter.selectProvider({
        taskType: request.taskType,
        forceProvider: request.forceProvider,
      });
      metadata.providersAttempted.push(provider.id);

      // Step 3: Select and spawn agents based on task type
      const selectedAgents = this.selectAgentsForTask(request.taskType, request.maxAgents || 4);
      metadata.agentsSpawned = selectedAgents.length;

      // Step 4: Build execution context
      const executionContext: AgentExecutionContext = {
        userInput: request.userInput,
        memoryContext,
        platform: request.platform || 'twitter',
        customInstructions: request.customInstructions,
        provider,
      };

      // Step 5: Run agents in parallel
      const agentPromises = selectedAgents.map(agent => 
        this.executeAgent(agent, executionContext)
      );

      const agentOutputs = await Promise.all(agentPromises);
      const successfulOutputs = agentOutputs.filter(o => o.success);
      metadata.agentsSucceeded = successfulOutputs.length;

       // Handle no successful outputs with fallback
       if (successfulOutputs.length === 0) {
         console.warn('[NexusCore] All primary agents failed. Attempting fallback to base provider...');
         
          const fallbackProvider = await this.state.providerRouter.getFallbackProvider(provider.id);
          const fallbackOutput = fallbackProvider
            ? await this.executeAgent(new HybridAgent(), executionContext)
            : await this.executeAgent(new WriterAgent(), executionContext);
         
         if (!fallbackOutput.success) {
           throw new Error('All agents and fallbacks failed to produce output');
         }
         
         successfulOutputs.push(fallbackOutput);
         metadata.agentsSucceeded = 1;
       }

      // Step 6: Score all outputs
      const scoredOutputs = await this.scoreOutputs(successfulOutputs);

      // Step 7: Select best output
      let bestOutput = this.selectBestOutput(scoredOutputs);

      // Step 8: Governor validation loop
      let governorValidation = await this.state.governor.validate(bestOutput.content, {
        platform: request.platform,
        taskType: request.taskType,
      });

      // Regeneration loop if governor rejects
      while (!governorValidation.approved && metadata.regenerations < 3) {
        metadata.regenerations++;
        
        // Apply governor feedback and regenerate
        const feedbackContext = {
          ...executionContext,
          governorFeedback: governorValidation.feedback,
          previousContent: bestOutput.content,
        };

        // Use critic agent to improve
        const criticAgent = this.state.activeAgents.get('critic') || new CriticAgent();
        const improvedOutput = await this.executeAgent(criticAgent, feedbackContext);

        if (improvedOutput.success) {
          const scored = await this.scoreOutputs([improvedOutput]);
          bestOutput = scored[0];
          governorValidation = await this.state.governor.validate(bestOutput.content, {
            platform: request.platform,
            taskType: request.taskType,
          });
        }

        // Try provider fallback if still failing
        if (!governorValidation.approved && metadata.regenerations >= 2) {
          const fallbackProvider = await this.state.providerRouter.getFallbackProvider(provider.id);
          if (fallbackProvider) {
            metadata.providersAttempted.push(fallbackProvider.id);
            executionContext.provider = fallbackProvider;
          }
        }
      }

      // Step 9: Update learning system
      if (governorValidation.approved && bestOutput.viralScore && bestOutput.viralScore.total >= 70) {
        await this.state.learningSystem.recordSuccess(bestOutput, request);
        metadata.learningUpdated = true;
      }

      // Step 10: Update agent performance
      await this.updateAgentPerformance(scoredOutputs, bestOutput);

      metadata.totalDuration = Date.now() - startTime;
      this.state.totalSuccesses++;

      return {
        success: governorValidation.approved,
        output: bestOutput.content,
        score: bestOutput.viralScore?.total || 0,
        allOutputs: scoredOutputs,
        selectedAgent: bestOutput.agentId,
        provider: provider.id,
        governorValidation,
        memoryContext,
        metadata,
      };

    } catch (error) {
      metadata.totalDuration = Date.now() - startTime;
      this.state.lastError = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        output: '',
        score: 0,
        allOutputs: [],
        selectedAgent: '',
        provider: metadata.providersAttempted[0] || 'none',
        governorValidation: {
          approved: false,
          score: 0,
          issues: [{ type: 'error', severity: 'critical', message: this.state.lastError }],
          feedback: 'System error occurred',
        },
        memoryContext: { brandMemory: null, contentHistory: [], performanceLogs: [], agentLogs: [] },
        metadata,
      };
    }
  }

  /**
   * Select appropriate agents based on task type
   */
  private selectAgentsForTask(taskType: string, maxAgents: number): BaseAgent[] {
    const allAgents = Array.from(this.state.activeAgents.values());
    
    const taskAgentMap: Record<string, string[]> = {
      content: ['writer', 'hook', 'critic', 'optimizer'],
      strategy: ['strategist', 'critic', 'hybrid'],
      hook: ['hook', 'writer', 'hybrid'],
      critique: ['critic', 'optimizer'],
      full: ['strategist', 'writer', 'hook', 'critic', 'optimizer', 'hybrid'],
      optimize: ['optimizer', 'critic'],
    };

    const requiredRoles = taskAgentMap[taskType] || taskAgentMap.full;
    
    const selectedAgents = allAgents
      .filter(agent => requiredRoles.includes(agent.getRole()))
      .sort((a, b) => b.getPerformanceScore() - a.getPerformanceScore())
      .slice(0, maxAgents);

    return selectedAgents;
  }

  /**
   * Execute a single agent with error handling
   */
  private async executeAgent(
    agent: BaseAgent, 
    context: AgentExecutionContext
  ): Promise<AgentOutput> {
    try {
      const output = await agent.execute(context);
      return output;
    } catch (error) {
      return {
        agentId: agent.getId(),
        agentRole: agent.getRole(),
        content: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        reasoning: 'Agent execution failed',
        metadata: {},
      };
    }
  }

  /**
   * Score all outputs using the Viral Scoring Engine
   */
  private async scoreOutputs(outputs: AgentOutput[]): Promise<AgentOutput[]> {
    const scoredOutputs = await Promise.all(
      outputs.map(async output => {
        const viralScore = await this.state.scoringEngine.score(output.content);
        return { ...output, viralScore };
      })
    );

    return scoredOutputs.sort((a, b) => 
      (b.viralScore?.total || 0) - (a.viralScore?.total || 0)
    );
  }

  /**
   * Select the best output based on viral score and agent performance
   */
  private selectBestOutput(scoredOutputs: AgentOutput[]): AgentOutput {
    if (scoredOutputs.length === 0) {
      throw new Error('No outputs to select from');
    }

    // Top score with agent performance weight
    const weighted = scoredOutputs.map(output => {
      const agent = this.state.activeAgents.get(output.agentId);
      const agentBonus = agent ? agent.getPerformanceScore() * 0.1 : 0;
      return {
        output,
        finalScore: (output.viralScore?.total || 0) + agentBonus,
      };
    });

    weighted.sort((a, b) => b.finalScore - a.finalScore);
    return weighted[0].output;
  }

  /**
   * Update agent performance based on output scores
   */
  private async updateAgentPerformance(
    allOutputs: AgentOutput[], 
    selectedOutput: AgentOutput
  ): Promise<void> {
    for (const output of allOutputs) {
      const agent = this.state.activeAgents.get(output.agentId);
      if (!agent) continue;

      const wasSelected = output.agentId === selectedOutput.agentId;
      const score = output.viralScore?.total || 0;

      await agent.recordPerformance({
        score,
        wasSelected,
        timestamp: new Date().toISOString(),
      });

      // Trigger self-optimization if score is low
      if (score < 60) {
        await agent.selfOptimize();
      }
    }
  }

  /**
   * Get system status
   */
  getStatus(): {
    initialized: boolean;
    agentCount: number;
    totalRequests: number;
    successRate: number;
    lastError: string | null;
  } {
    return {
      initialized: this.state.initialized,
      agentCount: this.state.activeAgents.size,
      totalRequests: this.state.totalRequests,
      successRate: this.state.totalRequests > 0 
        ? (this.state.totalSuccesses / this.state.totalRequests) * 100 
        : 100,
      lastError: this.state.lastError,
    };
  }

  /**
   * Get all active agents
   */
  getAgents(): BaseAgent[] {
    return Array.from(this.state.activeAgents.values());
  }

  /**
   * Add a custom agent
   */
  addAgent(agent: BaseAgent): void {
    this.state.activeAgents.set(agent.getId(), agent);
  }

  /**
   * Remove an agent
   */
  removeAgent(agentId: string): boolean {
    return this.state.activeAgents.delete(agentId);
  }

  /**
   * Get learning insights
   */
  async getLearningInsights() {
    return this.state.learningSystem.getInsights();
  }

  /**
   * Get provider router for external access
   */
  getProviderRouter(): ProviderRouter {
    return this.state.providerRouter;
  }

  /**
   * Get governor system for external access
   */
  getGovernor(): GovernorSystem {
    return this.state.governor;
  }

  /**
   * Get memory manager for external access
   */
  getMemoryManager(): MemoryManager {
    return this.state.memoryManager;
  }

  /**
   * Reset the system state (for testing)
   */
  reset(): void {
    this.state.initialized = false;
    this.state.activeAgents.clear();
    this.state.totalRequests = 0;
    this.state.totalSuccesses = 0;
    this.state.lastError = null;
  }
}

// Export singleton instance
export const nexusCore = NexusCore.getInstance();
