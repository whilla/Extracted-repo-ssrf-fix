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
import { TaskComplexityEvaluator } from './TaskComplexityEvaluator';
import { automationService, type AutomationBlueprint } from '../services/AutomationService';
import { generateImage } from '../services/imageGenerationService';
import { synthesizeVoice } from '../services/voiceService';
import { generateVideo } from '../services/videoGenerationService';
import { generateMusic } from '../services/musicGenerationService';
import { 
  BaseAgent, 
  StrategistAgent, 
  WriterAgent, 
  HookAgent, 
  CriticAgent,
  OptimizerAgent,
  HybridAgent,
  AutomationAgent,
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
  mode?: 'fast' | 'balanced' | 'exhaustive';
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
      new AutomationAgent(),
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
      const complexity = TaskComplexityEvaluator.evaluate(request.userInput, request.taskType);
      
      let agentsToSpawnCount = request.maxAgents || complexity.suggestedAgentCount;
      let shouldSkipCompetition = complexity.skipCompetition;

      // Override based on requested mode
      if (request.mode === 'fast') {
        agentsToSpawnCount = 1;
        shouldSkipCompetition = true;
      } else if (request.mode === 'exhaustive') {
        agentsToSpawnCount = 6; 
        shouldSkipCompetition = false;
      }

      const selectedAgents = this.selectAgentsForTask(request.taskType, agentsToSpawnCount);
      metadata.agentsSpawned = selectedAgents.length;

      // Step 4: Build execution context
      const executionContext: AgentExecutionContext = {
        userInput: request.userInput,
        memoryContext,
        platform: request.platform || 'twitter',
        customInstructions: request.customInstructions,
        provider,
      };

      // Step 5: Execution Path
      let bestOutput: AgentOutput;
      let scoredOutputs: AgentOutput[] = [];
      let governorValidation: GovernorValidation;

      if (request.taskType === 'multimedia') {
        const writer = this.state.activeAgents.get('writer') || new WriterAgent();
        const hybrid = this.state.activeAgents.get('hybrid') || new HybridAgent();
        
        const contentOutput = await this.executeAgent(writer, executionContext);
        if (!contentOutput.success) throw new Error('Multimedia flow failed at content generation');

        const hybridContext = { ...executionContext, previousContent: contentOutput.content };
        const mediaOutput = await this.executeAgent(hybrid, hybridContext);
        if (!mediaOutput.success) throw new Error('Multimedia flow failed at media planning');

        // Parse media requests and generate in parallel
        let mediaRequests = [];
        try {
          mediaRequests = JSON.parse(mediaOutput.content).media_requests || [];
        } catch (e) {
          console.error('[NexusCore] Failed to parse media requests', e);
        }

        const mediaResults = await Promise.all(mediaRequests.map(async (req: any) => {
          try {
            if (req.type === 'image') {
              const img = await generateImage({ prompt: req.prompt, ...req.params });
              return { type: 'image', url: img.url };
            } else if (req.type === 'voiceover') {
              const voice = await synthesizeVoice(req.prompt);
              return { type: 'voiceover', url: voice };
            } else if (req.type === 'music') {
              const music = await generateMusic({ prompt: req.prompt, ...req.params });
              return { type: 'music', url: music.url };
            } else if (req.type === 'video') {
              const video = await generateVideo({ prompt: req.prompt, ...req.params });
              return { type: 'video', url: video.url };
            }
          } catch (e) {
            console.error(`[NexusCore] Media generation failed for ${req.type}:`, e);
            return null;
          }
        }));

        const mediaAssets: Record<string, string | string[]> = {};
        for (const result of mediaResults.filter(Boolean)) {
          const key = result!.type;
          if (mediaAssets[key]) {
            mediaAssets[key] = [].concat(mediaAssets[key] as any, result!.url);
          } else {
            mediaAssets[key] = result!.url;
          }
        }

        bestOutput = {
          ...contentOutput,
          media: mediaAssets,
          viralScore: await this.state.scoringEngine.score(contentOutput.content),
        };
        scoredOutputs = [bestOutput];
        governorValidation = await this.state.governor.validate(bestOutput.content, {
          platform: request.platform,
          taskType: request.taskType,
        });
      } else {
        // Standard Multi-Agent Competition Flow
        const agentPromises = selectedAgents.map(agent => 
          this.executeAgent(agent, executionContext)
        );

        const agentOutputs = await Promise.all(agentPromises);
        const successfulOutputs = agentOutputs.filter(o => o.success);
        metadata.agentsSucceeded = successfulOutputs.length;

        if (successfulOutputs.length === 0) {
          throw new Error('All agents failed to produce output');
        }

        if (shouldSkipCompetition && successfulOutputs.length > 0) {
          const topCandidate = successfulOutputs[0];
          const viralScore = await this.state.scoringEngine.score(topCandidate.content);
          bestOutput = { ...topCandidate, viralScore };
          scoredOutputs = [bestOutput];
        } else {
          scoredOutputs = await this.scoreOutputs(successfulOutputs);
          bestOutput = this.selectBestOutput(scoredOutputs);
        }

        governorValidation = await this.state.governor.validate(bestOutput.content, {
          platform: request.platform,
          taskType: request.taskType,
        });

        while (!governorValidation.approved && metadata.regenerations < 3) {
          metadata.regenerations++;
          const feedbackContext = {
            ...executionContext,
            governorFeedback: governorValidation.feedback,
            previousContent: bestOutput.content,
          };

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

          if (!governorValidation.approved && metadata.regenerations >= 2) {
            const fallbackProvider = await this.state.providerRouter.getFallbackProvider(provider.id);
            if (fallbackProvider) {
              metadata.providersAttempted.push(fallbackProvider.id);
              executionContext.provider = fallbackProvider;
            }
          }
        }
      }

      // Step 9: Update learning system
      if (governorValidation.approved && bestOutput.viralScore && bestOutput.viralScore.total >= 70) {
        await this.state.learningSystem.recordSuccess(bestOutput, request);
        metadata.learningUpdated = true;
      }

      // Step 9.5: Handle Automation Deployment
      if (request.taskType === 'automation' && governorValidation.approved) {
        try {
          const blueprint = JSON.parse(bestOutput.content) as AutomationBlueprint;
          const deployResult = await automationService.deployWorkflow(blueprint);
          if (deployResult.success) {
            bestOutput.metadata.deploymentId = deployResult.externalId;
            bestOutput.metadata.deploymentPlatform = deployResult.platform;
          }
        } catch (e) {
          console.error('[NexusCore] Automation deployment failed:', e);
          // We don't fail the whole request, but we note it in metadata
          bestOutput.metadata.deploymentError = 'Failed to deploy workflow';
        }
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
      automation: ['automation', 'strategist'],
      multimedia: ['writer', 'media'],
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
