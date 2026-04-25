/**
 * AUTOMATION ENGINE
 * Manages automated content generation cycles
 * 
 * Features:
 * - ON/OFF toggle control
 * - Configurable generation intervals
 * - Automatic learning system updates
 * - Rate limiting and safety controls
 * - Output storage and history
 */

import { kvGet, kvSet } from '../services/puterService';
import { publishPost } from '../services/publishService';
import { nexusCore, type NexusRequest, type NexusResult } from './NexusCore';
import { memoryManager } from './MemoryManager';
import { loadAgentMemory, markIdeaUsed, type ContentIdea } from '../services/agentMemoryService';
import { learningSystem } from './LearningSystem';
import type { Platform } from '@/lib/types';
import { generateContent } from '../services/contentEngine';
import {
  trackGenerationFailure,
  trackGenerationStart,
  trackGenerationSuccess,
} from '../services/generationTrackerService';
import { notificationService } from '../services/notificationService';
import { listPublishedContent, loadBrandKit } from '../services/memoryService';
import { runSafetyChecks } from '../services/publishSafetyService';

const VALID_PLATFORMS: Platform[] = [
  'twitter',
  'instagram',
  'tiktok',
  'linkedin',
  'facebook',
  'threads',
  'youtube',
  'pinterest',
];

// Automation Types
export interface AutomationConfig {
  enabled: boolean;
  intervalMinutes: number;
  maxGenerationsPerHour: number;
  minScoreToStore: number;
  platforms: string[];
  taskTypes: string[];
  pauseOnFailure: boolean;
  maxConsecutiveFailures: number;
  autoPublish: boolean;
  requireApproval: boolean;
}

export interface AutomationState {
  isRunning: boolean;
  lastRun: string | null;
  nextRun: string | null;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  consecutiveFailures: number;
  generationsThisHour: number;
  hourStartTime: string;
  pausedReason: string | null;
}

export interface AutomationOutput {
  id: string;
  result: NexusResult;
  request: NexusRequest;
  timestamp: string;
  status: 'pending' | 'approved' | 'rejected' | 'published';
  approvedAt?: string;
  publishedAt?: string;
}

export interface AutomationStats {
  totalGenerations: number;
  successRate: number;
  avgScore: number;
  topPlatform: string;
  lastRunTime: string | null;
  isRunning: boolean;
}

type ContentStrategyPhase = 'audience_building' | 'transition' | 'monetization';

// Storage keys
const KEYS = {
  config: 'nexus_automation_config',
  state: 'nexus_automation_state',
  outputs: 'nexus_automation_outputs',
  queue: 'nexus_automation_queue',
};

/**
 * AutomationEngine Class
 * Controls automated content generation
 */
export class AutomationEngine {
  private config: AutomationConfig;
  private state: AutomationState;
  private outputs: AutomationOutput[] = [];
  private queue: NexusRequest[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private initialized = false;

  private async syncConfigWithMemoryProfile(): Promise<void> {
    const memory = await loadAgentMemory();
    const savedPlatforms = memory.targetPlatforms.filter(
      (platform): platform is Platform => VALID_PLATFORMS.includes(platform as Platform)
    );

    if (savedPlatforms.length > 0) {
      this.config.platforms = savedPlatforms;
    }
  }

  constructor() {
    this.config = {
      enabled: false,
      intervalMinutes: 30,
      maxGenerationsPerHour: 4,
      minScoreToStore: 65,
      platforms: ['twitter', 'linkedin'],
      taskTypes: ['content', 'hook'],
      pauseOnFailure: true,
      maxConsecutiveFailures: 3,
      autoPublish: false,
      requireApproval: true,
    };

    this.state = {
      isRunning: false,
      lastRun: null,
      nextRun: null,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      consecutiveFailures: 0,
      generationsThisHour: 0,
      hourStartTime: new Date().toISOString(),
      pausedReason: null,
    };
  }

  /**
   * Initialize the automation engine
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[AutomationEngine] Initializing...');

    // Load saved config and state
    const savedConfig = await this.loadConfig();
    if (savedConfig) {
      this.config = { ...this.config, ...savedConfig };
    }

    await this.syncConfigWithMemoryProfile();

    const savedState = await this.loadState();
    if (savedState) {
      this.state = { ...this.state, ...savedState };
      // Reset running state on initialization
      this.state.isRunning = false;
    }

    await this.loadOutputs();
    await this.loadQueue();

    // Reset hourly counter if needed
    this.checkHourlyReset();

    this.initialized = true;
    console.log('[AutomationEngine] Initialized');

    // Auto-start if was enabled
    if (this.config.enabled) {
      await this.start();
    }
  }

  // ==================== CONTROL METHODS ====================

  /**
   * Start automation
   */
  async start(): Promise<boolean> {
    if (!this.initialized) await this.initialize();

    if (this.state.isRunning) {
      console.log('[AutomationEngine] Already running');
      return true;
    }

    // Check if paused due to failures
    if (this.state.pausedReason) {
      console.warn('[AutomationEngine] Cannot start - paused:', this.state.pausedReason);
      return false;
    }

    this.config.enabled = true;
    this.state.isRunning = true;
    this.state.pausedReason = null;

    // Schedule next run
    this.scheduleNextRun();

    await this.saveConfig();
    await this.saveState();

    console.log('[AutomationEngine] Started. Next run:', this.state.nextRun);
    return true;
  }

  /**
   * Stop automation
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }

    this.config.enabled = false;
    this.state.isRunning = false;
    this.state.nextRun = null;

    await this.saveConfig();
    await this.saveState();

    console.log('[AutomationEngine] Stopped');
  }

  /**
   * Toggle automation on/off
   */
  async toggle(): Promise<boolean> {
    if (this.state.isRunning) {
      await this.stop();
      return false;
    } else {
      return await this.start();
    }
  }

  /**
   * Reset paused state
   */
  async resume(): Promise<boolean> {
    this.state.pausedReason = null;
    this.state.consecutiveFailures = 0;
    await this.saveState();
    return await this.start();
  }

  // ==================== EXECUTION ====================

  /**
   * Schedule the next run
   */
  private scheduleNextRun(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
    }

    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    const nextRunTime = new Date(Date.now() + intervalMs);
    this.state.nextRun = nextRunTime.toISOString();

    this.intervalId = setTimeout(() => {
      this.runCycle();
    }, intervalMs);
  }

  /**
   * Run a single automation cycle
   */
  async runCycle(): Promise<void> {
    if (!this.state.isRunning) return;

    console.log('[AutomationEngine] Running cycle...');
    let trackedGenerationId: string | null = null;

    // Check hourly limit
    this.checkHourlyReset();
    if (this.state.generationsThisHour >= this.config.maxGenerationsPerHour) {
      console.log('[AutomationEngine] Hourly limit reached, skipping');
      this.scheduleNextRun();
      return;
    }

    this.state.lastRun = new Date().toISOString();
    this.state.totalRuns++;

    try {
      // Get request from queue or generate one
      const request = this.queue.shift() || await this.generateRequest();
      const tracked = await trackGenerationStart({
        source: 'automation',
        taskType: request.taskType,
        idea: `${request.userInput}\n${request.customInstructions || ''}`,
        platforms: request.platform ? [request.platform] : [],
        allowRetryFailed: true,
      });
      trackedGenerationId = tracked.record.id;

      if (tracked.duplicate) {
        console.log('[AutomationEngine] Skipping duplicate generation', tracked.record.id);
        this.state.successfulRuns++;
        this.state.consecutiveFailures = 0;
        await this.saveState();
        if (this.state.isRunning) {
          this.scheduleNextRun();
        }
        return;
      }

      // Execute via NexusCore or local offline fallback
      let result: NexusResult;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const platform = (request.platform as Platform) || 'twitter';
        const offlineContent = await generateContent({
          idea: request.userInput,
          platforms: [platform],
          customInstructions: request.customInstructions,
          includeImage: false,
        });

        result = {
          success: true,
          output: offlineContent.text,
          score: 72,
          allOutputs: [],
          selectedAgent: 'offline-local',
          provider: 'offline-local',
          governorValidation: {
            approved: true,
            score: 72,
            issues: [],
            feedback: 'Approved via offline fallback mode.',
          },
          memoryContext: await memoryManager.buildContext(request.userInput),
          metadata: {
            totalDuration: 0,
            agentsSpawned: 0,
            agentsSucceeded: 1,
            providersAttempted: ['offline-local'],
            regenerations: 0,
            learningUpdated: false,
          },
        };
      } else {
        result = await nexusCore.execute(request);
      }

      // Process result
      await this.processResult(result, request);
      await trackGenerationSuccess(tracked.record.id, {
        artifactId: result.success ? this.outputs[this.outputs.length - 1]?.id : undefined,
        artifactType: result.success ? 'automation_output' : undefined,
      });

      // Update state
      if (result.success) {
        this.state.successfulRuns++;
        this.state.consecutiveFailures = 0;
        void notificationService.notifyContentReady('automation run', tracked.record.id);
      } else {
        this.state.failedRuns++;
        this.state.consecutiveFailures++;
        await trackGenerationFailure(tracked.record.id, 'Automation run did not produce a successful result');
        void notificationService.notifyContentFailed('automation run', 'The generation did not pass validation.');

        // Check for pause condition
        if (this.config.pauseOnFailure && 
            this.state.consecutiveFailures >= this.config.maxConsecutiveFailures) {
          this.state.pausedReason = `${this.state.consecutiveFailures} consecutive failures`;
          await this.stop();
          return;
        }
      }

      this.state.generationsThisHour++;

    } catch (error) {
      console.error('[AutomationEngine] Cycle error:', error);
      this.state.failedRuns++;
      this.state.consecutiveFailures++;
      if (trackedGenerationId) {
        await trackGenerationFailure(
          trackedGenerationId,
          error instanceof Error ? error.message : 'Unexpected automation error'
        );
      }
      void notificationService.notifyContentFailed(
        'automation run',
        error instanceof Error ? error.message : 'Unexpected automation error'
      );
    }

    await this.saveState();
    await this.saveQueue();

    // Schedule next run if still running
    if (this.state.isRunning) {
      this.scheduleNextRun();
    }
  }

  /**
   * Generate a request based on config
   */
  private buildAutopilotBrief(
    memory: Awaited<ReturnType<typeof loadAgentMemory>>,
    adaptiveStrategy: Awaited<ReturnType<typeof learningSystem.getAdaptiveContentStrategy>>,
    strategyPhase: ContentStrategyPhase,
    selectedIdea?: ContentIdea
  ): string {
    const segments: string[] = [];

    if (memory.niche) {
      segments.push(`Primary niche: ${memory.niche}`);
    }
    if (memory.targetAudience) {
      segments.push(`Target audience: ${memory.targetAudience}`);
    }
    if (memory.targetPlatforms.length > 0) {
      segments.push(`Target platforms: ${memory.targetPlatforms.join(', ')}`);
    }
    if (memory.monetizationGoals.length > 0) {
      segments.push(`Monetization goals: ${memory.monetizationGoals.join(', ')}`);
    }
    if (memory.contentPillars.length > 0) {
      segments.push(`Content pillars: ${memory.contentPillars.join(', ')}`);
    }
    if (selectedIdea?.idea) {
      segments.push(`Priority content idea: ${selectedIdea.idea}`);
    } else if (memory.contentIdeas.length > 0) {
      const fallbackIdeas = memory.contentIdeas
        .filter(idea => idea.status === 'new')
        .slice(-3)
        .map(idea => idea.idea);
      if (fallbackIdeas.length > 0) {
        segments.push(`Saved content ideas: ${fallbackIdeas.join(' | ')}`);
      }
    }
    if (adaptiveStrategy.recommendedContentType) {
      segments.push(`Best-performing content type right now: ${adaptiveStrategy.recommendedContentType}`);
    }
    if (adaptiveStrategy.recommendedHookPattern) {
      segments.push(`Best hook pattern: ${adaptiveStrategy.recommendedHookPattern}`);
    }
    if (adaptiveStrategy.recommendedCTA) {
      segments.push(`Best CTA pattern: ${adaptiveStrategy.recommendedCTA}`);
    }
    if (adaptiveStrategy.recommendedStructure) {
      segments.push(`Best structure: ${adaptiveStrategy.recommendedStructure}`);
    }
    if (adaptiveStrategy.emotionalTriggers.length > 0) {
      segments.push(`Winning emotional triggers: ${adaptiveStrategy.emotionalTriggers.join(', ')}`);
    }
    segments.push(`Current content strategy phase: ${strategyPhase}`);
    if (strategyPhase === 'audience_building') {
      segments.push('Primary goal: build trust, attention, saves, shares, and repeat engagement before selling');
    } else if (strategyPhase === 'transition') {
      segments.push('Primary goal: keep leading with value while introducing soft commercial intent naturally');
    } else {
      segments.push('Primary goal: monetize through value-first offers without sounding pushy or low-trust');
    }

    if (segments.length === 0) {
      return 'Generate engaging content for my audience.';
    }

    return `Create platform-native content using this locked operating profile.\n${segments.map(segment => `- ${segment}`).join('\n')}`;
  }

  private async determineContentStrategyPhase(): Promise<ContentStrategyPhase> {
    const [memory, published] = await Promise.all([
      loadAgentMemory(),
      listPublishedContent(),
    ]);

    const monetizationReady = memory.monetizationGoals.length > 0;
    const publishedCount = published.length;

    if (!monetizationReady || publishedCount < 12) {
      return 'audience_building';
    }

    if (publishedCount < 24) {
      return 'transition';
    }

    return 'monetization';
  }

  private async generateRequest(): Promise<NexusRequest> {
    const memory = await loadAgentMemory();
    const memoryPlatforms = memory.targetPlatforms.filter(
      (platform): platform is Platform => VALID_PLATFORMS.includes(platform as Platform)
    );
    const configuredPlatforms = this.config.platforms.filter(
      (platform): platform is Platform => VALID_PLATFORMS.includes(platform as Platform)
    );
    const effectivePlatforms = memoryPlatforms.length > 0
      ? memoryPlatforms
      : configuredPlatforms;

    const sanitizedPlatforms = effectivePlatforms.length > 0 ? effectivePlatforms : ['twitter'];

    // Rotate through platforms and task types
    const platformIndex = this.state.totalRuns % sanitizedPlatforms.length;
    const taskIndex = this.state.totalRuns % this.config.taskTypes.length;
    const selectedIdea = memory.contentIdeas.find(idea => idea.status === 'new');
    const ideaText = selectedIdea?.idea || memory.niche || 'high-conviction platform-native content';
    const platform = sanitizedPlatforms[platformIndex];
    const adaptiveStrategy = await learningSystem.getAdaptiveContentStrategy(platform);
    const strategyPhase = await this.determineContentStrategyPhase();

    return {
      userInput: this.buildAutopilotBrief(memory, adaptiveStrategy, strategyPhase, selectedIdea),
      taskType: this.config.taskTypes[taskIndex] as 'content' | 'hook',
      platform,
      customInstructions: [
        `Focus the deliverable around: ${ideaText}.`,
        'Keep the tone human, direct, and non-robotic.',
        'Optimize for monetizable but policy-safe content.',
        'Do not generate anything harmful, exploitative, unsafe, deceptive, or likely to violate social platform policies.',
        `Target the selected platform first: ${platform}.`,
        `Favor this content type if it fits: ${adaptiveStrategy.recommendedContentType}.`,
        'Open with a stop-scroll hook built on curiosity, tension, or a sharp knowledge gap.',
        strategyPhase === 'audience_building'
          ? 'Prioritize audience growth content only: education, story, proof of understanding, or trust-building. Do not sell yet.'
          : strategyPhase === 'transition'
          ? 'Lead with audience-building value first, then use a light monetization bridge only if it feels natural.'
          : 'Lead with value first, then bridge into monetization with a clear but non-pushy CTA that fits the saved monetization goals.',
        adaptiveStrategy.recommendedHookPattern ? `Use a ${adaptiveStrategy.recommendedHookPattern} hook pattern.` : '',
        adaptiveStrategy.recommendedCTA ? `Prefer a ${adaptiveStrategy.recommendedCTA} CTA style.` : '',
        adaptiveStrategy.recommendedStructure ? `Structure it as ${adaptiveStrategy.recommendedStructure}.` : '',
        adaptiveStrategy.emotionalTriggers.length > 0 ? `Lean into ${adaptiveStrategy.emotionalTriggers.join(', ')} emotional triggers.` : '',
        ...adaptiveStrategy.guidance,
      ].join(' '),
    };
  }

  /**
   * Process generation result
   */
  private async processResult(result: NexusResult, request: NexusRequest): Promise<void> {
    if (!result.success) {
      throw new Error('Automation result was not successful');
    }

    const brandKit = await loadBrandKit();
    const safety = await runSafetyChecks(result.output, request.platform ? [request.platform] : [], brandKit);

    if (!safety.passed) {
      throw new Error(`Safety check failed: ${safety.blockedReasons.join(', ') || 'platform policy risk detected'}`);
    }

    // Only store if meets minimum score
    if (result.success && result.score >= this.config.minScoreToStore) {
      const output: AutomationOutput = {
        id: `auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        result,
        request,
        timestamp: new Date().toISOString(),
        status: this.config.requireApproval ? 'pending' : 'approved',
      };

      this.outputs.push(output);

      // Trim outputs if too many
      if (this.outputs.length > 100) {
        this.outputs = this.outputs.slice(-100);
      }

      await this.saveOutputs();

      // Add to memory
      await memoryManager.addContent({
        content: result.output,
        score: result.score,
        platform: request.platform || 'general',
        wasPublished: false,
      });

      const matchedIdea = await this.findMatchingIdea(request.customInstructions);
      if (matchedIdea) {
        await markIdeaUsed(matchedIdea.id);
      }

      // Auto-publish if enabled and approved
      if (this.config.autoPublish && !this.config.requireApproval) {
        await this.publishOutput(output.id);
      }
    }
  }

  /**
   * Check and reset hourly counter
   */
  private checkHourlyReset(): void {
    const hourStart = new Date(this.state.hourStartTime);
    const now = new Date();

    if (now.getTime() - hourStart.getTime() >= 60 * 60 * 1000) {
      this.state.generationsThisHour = 0;
      this.state.hourStartTime = now.toISOString();
    }
  }

  // ==================== QUEUE MANAGEMENT ====================

  /**
   * Add request to queue
   */
  async addToQueue(request: NexusRequest): Promise<void> {
    this.queue.push(request);
    await this.saveQueue();
  }

  /**
   * Get queue
   */
  getQueue(): NexusRequest[] {
    return [...this.queue];
  }

  /**
   * Clear queue
   */
  async clearQueue(): Promise<void> {
    this.queue = [];
    await this.saveQueue();
  }

  // ==================== OUTPUT MANAGEMENT ====================

  /**
   * Get outputs
   */
  getOutputs(filter?: { status?: string; limit?: number }): AutomationOutput[] {
    let filtered = [...this.outputs];

    if (filter?.status) {
      filtered = filtered.filter(o => o.status === filter.status);
    }

    if (filter?.limit) {
      filtered = filtered.slice(-filter.limit);
    }

    return filtered;
  }

  /**
   * Approve output
   */
  async approveOutput(outputId: string): Promise<boolean> {
    const output = this.outputs.find(o => o.id === outputId);
    if (!output) return false;

    output.status = 'approved';
    output.approvedAt = new Date().toISOString();

    await this.saveOutputs();
    return true;
  }

  /**
   * Reject output
   */
  async rejectOutput(outputId: string): Promise<boolean> {
    const output = this.outputs.find(o => o.id === outputId);
    if (!output) return false;

    output.status = 'rejected';
    await this.saveOutputs();
    return true;
  }

  /**
   * Publish output
   */
  async publishOutput(outputId: string): Promise<boolean> {
    const output = this.outputs.find(o => o.id === outputId);
    if (!output || output.status !== 'approved') return false;

    const platform = (output.request.platform || 'twitter') as Platform;
    const publishResult = await publishPost({
      text: output.result.output,
      platforms: [platform],
    });

    if (!publishResult.success) {
      return false;
    }

    output.status = 'published';
    output.publishedAt = new Date().toISOString();

    await this.saveOutputs();
    return true;
  }

  // ==================== CONFIGURATION ====================

  /**
   * Update configuration
   */
  async updateConfig(updates: Partial<AutomationConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    await this.syncConfigWithMemoryProfile();
    await this.saveConfig();

    // Restart if running and interval changed
    if (this.state.isRunning && updates.intervalMinutes) {
      await this.stop();
      await this.start();
    }
  }

  /**
   * Get configuration
   */
  getConfig(): AutomationConfig {
    return { ...this.config };
  }

  /**
   * Get state
   */
  getState(): AutomationState {
    return { ...this.state };
  }

  /**
   * Get stats
   */
  getStats(): AutomationStats {
    const avgScore = this.outputs.length > 0
      ? this.outputs.reduce((sum, o) => sum + o.result.score, 0) / this.outputs.length
      : 0;

    // Find top platform
    const platformCounts = new Map<string, number>();
    for (const output of this.outputs.filter(o => o.result.success)) {
      const platform = output.request.platform || 'general';
      platformCounts.set(platform, (platformCounts.get(platform) || 0) + 1);
    }
    
    let topPlatform = 'none';
    let maxCount = 0;
    for (const [platform, count] of platformCounts) {
      if (count > maxCount) {
        maxCount = count;
        topPlatform = platform;
      }
    }

    return {
      totalGenerations: this.state.totalRuns,
      successRate: this.state.totalRuns > 0
        ? Math.round((this.state.successfulRuns / this.state.totalRuns) * 100)
        : 100,
      avgScore: Math.round(avgScore),
      topPlatform,
      lastRunTime: this.state.lastRun,
      isRunning: this.state.isRunning,
    };
  }

  // ==================== PERSISTENCE ====================

  private async loadConfig(): Promise<AutomationConfig | null> {
    try {
      const data = await kvGet(KEYS.config);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      await kvSet(KEYS.config, JSON.stringify(this.config));
    } catch {
      console.error('[AutomationEngine] Failed to save config');
    }
  }

  private async loadState(): Promise<AutomationState | null> {
    try {
      const data = await kvGet(KEYS.state);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private async saveState(): Promise<void> {
    try {
      await kvSet(KEYS.state, JSON.stringify(this.state));
    } catch {
      console.error('[AutomationEngine] Failed to save state');
    }
  }

  private async loadOutputs(): Promise<void> {
    try {
      const data = await kvGet(KEYS.outputs);
      this.outputs = data ? JSON.parse(data) : [];
    } catch {
      this.outputs = [];
    }
  }

  private async saveOutputs(): Promise<void> {
    try {
      await kvSet(KEYS.outputs, JSON.stringify(this.outputs));
    } catch {
      console.error('[AutomationEngine] Failed to save outputs');
    }
  }

  private async loadQueue(): Promise<void> {
    try {
      const data = await kvGet(KEYS.queue);
      this.queue = data ? JSON.parse(data) : [];
    } catch {
      this.queue = [];
    }
  }

  private async saveQueue(): Promise<void> {
    try {
      await kvSet(KEYS.queue, JSON.stringify(this.queue));
    } catch {
      console.error('[AutomationEngine] Failed to save queue');
    }
  }

  private async findMatchingIdea(customInstructions?: string): Promise<ContentIdea | null> {
    if (!customInstructions) return null;

    const memory = await loadAgentMemory();
    const normalizedInstructions = customInstructions.toLowerCase();
    return memory.contentIdeas.find(idea => normalizedInstructions.includes(idea.idea.toLowerCase())) || null;
  }
}

// Export singleton
export const automationEngine = new AutomationEngine();
