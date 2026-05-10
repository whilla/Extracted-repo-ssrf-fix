/**
 * MEMORY MANAGER SERVICE
 * Persistent storage for brand memory, content history, performance logs, and agent logs
 * 
 * Memory Types:
 * - Brand Memory: Brand kit, tone, guidelines
 * - Content History: Past generated content
 * - Performance Logs: Scoring and engagement data
 * - Agent Logs: Agent execution records
 */

import { kvGet, kvSet, readFile, writeFile, PATHS } from '../services/puterService';
import { loadBrandKit, type BrandKit } from '../services/memoryService';

// Memory Types
export interface MemoryContext {
  brandMemory: BrandMemory | null;
  contentHistory: ContentHistoryEntry[];
  performanceLogs: PerformanceLogEntry[];
  agentLogs: AgentLogEntry[];
  campaignContext?: CampaignContext; // NEW: Campaign-level continuity
}

export interface CampaignContext {
  campaignId: string;
  outputs: {
    content: string;
    hooks: string[];
    themes: string[];
    timestamp: string;
  }[];
  constraints: string[];
  globalGoal: string;
}

export interface BrandMemory {
  brandKit: BrandKit | null;
  voiceExamples: string[];
  avoidPatterns: string[];
  successfulHooks: string[];
  preferredCTAs: string[];
  lastUpdated: string;
}

export interface ContentHistoryEntry {
  id: string;
  content: string;
  score: number;
  platform: string;
  timestamp: string;
  wasPublished: boolean;
  engagement?: EngagementMetrics;
}

export interface EngagementMetrics {
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagementRate: number;
}

export interface PerformanceLogEntry {
  id: string;
  contentId: string;
  score: number;
  viralPotential: string;
  predictedEngagement: number;
  actualEngagement?: number;
  timestamp: string;
}

export interface AgentLogEntry {
  id: string;
  agentId: string;
  agentRole: string;
  task: string;
  input: string;
  output: string;
  score: number;
  duration: number;
  wasSelected: boolean;
  timestamp: string;
}

export interface LearningInsight {
  type: 'hook' | 'structure' | 'cta' | 'tone';
  pattern: string;
  successRate: number;
  avgScore: number;
  examples: string[];
}

// Storage Keys
const KEYS = {
  brandMemory: 'nexus_brand_memory',
  contentHistory: 'nexus_content_history',
  performanceLogs: 'nexus_performance_logs',
  agentLogs: 'nexus_agent_logs',
  learningPatterns: 'nexus_learning_patterns',
};

/**
 * MemoryManager Class
 * Manages persistent memory for the NEXUS AI system
 */
export class MemoryManager {
  private brandMemory: BrandMemory | null = null;
  private contentHistory: ContentHistoryEntry[] = [];
  private performanceLogs: PerformanceLogEntry[] = [];
  private agentLogs: AgentLogEntry[] = [];
  private learningPatterns: Map<string, LearningInsight> = new Map();
  private initialized = false;

  // Configuration
  private config = {
    maxContentHistory: 500,
    maxPerformanceLogs: 1000,
    maxAgentLogs: 2000,
    recentContextLimit: 20,
    memoryAgingDays: 30,
  };

  /**
   * Initialize the memory manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[MemoryManager] Initializing...');

    // Load all memory stores in parallel
    await Promise.all([
      this.loadBrandMemory(),
      this.loadContentHistory(),
      this.loadPerformanceLogs(),
      this.loadAgentLogs(),
      this.loadLearningPatterns(),
    ]);

    // Run memory aging
    await this.ageMemory();

    this.initialized = true;
    console.log('[MemoryManager] Initialized with', this.contentHistory.length, 'content entries');
  }

  /**
   * Build context for AI generation
   */
  async buildContext(userInput: string, campaignId?: string): Promise<MemoryContext> {
    if (!this.initialized) await this.initialize();

    // Get recent content for context (avoid repetition)
    const recentContent = this.contentHistory
      .slice(-this.config.recentContextLimit)
      .filter(c => c.score >= 70); // Only high-quality content

    // Get recent performance data
    const recentPerformance = this.performanceLogs
      .slice(-this.config.recentContextLimit);

    // Get recent agent logs for learning
    const recentAgentLogs = this.agentLogs
      .filter(l => l.wasSelected)
      .slice(-50);

    // NEW: Fetch campaign context if campaignId is provided
    let campaignContext: CampaignContext | undefined;
    if (campaignId) {
      const campaignData = await kvGet(`nexus_campaign_${campaignId}`);
      if (campaignData) {
        campaignContext = JSON.parse(campaignData);
      }
    }

    return {
      brandMemory: this.brandMemory,
      contentHistory: recentContent,
      performanceLogs: recentPerformance,
      agentLogs: recentAgentLogs,
      campaignContext,
    };
  }

  /**
   * Get contextual prompt enhancement
   */
  getContextualPrompt(): string {
    if (!this.brandMemory?.brandKit) return '';

    const parts: string[] = [];

    // Brand context
    parts.push(`Brand: ${this.brandMemory.brandKit.brandName}`);
    parts.push(`Tone: ${this.brandMemory.brandKit.tone}`);
    parts.push(`Audience: ${this.brandMemory.brandKit.targetAudience}`);

    // Successful patterns
    if (this.brandMemory.successfulHooks.length > 0) {
      parts.push(`\nSuccessful hook patterns:\n- ${this.brandMemory.successfulHooks.slice(-5).join('\n- ')}`);
    }

    // Patterns to avoid
    if (this.brandMemory.avoidPatterns.length > 0) {
      parts.push(`\nAvoid:\n- ${this.brandMemory.avoidPatterns.slice(-5).join('\n- ')}`);
    }

    // Recent topics to avoid repetition
    const recentTopics = this.contentHistory
      .slice(-10)
      .map(c => c.content.substring(0, 50))
      .filter(Boolean);
    
    if (recentTopics.length > 0) {
      parts.push(`\nRecent topics (avoid repetition):\n- ${recentTopics.join('\n- ')}`);
    }

    return parts.join('\n');
  }

  // ==================== BRAND MEMORY ====================

  /**
   * Load brand memory
   */
  private async loadBrandMemory(): Promise<void> {
    try {
      const data = await kvGet(KEYS.brandMemory);
      if (data) {
        this.brandMemory = JSON.parse(data);
      } else {
        // Initialize from brand kit
        const brandKit = await loadBrandKit();
        this.brandMemory = {
          brandKit,
          voiceExamples: [],
          avoidPatterns: [],
          successfulHooks: [],
          preferredCTAs: [],
          lastUpdated: new Date().toISOString(),
        };
        await this.saveBrandMemory();
      }
    } catch (error) {
      console.error('[MemoryManager] Failed to load brand memory:', error);
    }
  }

  /**
   * Save brand memory
   */
  private async saveBrandMemory(): Promise<void> {
    try {
      await kvSet(KEYS.brandMemory, JSON.stringify(this.brandMemory));
    } catch {
      console.error('[MemoryManager] Failed to save brand memory');
    }
  }

  /**
   * Update brand memory
   */
  async updateBrandMemory(updates: Partial<BrandMemory>): Promise<void> {
    this.brandMemory = {
      ...this.brandMemory,
      ...updates,
      lastUpdated: new Date().toISOString(),
    } as BrandMemory;
    await this.saveBrandMemory();
  }

  /**
   * Add successful hook pattern
   */
  async addSuccessfulHook(hook: string): Promise<void> {
    if (!this.brandMemory) return;
    
    this.brandMemory.successfulHooks.push(hook);
    // Keep last 50
    if (this.brandMemory.successfulHooks.length > 50) {
      this.brandMemory.successfulHooks = this.brandMemory.successfulHooks.slice(-50);
    }
    await this.saveBrandMemory();
  }

  /**
   * Add pattern to avoid
   */
  async addAvoidPattern(pattern: string): Promise<void> {
    if (!this.brandMemory) return;
    
    if (!this.brandMemory.avoidPatterns.includes(pattern)) {
      this.brandMemory.avoidPatterns.push(pattern);
      await this.saveBrandMemory();
    }
  }

  // ==================== CONTENT HISTORY ====================

  /**
   * Load content history
   */
  private async loadContentHistory(): Promise<void> {
    try {
      const data = await kvGet(KEYS.contentHistory);
      this.contentHistory = data ? JSON.parse(data) : [];
    } catch {
      this.contentHistory = [];
    }
  }

  /**
   * Save content history
   */
  private async saveContentHistory(): Promise<void> {
    try {
      await kvSet(KEYS.contentHistory, JSON.stringify(this.contentHistory));
    } catch {
      console.error('[MemoryManager] Failed to save content history');
    }
  }

  /**
   * Add content to history
   */
  async addContent(entry: Omit<ContentHistoryEntry, 'id' | 'timestamp'>): Promise<string> {
    const id = `content_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const fullEntry: ContentHistoryEntry = {
      id,
      ...entry,
      timestamp: new Date().toISOString(),
    };

    this.contentHistory.push(fullEntry);

    // Trim to max
    if (this.contentHistory.length > this.config.maxContentHistory) {
      this.contentHistory = this.contentHistory.slice(-this.config.maxContentHistory);
    }

    await this.saveContentHistory();

    // Learn from high-scoring content
    if (entry.score >= 80) {
      await this.learnFromContent(fullEntry);
    }

    return id;
  }

  /**
   * Update content with engagement metrics
   */
  async updateContentEngagement(contentId: string, metrics: EngagementMetrics): Promise<void> {
    const entry = this.contentHistory.find(c => c.id === contentId);
    if (entry) {
      entry.engagement = metrics;
      await this.saveContentHistory();
    }
  }

  /**
   * Get recent content
   */
  getRecentContent(limit = 20): ContentHistoryEntry[] {
    return this.contentHistory.slice(-limit);
  }

  /**
   * Get high-performing content
   */
  getHighPerformingContent(limit = 20): ContentHistoryEntry[] {
    return this.contentHistory
      .filter(c => c.score >= 80)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ==================== PERFORMANCE LOGS ====================

  /**
   * Load performance logs
   */
  private async loadPerformanceLogs(): Promise<void> {
    try {
      const data = await kvGet(KEYS.performanceLogs);
      this.performanceLogs = data ? JSON.parse(data) : [];
    } catch {
      this.performanceLogs = [];
    }
  }

  /**
   * Save performance logs
   */
  private async savePerformanceLogs(): Promise<void> {
    try {
      await kvSet(KEYS.performanceLogs, JSON.stringify(this.performanceLogs));
    } catch {
      console.error('[MemoryManager] Failed to save performance logs');
    }
  }

  /**
   * Log performance
   */
  async logPerformance(entry: Omit<PerformanceLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const fullEntry: PerformanceLogEntry = {
      id: `perf_${Date.now()}`,
      ...entry,
      timestamp: new Date().toISOString(),
    };

    this.performanceLogs.push(fullEntry);

    // Trim to max
    if (this.performanceLogs.length > this.config.maxPerformanceLogs) {
      this.performanceLogs = this.performanceLogs.slice(-this.config.maxPerformanceLogs);
    }

    await this.savePerformanceLogs();
  }

  /**
   * Get average performance
   */
  getAveragePerformance(days = 7): { avgScore: number; avgEngagement: number } {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const recent = this.performanceLogs.filter(l => 
      new Date(l.timestamp).getTime() > cutoff
    );

    if (recent.length === 0) {
      return { avgScore: 0, avgEngagement: 0 };
    }

    const avgScore = recent.reduce((sum, l) => sum + l.score, 0) / recent.length;
    const avgEngagement = recent.reduce((sum, l) => sum + l.predictedEngagement, 0) / recent.length;

    return { avgScore, avgEngagement };
  }

  // ==================== AGENT LOGS ====================

  /**
   * Load agent logs
   */
  private async loadAgentLogs(): Promise<void> {
    try {
      const data = await kvGet(KEYS.agentLogs);
      this.agentLogs = data ? JSON.parse(data) : [];
    } catch {
      this.agentLogs = [];
    }
  }

  /**
   * Save agent logs
   */
  private async saveAgentLogs(): Promise<void> {
    try {
      await kvSet(KEYS.agentLogs, JSON.stringify(this.agentLogs));
    } catch {
      console.error('[MemoryManager] Failed to save agent logs');
    }
  }

  /**
   * Log agent execution
   */
  async logAgentExecution(entry: Omit<AgentLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const fullEntry: AgentLogEntry = {
      id: `agent_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      ...entry,
      timestamp: new Date().toISOString(),
    };

    this.agentLogs.push(fullEntry);

    // Trim to max
    if (this.agentLogs.length > this.config.maxAgentLogs) {
      this.agentLogs = this.agentLogs.slice(-this.config.maxAgentLogs);
    }

    await this.saveAgentLogs();
  }

  /**
   * Get agent performance stats
   */
  getAgentStats(agentId: string): {
    totalTasks: number;
    avgScore: number;
    selectionRate: number;
    avgDuration: number;
  } {
    const agentEntries = this.agentLogs.filter(l => l.agentId === agentId);
    
    if (agentEntries.length === 0) {
      return { totalTasks: 0, avgScore: 0, selectionRate: 0, avgDuration: 0 };
    }

    const totalTasks = agentEntries.length;
    const avgScore = agentEntries.reduce((sum, l) => sum + l.score, 0) / totalTasks;
    const selectionRate = (agentEntries.filter(l => l.wasSelected).length / totalTasks) * 100;
    const avgDuration = agentEntries.reduce((sum, l) => sum + l.duration, 0) / totalTasks;

    return { totalTasks, avgScore, selectionRate, avgDuration };
  }

  // ==================== LEARNING ====================

  /**
   * Load learning patterns
   */
  private async loadLearningPatterns(): Promise<void> {
    try {
      const data = await kvGet(KEYS.learningPatterns);
      if (data) {
        const patterns = JSON.parse(data);
        this.learningPatterns = new Map(patterns);
      }
    } catch {
      this.learningPatterns = new Map();
    }
  }

  /**
   * Save learning patterns
   */
  private async saveLearningPatterns(): Promise<void> {
    try {
      const patterns = Array.from(this.learningPatterns.entries());
      await kvSet(KEYS.learningPatterns, JSON.stringify(patterns));
    } catch {
      console.error('[MemoryManager] Failed to save learning patterns');
    }
  }

  /**
   * Learn from high-scoring content
   */
  private async learnFromContent(entry: ContentHistoryEntry): Promise<void> {
    // Extract hook (first line)
    const lines = entry.content.split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      const hook = lines[0];
      
      // Learn hook pattern
      const hookKey = `hook_${hook.substring(0, 20).replace(/\s+/g, '_').toLowerCase()}`;
      const existing = this.learningPatterns.get(hookKey);
      
      if (existing) {
        existing.avgScore = (existing.avgScore + entry.score) / 2;
        existing.successRate = Math.min(100, existing.successRate + 5);
        if (!existing.examples.includes(hook)) {
          existing.examples.push(hook);
          if (existing.examples.length > 5) {
            existing.examples = existing.examples.slice(-5);
          }
        }
      } else {
        this.learningPatterns.set(hookKey, {
          type: 'hook',
          pattern: hook.substring(0, 50),
          successRate: 80,
          avgScore: entry.score,
          examples: [hook],
        });
      }

      // Add to successful hooks in brand memory
      await this.addSuccessfulHook(hook);
    }

    await this.saveLearningPatterns();
  }

  /**
   * Get learning insights
   */
  getLearningInsights(): LearningInsight[] {
    return Array.from(this.learningPatterns.values())
      .sort((a, b) => b.avgScore - a.avgScore);
  }

  /**
   * Update campaign memory with a new output
   */
  async updateCampaignMemory(campaignId: string, output: {
    content: string;
    hooks: string[];
    themes: string[];
  }): Promise<void> {
    const campaignData = await kvGet(`nexus_campaign_${campaignId}`);
    const campaign: CampaignContext = campaignData 
      ? JSON.parse(campaignData) 
      : { campaignId, outputs: [], constraints: [], globalGoal: '' };

    campaign.outputs.push({
      content,
      hooks,
      themes,
      timestamp: new Date().toISOString(),
    });

    // Keep last 50 outputs for a campaign
    if (campaign.outputs.length > 50) {
      campaign.outputs = campaign.outputs.slice(-50);
    }

    await kvSet(`nexus_campaign_${campaignId}`, JSON.stringify(campaign));
  }

  /**
   * Age old memory entries
   */
  private async ageMemory(): Promise<void> {
    const cutoffTime = Date.now() - (this.config.memoryAgingDays * 24 * 60 * 60 * 1000);

    // Age content history - keep high performers longer
    this.contentHistory = this.contentHistory.filter(entry => {
      const entryTime = new Date(entry.timestamp).getTime();
      if (entry.score >= 85) return true; // Keep high performers
      return entryTime > cutoffTime;
    });

    // Age performance logs
    this.performanceLogs = this.performanceLogs.filter(entry => {
      const entryTime = new Date(entry.timestamp).getTime();
      return entryTime > cutoffTime;
    });

    // Age agent logs
    this.agentLogs = this.agentLogs.filter(entry => {
      const entryTime = new Date(entry.timestamp).getTime();
      if (entry.wasSelected && entry.score >= 80) return true; // Keep winners
      return entryTime > cutoffTime;
    });

    // Save all
    await Promise.all([
      this.saveContentHistory(),
      this.savePerformanceLogs(),
      this.saveAgentLogs(),
    ]);
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    contentCount: number;
    performanceLogCount: number;
    agentLogCount: number;
    learningPatternCount: number;
    hasBrandMemory: boolean;
  } {
    return {
      contentCount: this.contentHistory.length,
      performanceLogCount: this.performanceLogs.length,
      agentLogCount: this.agentLogs.length,
      learningPatternCount: this.learningPatterns.size,
      hasBrandMemory: this.brandMemory !== null && this.brandMemory.brandKit !== null,
    };
  }

  /**
   * Clear all memory (use with caution)
   */
  async clearAll(): Promise<void> {
    this.brandMemory = null;
    this.contentHistory = [];
    this.performanceLogs = [];
    this.agentLogs = [];
    this.learningPatterns.clear();

    await Promise.all([
      kvSet(KEYS.brandMemory, ''),
      kvSet(KEYS.contentHistory, '[]'),
      kvSet(KEYS.performanceLogs, '[]'),
      kvSet(KEYS.agentLogs, '[]'),
      kvSet(KEYS.learningPatterns, '[]'),
    ]);
  }
}

// Export singleton
export const memoryManager = new MemoryManager();
