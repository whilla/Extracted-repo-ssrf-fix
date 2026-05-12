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
import {
  trackGenerationFailure,
  trackGenerationPosted,
  trackGenerationStart,
  trackGenerationSuccess,
} from '../services/generationTrackerService';
import { notificationService } from '../services/notificationService';
import { listPublishedContent, loadBrandKit } from '../services/memoryService';
import { runSafetyChecks } from '../services/publishSafetyService';
import { syncPostedEngagements } from '../services/engagementSyncService';
import { healthCheckAllProviders, loadProviderCapabilities } from '../services/providerCapabilityService';

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
  generationId?: string;
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

interface AutomationQueueEntry {
  id: string;
  idempotencyKey: string;
  request: NexusRequest;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string | null;
  lastError?: string;
}

// Storage keys
const KEYS = {
  config: 'nexus_automation_config',
  state: 'nexus_automation_state',
  outputs: 'nexus_automation_outputs',
  queue: 'nexus_automation_queue',
  deadLetters: 'nexus_automation_dead_letters',
};

/**
 * AutomationEngine Class
 * Controls automated content generation
 */
export class AutomationEngine {
  private config: AutomationConfig;
  private state: AutomationState;
  private outputs: AutomationOutput[] = [];
  private queue: AutomationQueueEntry[] = [];
  private deadLetters: AutomationQueueEntry[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private initialized = false;
  private lastProviderHealthCheckAt = 0;
  private lastFailureAlertAt = 0;

  private buildIdempotencyKey(request: NexusRequest): string {
    const normalized = JSON.stringify({
      taskType: request.taskType,
      platform: request.platform || 'general',
      userInput: request.userInput.trim().toLowerCase().replace(/\s+/g, ' '),
      customInstructions: (request.customInstructions || '').trim().toLowerCase().replace(/\s+/g, ' '),
    });

    let hash = 0;
    for (let index = 0; index < normalized.length; index++) {
      hash = ((hash << 5) - hash + normalized.charCodeAt(index)) | 0;
    }

    return `job_${Math.abs(hash).toString(16)}`;
  }

  private createQueueEntry(request: NexusRequest, maxAttempts = 3): AutomationQueueEntry {
    const now = new Date().toISOString();
    return {
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      idempotencyKey: this.buildIdempotencyKey(request),
      request,
      attempts: 0,
      maxAttempts: Math.max(1, maxAttempts),
      createdAt: now,
      updatedAt: now,
      nextAttemptAt: null,
    };
  }

  private getReadyQueueIndex(nowMs = Date.now()): number {
    return this.queue.findIndex((entry) => {
      if (!entry.nextAttemptAt) return true;
      const next = new Date(entry.nextAttemptAt).getTime();
      return Number.isFinite(next) && next <= nowMs;
    });
  }

  private queueRetry(entry: AutomationQueueEntry, errorMessage: string): void {
    entry.attempts += 1;
    entry.lastError = errorMessage;
    entry.updatedAt = new Date().toISOString();

    if (entry.attempts >= entry.maxAttempts) {
      entry.nextAttemptAt = null;
      this.deadLetters.push(entry);
      if (this.deadLetters.length > 200) {
        this.deadLetters = this.deadLetters.slice(-200);
      }
      void notificationService.notifyContentFailed(
        'automation queue job',
        `Moved to dead-letter after ${entry.attempts} attempts: ${errorMessage}`
      );
      return;
    }

    const delayMs = Math.min(30 * 60 * 1000, 60 * 1000 * Math.pow(2, Math.max(0, entry.attempts - 1)));
    entry.nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
    this.queue.push(entry);
  }

  private async ensureProvidersAvailable(): Promise<void> {
    const now = Date.now();
    if (now - this.lastProviderHealthCheckAt < 5 * 60 * 1000) {
      return;
    }
    this.lastProviderHealthCheckAt = now;

    await healthCheckAllProviders();
    const capabilities = await loadProviderCapabilities();
    const active = capabilities.filter((provider) => {
      if (provider.status === 'offline') return false;
      if (provider.requiresApiKey && !provider.apiKeyConfigured) return false;
      return true;
    });

    if (active.length > 0) {
      return;
    }

    this.state.pausedReason = 'No active providers available';
    await this.stop();
    void notificationService.notifySystemStatus(
      'offline',
      'Automation paused because no linked providers are currently available.'
    );
    throw new Error('Automation paused: no active providers available');
  }

  private maybeNotifyFailureRate(): void {
    const now = Date.now();
    if (now - this.lastFailureAlertAt < 30 * 60 * 1000) {
      return;
    }

    if (this.state.totalRuns < 6) {
      return;
    }

    const failureRate = this.state.failedRuns / Math.max(1, this.state.totalRuns);
    if (failureRate >= 0.5) {
      this.lastFailureAlertAt = now;
      void notificationService.notifySystemStatus(
        'offline',
        `Automation failure rate is ${(failureRate * 100).toFixed(0)}% in recent runs. Review providers, prompts, and policy checks before continuing.`
      );
    }
  }

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
      autoPublish: true,
      requireApproval: false,
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
    await this.loadDeadLetters();

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
    let activeQueueEntry: AutomationQueueEntry | null = null;

    // Check agent health - re-initialize if needed
    try {
      const { loadAgents } = await import('../services/multiAgentService.js');
      await loadAgents();
    } catch (error) {
      console.warn('[AutomationEngine] Agent health check skipped:', error);
    }

    // Check provider health before running
    try {
      await this.ensureProvidersAvailable();
    } catch (error) {
      console.error('[AutomationEngine] Provider health check failed:', error);
      this.scheduleNextRun();
      return;
    }

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
      const readyIndex = this.getReadyQueueIndex();
      if (readyIndex >= 0) {
        activeQueueEntry = this.queue.splice(readyIndex, 1)[0];
      } else {
        activeQueueEntry = this.createQueueEntry(await this.generateRequest());
      }

      const request = activeQueueEntry.request;
      await this.ensureProvidersAvailable();
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
        await this.saveQueue();
        await this.saveDeadLetters();
        if (this.state.isRunning) {
          this.scheduleNextRun();
        }
        return;
      }

      // Execute via NexusCore only. Automation should fail clearly when live providers are unavailable.
      let result: NexusResult;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('Automation requires a live network connection and real providers. Reconnect before running automation.');
      } else {
        result = await nexusCore.execute(request);
      }

      // Process result
      await this.processResult(result, request, tracked.record.id);
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
      const errorMessage = error instanceof Error ? error.message : 'Unexpected automation error';
      this.state.failedRuns++;
      this.state.consecutiveFailures++;
      if (trackedGenerationId) {
        await trackGenerationFailure(
          trackedGenerationId,
          errorMessage
        );
      }
      if (activeQueueEntry) {
        this.queueRetry(activeQueueEntry, errorMessage);
      }
      void notificationService.notifyContentFailed(
        'automation run',
        errorMessage
      );
      this.maybeNotifyFailureRate();

      if (
        this.config.pauseOnFailure &&
        this.state.consecutiveFailures >= this.config.maxConsecutiveFailures
      ) {
        this.state.pausedReason = `${this.state.consecutiveFailures} consecutive failures`;
        await this.stop();
      }
    }

    await this.saveState();
    await this.saveQueue();
    await this.saveDeadLetters();

    // Schedule next run if still running
    if (this.state.isRunning) {
      this.scheduleNextRun();
    }

    if (this.state.totalRuns % 3 === 0) {
      void syncPostedEngagements({ limit: 25 }).catch((error) => {
        console.warn('[AutomationEngine] Engagement sync skipped:', error);
      });
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
  private async processResult(result: NexusResult, request: NexusRequest, generationId?: string): Promise<void> {
    if (!result.success) {
      throw new Error('Automation result was not successful');
    }

    const brandKit = await loadBrandKit();
    const safety = await runSafetyChecks(result.output ?? '', request.platform ? [request.platform] : [], brandKit);

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
        generationId,
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
        content: result.output ?? '',
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
    const entry = this.createQueueEntry(request);
    const duplicateIndex = this.queue.findIndex(
      (queued) => queued.idempotencyKey === entry.idempotencyKey
    );
    if (duplicateIndex >= 0) {
      this.queue[duplicateIndex].updatedAt = new Date().toISOString();
      this.queue[duplicateIndex].lastError = undefined;
      this.queue[duplicateIndex].nextAttemptAt = null;
      this.queue[duplicateIndex].request = request;
    } else {
      this.queue.push(entry);
    }
    await this.saveQueue();
  }

  /**
   * Get queue
   */
  getQueue(): NexusRequest[] {
    return this.queue.map((entry) => entry.request);
  }

  getQueueDetails(): Array<{
    id: string;
    request: NexusRequest;
    attempts: number;
    maxAttempts: number;
    nextAttemptAt: string | null;
    lastError?: string;
  }> {
    return this.queue.map((entry) => ({
      id: entry.id,
      request: entry.request,
      attempts: entry.attempts,
      maxAttempts: entry.maxAttempts,
      nextAttemptAt: entry.nextAttemptAt,
      lastError: entry.lastError,
    }));
  }

  getDeadLetters(): Array<{
    id: string;
    request: NexusRequest;
    attempts: number;
    maxAttempts: number;
    lastError?: string;
    updatedAt: string;
  }> {
    return this.deadLetters.map((entry) => ({
      id: entry.id,
      request: entry.request,
      attempts: entry.attempts,
      maxAttempts: entry.maxAttempts,
      lastError: entry.lastError,
      updatedAt: entry.updatedAt,
    }));
  }

  async retryDeadLetter(entryId: string): Promise<boolean> {
    const index = this.deadLetters.findIndex((entry) => entry.id === entryId);
    if (index < 0) return false;

    const entry = this.deadLetters.splice(index, 1)[0];
    entry.attempts = 0;
    entry.lastError = undefined;
    entry.nextAttemptAt = null;
    entry.updatedAt = new Date().toISOString();
    this.queue.push(entry);
    await Promise.all([this.saveQueue(), this.saveDeadLetters()]);
    return true;
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
      text: output.result.output ?? '',
      platforms: [platform],
      source: 'automation',
      generationId: output.generationId,
      automationOutputId: output.id,
    });

    if (!publishResult.success) {
      return false;
    }

    output.status = 'published';
    output.publishedAt = new Date().toISOString();

    await this.saveOutputs();
    if (output.generationId) {
      await trackGenerationPosted(output.generationId, publishResult.postIds);
    }
    void syncPostedEngagements({ limit: 10 }).catch((error) => {
      console.warn('[AutomationEngine] Engagement sync skipped:', error);
    });
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
      if (!data) {
        this.queue = [];
        return;
      }

      const parsed = JSON.parse(data) as unknown;
      if (!Array.isArray(parsed)) {
        this.queue = [];
        return;
      }

      this.queue = parsed
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const candidate = item as Partial<AutomationQueueEntry> & { request?: NexusRequest; userInput?: string };

          if (candidate.request && typeof candidate.request === 'object' && candidate.request.userInput) {
            const normalized: AutomationQueueEntry = {
              id: typeof candidate.id === 'string' ? candidate.id : `queue_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
              idempotencyKey:
                typeof candidate.idempotencyKey === 'string' && candidate.idempotencyKey
                  ? candidate.idempotencyKey
                  : this.buildIdempotencyKey(candidate.request),
              request: candidate.request,
              attempts: Number.isFinite(candidate.attempts) ? Math.max(0, Number(candidate.attempts)) : 0,
              maxAttempts: Number.isFinite(candidate.maxAttempts) ? Math.max(1, Number(candidate.maxAttempts)) : 3,
              createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
              updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
              nextAttemptAt: typeof candidate.nextAttemptAt === 'string' ? candidate.nextAttemptAt : null,
              lastError: typeof candidate.lastError === 'string' ? candidate.lastError : undefined,
            };
            return normalized;
          }

          if (typeof candidate.userInput === 'string') {
            const legacyRequest = candidate as unknown as NexusRequest;
            return this.createQueueEntry(legacyRequest);
          }

          return null;
        })
        .filter((entry): entry is AutomationQueueEntry => Boolean(entry));
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

  private async loadDeadLetters(): Promise<void> {
    try {
      const data = await kvGet(KEYS.deadLetters);
      if (!data) {
        this.deadLetters = [];
        return;
      }
      const parsed = JSON.parse(data);
      this.deadLetters = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.deadLetters = [];
    }
  }

  private async saveDeadLetters(): Promise<void> {
    try {
      await kvSet(KEYS.deadLetters, JSON.stringify(this.deadLetters.slice(-200)));
    } catch {
      console.error('[AutomationEngine] Failed to save dead letters');
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
