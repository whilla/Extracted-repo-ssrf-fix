/**
 * BASE AGENT CLASS
 * Abstract class that all specialized agents extend
 * 
 * Features:
 * - Unique ID and role
 * - Capability set
 * - Performance tracking
 * - Self-optimization method
 * - Execution method
 */

import { kvGet, kvSet } from '../services/puterService';
import type { ViralScore } from '../core/ViralScoringEngine';
import type { Provider } from '../core/ProviderRouter';

// Agent Types
export type AgentRole = 'strategist' | 'writer' | 'hook' | 'critic' | 'optimizer' | 'hybrid' | 'custom';

export type AgentCapability = 
  | 'content_generation'
  | 'hook_creation'
  | 'strategy_planning'
  | 'content_critique'
  | 'optimization'
  | 'engagement_analysis'
  | 'brand_alignment'
  | 'multi_task';

export interface AgentConfig {
  name: string;
  role: AgentRole;
  capabilities: AgentCapability[];
  promptTemplate: string;
  scoringWeights: ScoringWeights;
  optimizationRules: OptimizationRule[];
}

export interface ScoringWeights {
  creativity: number;
  relevance: number;
  engagement: number;
  brandAlignment: number;
}

export interface OptimizationRule {
  condition: string;
  action: string;
  threshold: number;
}

export interface AgentOutput {
  agentId: string;
  agentRole: AgentRole;
  content: string;
  success: boolean;
  error?: string;
  reasoning: string;
  metadata: Record<string, unknown>;
  viralScore?: ViralScore;
}

export interface AgentExecutionContext {
  userInput: string;
  memoryContext: import('../core/MemoryManager').MemoryContext;
  platform: string;
  customInstructions?: string;
  provider: Provider;
  governorFeedback?: string;
  previousContent?: string;
}

export interface PerformanceRecord {
  score: number;
  wasSelected: boolean;
  timestamp: string;
}

export interface AgentState {
  performanceScore: number;
  totalExecutions: number;
  successfulExecutions: number;
  recentScores: number[];
  evolutionVersion: number;
  lastOptimization: string | null;
  optimizationHistory: OptimizationEvent[];
  heartbeatAt: string | null;
  brainState: 'idle' | 'thinking' | 'executing' | 'recovering' | 'healthy' | 'degraded';
  lastDecision: string | null;
  decisionHistory: DecisionEvent[];
}

export interface OptimizationEvent {
  timestamp: string;
  trigger: string;
  action: string;
  beforeScore: number;
  afterScore: number;
}

export interface DecisionEvent {
  timestamp: string;
  summary: string;
  selectedProvider?: string;
  retries?: number;
  outcome: 'started' | 'success' | 'failure' | 'fallback';
}

/**
 * BaseAgent - Abstract Agent Class
 * All specialized agents must extend this class
 */
export abstract class BaseAgent {
  protected id: string;
  protected config: AgentConfig;
  protected state: AgentState;
  protected initialized = false;

  constructor(config: AgentConfig) {
    this.id = `${config.role}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.config = config;
    this.state = {
      performanceScore: 75, // Default starting score
      totalExecutions: 0,
      successfulExecutions: 0,
      recentScores: [],
      evolutionVersion: 1,
      lastOptimization: null,
      optimizationHistory: [],
      heartbeatAt: null,
      brainState: 'idle',
      lastDecision: null,
      decisionHistory: [],
    };
  }

  // ==================== ABSTRACT METHODS ====================

  /**
   * Build the execution prompt - must be implemented by each agent
   */
  protected abstract buildPrompt(context: AgentExecutionContext): string;

  /**
   * Process the raw AI output - can be overridden for custom processing
   */
  protected processOutput(rawOutput: string, context: AgentExecutionContext): string {
    return rawOutput.trim();
  }

  // ==================== CORE METHODS ====================

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load saved state if exists
    const savedState = await this.loadState();
    if (savedState) {
      this.state = { ...this.state, ...savedState };
    }

    this.initialized = true;
  }

  /**
   * Main execution method
   */
  async execute(context: AgentExecutionContext): Promise<AgentOutput> {
    if (!this.initialized) await this.initialize();
    
    const startTime = Date.now();
    this.state.totalExecutions++;
    await this.updateHeartbeat('thinking', `Preparing ${this.config.role} decision`);

    try {
      // Build the prompt
      const prompt = this.buildPrompt(context);
      await this.recordDecision({
        timestamp: new Date().toISOString(),
        summary: `Built prompt for ${this.config.role} using provider ${context.provider.id}`,
        selectedProvider: context.provider.id,
        outcome: 'started',
      });

      // Execute with provider
      await this.updateHeartbeat('executing', `Executing with ${context.provider.id}`);
      const execution = await this.executeProvider(prompt, context.provider);

      // Process output
      const content = this.processOutput(execution.content, context);

      // Validate output
      if (!content || content.length === 0) {
        throw new Error('Agent produced empty output');
      }

      this.state.successfulExecutions++;
      await this.updateHeartbeat('healthy', `Completed with ${execution.providerId}`);
      await this.recordDecision({
        timestamp: new Date().toISOString(),
        summary: `Completed successfully using ${execution.providerId}`,
        selectedProvider: execution.providerId,
        retries: execution.retries,
        outcome: execution.providerId !== context.provider.id ? 'fallback' : 'success',
      });
      const duration = Date.now() - startTime;

      return {
        agentId: this.id,
        agentRole: this.config.role,
        content,
        success: true,
        reasoning: `Generated by ${this.config.name} (v${this.state.evolutionVersion}) in ${duration}ms`,
        metadata: {
          duration,
          promptLength: prompt.length,
          outputLength: content.length,
          evolutionVersion: this.state.evolutionVersion,
          provider: execution.providerId,
          retries: execution.retries,
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.updateHeartbeat('degraded', errorMessage);
      await this.recordDecision({
        timestamp: new Date().toISOString(),
        summary: `Execution failed: ${errorMessage}`,
        selectedProvider: context.provider.id,
        outcome: 'failure',
      });
      
      return {
        agentId: this.id,
        agentRole: this.config.role,
        content: '',
        success: false,
        error: errorMessage,
        reasoning: `Agent ${this.config.name} failed: ${errorMessage}`,
        metadata: {
          duration: Date.now() - startTime,
          evolutionVersion: this.state.evolutionVersion,
        },
      };
    }
  }

  /**
   * Execute with provider
   */
  private async executeProvider(
    prompt: string,
    provider: Provider
  ): Promise<{ content: string; providerId: string; retries: number }> {
    const { ProviderRouter } = await import('../core/ProviderRouter');
    const router = new ProviderRouter();
    await router.initialize();
    const resolvedProvider = router.getProvider(provider.id) || provider;
    const result = await router.executeWithRetry(resolvedProvider, prompt, {
      taskType: 'chat',
      maxRetries: 3,
    });

    if (!result.success || !result.content) {
      throw new Error(result.error || 'Provider execution failed');
    }

    return {
      content: result.content,
      providerId: result.provider,
      retries: result.retries,
    };
  }

  private async updateHeartbeat(
    brainState: AgentState['brainState'],
    lastDecision: string
  ): Promise<void> {
    this.state.heartbeatAt = new Date().toISOString();
    this.state.brainState = brainState;
    this.state.lastDecision = lastDecision;
    await this.saveState();
  }

  private async recordDecision(event: DecisionEvent): Promise<void> {
    this.state.decisionHistory.push(event);
    if (this.state.decisionHistory.length > 25) {
      this.state.decisionHistory = this.state.decisionHistory.slice(-25);
    }
    this.state.lastDecision = event.summary;
    this.state.heartbeatAt = event.timestamp;
    await this.saveState();
  }

  // ==================== PERFORMANCE TRACKING ====================

  /**
   * Record performance after execution
   */
  async recordPerformance(record: PerformanceRecord): Promise<void> {
    this.state.recentScores.push(record.score);
    
    // Keep last 50 scores
    if (this.state.recentScores.length > 50) {
      this.state.recentScores = this.state.recentScores.slice(-50);
    }

    // Update performance score (exponential moving average)
    this.state.performanceScore = 
      this.state.performanceScore * 0.8 + record.score * 0.2;

    // Check if optimization is needed
    await this.checkOptimizationTriggers();

    // Save state
    await this.saveState();
  }

  /**
   * Get performance score
   */
  getPerformanceScore(): number {
    return Math.round(this.state.performanceScore);
  }

  /**
   * Get performance trend
   */
  getPerformanceTrend(): 'improving' | 'stable' | 'declining' {
    if (this.state.recentScores.length < 10) return 'stable';

    const recent = this.state.recentScores.slice(-10);
    const firstHalf = recent.slice(0, 5);
    const secondHalf = recent.slice(5);

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / 5;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / 5;

    if (secondAvg - firstAvg > 5) return 'improving';
    if (firstAvg - secondAvg > 5) return 'declining';
    return 'stable';
  }

  // ==================== SELF-OPTIMIZATION ====================

  /**
   * Check if optimization is needed
   */
  private async checkOptimizationTriggers(): Promise<void> {
    const trend = this.getPerformanceTrend();
    
    // Trigger optimization if declining
    if (trend === 'declining' && this.state.recentScores.length >= 10) {
      await this.selfOptimize();
    }

    // Also optimize if average drops below threshold
    const avgScore = this.state.recentScores.length > 0
      ? this.state.recentScores.reduce((a, b) => a + b, 0) / this.state.recentScores.length
      : this.state.performanceScore;

    if (avgScore < 60 && this.state.recentScores.length >= 5) {
      await this.selfOptimize();
    }
  }

  /**
   * Self-optimization method
   * Modifies internal configuration based on performance analysis
   */
  async selfOptimize(): Promise<void> {
    // Don't optimize too frequently (max once per hour)
    if (this.state.lastOptimization) {
      const lastOpt = new Date(this.state.lastOptimization).getTime();
      if (Date.now() - lastOpt < 60 * 60 * 1000) return;
    }

    const beforeScore = this.state.performanceScore;
    console.log(`[${this.config.name}] Starting self-optimization. Current score: ${beforeScore}`);

    // Analyze weak points
    const weakPoints = this.analyzeWeakPoints();

    // Apply optimization rules
    for (const rule of this.config.optimizationRules) {
      if (weakPoints.includes(rule.condition)) {
        await this.applyOptimization(rule);
      }
    }

    // If no specific rules matched, apply general optimization
    if (weakPoints.length > 0) {
      await this.applyGeneralOptimization(weakPoints);
    }

    // Update evolution version
    this.state.evolutionVersion++;
    this.state.lastOptimization = new Date().toISOString();

    // Record optimization event
    this.state.optimizationHistory.push({
      timestamp: this.state.lastOptimization,
      trigger: weakPoints.join(', ') || 'performance_decline',
      action: 'self_optimization',
      beforeScore,
      afterScore: this.state.performanceScore,
    });

    // Keep last 20 optimization events
    if (this.state.optimizationHistory.length > 20) {
      this.state.optimizationHistory = this.state.optimizationHistory.slice(-20);
    }

    await this.saveState();
    console.log(`[${this.config.name}] Optimization complete. New version: ${this.state.evolutionVersion}`);
  }

  /**
   * Analyze weak points based on recent performance
   */
  private analyzeWeakPoints(): string[] {
    const weakPoints: string[] = [];

    // Check average score
    const avgScore = this.state.recentScores.length > 0
      ? this.state.recentScores.reduce((a, b) => a + b, 0) / this.state.recentScores.length
      : this.state.performanceScore;

    if (avgScore < 65) {
      weakPoints.push('low_score');
    }

    // Check success rate
    const successRate = this.state.totalExecutions > 0
      ? (this.state.successfulExecutions / this.state.totalExecutions) * 100
      : 100;

    if (successRate < 80) {
      weakPoints.push('high_failure_rate');
    }

    // Check trend
    const trend = this.getPerformanceTrend();
    if (trend === 'declining') {
      weakPoints.push('declining_trend');
    }

    // Check score variance
    if (this.state.recentScores.length >= 10) {
      const variance = this.calculateVariance(this.state.recentScores);
      if (variance > 200) {
        weakPoints.push('high_variance');
      }
    }

    return weakPoints;
  }

  /**
   * Calculate variance of scores
   */
  private calculateVariance(scores: number[]): number {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const squareDiffs = scores.map(s => Math.pow(s - mean, 2));
    return squareDiffs.reduce((a, b) => a + b, 0) / scores.length;
  }

  /**
   * Apply specific optimization rule
   */
  private async applyOptimization(rule: OptimizationRule): Promise<void> {
    console.log(`[${this.config.name}] Applying rule: ${rule.action}`);

    switch (rule.action) {
      case 'increase_creativity':
        this.config.scoringWeights.creativity = Math.min(0.4, this.config.scoringWeights.creativity + 0.05);
        break;

      case 'increase_engagement':
        this.config.scoringWeights.engagement = Math.min(0.4, this.config.scoringWeights.engagement + 0.05);
        break;

      case 'enhance_prompt':
        this.enhancePromptTemplate();
        break;

      case 'simplify_prompt':
        this.simplifyPromptTemplate();
        break;

      default:
        // Custom action
        break;
    }
  }

  /**
   * Apply general optimization based on weak points
   */
  private async applyGeneralOptimization(weakPoints: string[]): Promise<void> {
    if (weakPoints.includes('low_score')) {
      // Enhance prompt with quality focus
      this.enhancePromptTemplate();
    }

    if (weakPoints.includes('high_variance')) {
      // Add consistency instructions
      this.config.promptTemplate = this.config.promptTemplate.replace(
        'Input: {{input}}',
        'IMPORTANT: Maintain consistent quality across all outputs.\n\nInput: {{input}}'
      );
    }

    if (weakPoints.includes('declining_trend')) {
      // Reset to more conservative approach
      this.config.scoringWeights = {
        creativity: 0.25,
        relevance: 0.3,
        engagement: 0.25,
        brandAlignment: 0.2,
      };
    }
  }

  /**
   * Enhance prompt template
   */
  private enhancePromptTemplate(): void {
    // Add quality emphasis
    if (!this.config.promptTemplate.includes('QUALITY FOCUS')) {
      this.config.promptTemplate = 
        `QUALITY FOCUS: Every output must be exceptional, engaging, and unique.\n\n${this.config.promptTemplate}`;
    }
  }

  /**
   * Simplify prompt template
   */
  private simplifyPromptTemplate(): void {
    // Remove excessive instructions (keep first 80%)
    const lines = this.config.promptTemplate.split('\n');
    const keepLines = Math.ceil(lines.length * 0.8);
    this.config.promptTemplate = lines.slice(0, keepLines).join('\n');
  }

  // ==================== GETTERS ====================

  getId(): string {
    return this.id;
  }

  getRole(): AgentRole {
    return this.config.role;
  }

  getName(): string {
    return this.config.name;
  }

  getCapabilities(): AgentCapability[] {
    return this.config.capabilities;
  }

  getEvolutionVersion(): number {
    return this.state.evolutionVersion;
  }

  getState(): AgentState {
    return { ...this.state };
  }

  getStats(): {
    id: string;
    name: string;
    role: AgentRole;
    performanceScore: number;
    totalExecutions: number;
    successRate: number;
    trend: string;
    evolutionVersion: number;
    heartbeatAt: string | null;
    brainState: AgentState['brainState'];
    lastDecision: string | null;
  } {
    return {
      id: this.id,
      name: this.config.name,
      role: this.config.role,
      performanceScore: Math.round(this.state.performanceScore),
      totalExecutions: this.state.totalExecutions,
      successRate: this.state.totalExecutions > 0
        ? Math.round((this.state.successfulExecutions / this.state.totalExecutions) * 100)
        : 100,
      trend: this.getPerformanceTrend(),
      evolutionVersion: this.state.evolutionVersion,
      heartbeatAt: this.state.heartbeatAt,
      brainState: this.state.brainState,
      lastDecision: this.state.lastDecision,
    };
  }

  // ==================== PERSISTENCE ====================

  /**
   * Load state from storage
   */
  private async loadState(): Promise<Partial<AgentState> | null> {
    try {
      const data = await kvGet(`agent_state_${this.config.role}`);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  /**
   * Save state to storage
   */
  private async saveState(): Promise<void> {
    try {
      await kvSet(`agent_state_${this.config.role}`, JSON.stringify(this.state));
    } catch {
      console.error(`[${this.config.name}] Failed to save state`);
    }
  }
}
