/**
 * LEARNING SYSTEM
 * Tracks high-scoring outputs, extracts patterns, and influences future agent behavior
 * 
 * Responsibilities:
 * - Record successful content patterns
 * - Extract winning strategies
 * - Provide learned insights to agents
 * - Track what works and what doesn't
 */

import { kvGet, kvSet } from '../services/puterService';
import type { AgentOutput } from '../agents';
import type { NexusRequest } from './NexusCore';
import type { ViralScore } from './ViralScoringEngine';

// Learning Types
export interface LearnedPattern {
  id: string;
  type: PatternType;
  pattern: string;
  frequency: number;
  avgScore: number;
  examples: string[];
  firstSeen: string;
  lastSeen: string;
  platformSuccess: Record<string, number>;
}

export type PatternType = 
  | 'hook_pattern'
  | 'cta_pattern'
  | 'structure_pattern'
  | 'emotional_trigger'
  | 'word_choice'
  | 'format_pattern'
  | 'content_type';

export interface SuccessRecord {
  id: string;
  content: string;
  score: number;
  agentId: string;
  platform: string;
  taskType: string;
  timestamp: string;
  patterns: string[];
  viralScore?: ViralScore;
}

export interface LearningInsight {
  topPatterns: LearnedPattern[];
  bestPerformingAgent: string;
  avgSuccessScore: number;
  totalSuccesses: number;
  recommendations: string[];
}

export interface PatternAnalysis {
  hookPatterns: string[];
  ctaPatterns: string[];
  emotionalTriggers: string[];
  effectiveStructures: string[];
  contentTypes: string[];
}

export interface AdaptiveContentStrategy {
  platform?: string;
  recommendedContentType: string;
  recommendedHookPattern?: string;
  recommendedCTA?: string;
  recommendedStructure?: string;
  emotionalTriggers: string[];
  guidance: string[];
}

// Storage keys
const KEYS = {
  patterns: 'nexus_learned_patterns',
  successes: 'nexus_success_records',
  insights: 'nexus_learning_insights',
};

/**
 * LearningSystem Class
 * Implements pattern learning from successful outputs
 */
export class LearningSystem {
  private patterns: Map<string, LearnedPattern> = new Map();
  private successes: SuccessRecord[] = [];
  private initialized = false;

  private config = {
    minScoreToLearn: 70,
    maxSuccessRecords: 500,
    maxPatterns: 200,
    patternDecayDays: 60,
    minPatternFrequency: 3,
  };

  /**
   * Initialize the learning system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[LearningSystem] Initializing...');

    await Promise.all([
      this.loadPatterns(),
      this.loadSuccesses(),
    ]);

    // Run pattern analysis on existing data
    await this.analyzePatterns();

    this.initialized = true;
    console.log('[LearningSystem] Initialized with', this.patterns.size, 'patterns');
  }

  /**
   * Record a successful output for learning
   */
  async recordSuccess(output: AgentOutput, request: NexusRequest): Promise<void> {
    if (!this.initialized) await this.initialize();

    // Only learn from high-scoring content
    const score = output.viralScore?.total || 0;
    if (score < this.config.minScoreToLearn) return;

    // Extract patterns from the content
    const extractedPatterns = this.extractPatterns(output.content);

    const record: SuccessRecord = {
      id: `success_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      content: output.content,
      score,
      agentId: output.agentId,
      platform: request.platform || 'general',
      taskType: request.taskType,
      timestamp: new Date().toISOString(),
      patterns: extractedPatterns,
      viralScore: output.viralScore,
    };

    this.successes.push(record);

    // Trim if needed
    if (this.successes.length > this.config.maxSuccessRecords) {
      this.successes = this.successes.slice(-this.config.maxSuccessRecords);
    }

    // Update patterns
    await this.updatePatterns(record);

    await this.saveSuccesses();
    await this.savePatterns();
  }

  /**
   * Extract patterns from successful content
   */
  private extractPatterns(content: string): string[] {
    const patterns: string[] = [];
    const lines = content.split('\n').filter(l => l.trim());

    if (lines.length === 0) return patterns;

    // Hook pattern (first line structure)
    const hook = lines[0];
    const hookPattern = this.categorizeHook(hook);
    if (hookPattern) patterns.push(`hook:${hookPattern}`);

    // CTA pattern
    const ctaPattern = this.extractCTAPattern(content);
    if (ctaPattern) patterns.push(`cta:${ctaPattern}`);

    // Structure pattern
    const structurePattern = this.categorizeStructure(lines);
    patterns.push(`structure:${structurePattern}`);

    // Content type / archetype
    const contentType = this.categorizeContentType(content);
    patterns.push(`content_type:${contentType}`);

    // Emotional triggers
    const emotions = this.extractEmotionalTriggers(content);
    emotions.forEach(e => patterns.push(`emotion:${e}`));

    return patterns;
  }

  /**
   * Categorize hook pattern
   */
  private categorizeHook(hook: string): string | null {
    const hookLower = hook.toLowerCase();

    // Pattern categories
    if (/^\d+\s+(things?|ways?|reasons?|tips?|secrets?)/.test(hookLower)) {
      return 'numbered_list';
    }
    if (/^(stop|wait|attention|breaking)/.test(hookLower)) {
      return 'interrupt';
    }
    if (/^(the|a) (secret|truth|reason)/.test(hookLower)) {
      return 'revelation';
    }
    if (/^(most people|nobody|everyone)/.test(hookLower)) {
      return 'social_proof';
    }
    if (/\?$/.test(hook)) {
      return 'question';
    }
    if (/^(i|we) (never|always|finally|just)/.test(hookLower)) {
      return 'personal_story';
    }
    if (/^(unpopular opinion|hot take|confession)/.test(hookLower)) {
      return 'controversial';
    }
    if (/!$/.test(hook)) {
      return 'exclamation';
    }

    return null;
  }

  /**
   * Extract CTA pattern
   */
  private extractCTAPattern(content: string): string | null {
    const contentLower = content.toLowerCase();

    if (/follow\s+(me|for)/.test(contentLower)) return 'follow';
    if (/comment\s+(below|with)/.test(contentLower)) return 'comment';
    if (/share\s+(this|with)/.test(contentLower)) return 'share';
    if (/save\s+(this|for)/.test(contentLower)) return 'save';
    if (/what do you think/.test(contentLower)) return 'opinion_ask';
    if (/agree\s*\?/.test(contentLower)) return 'agreement';
    if (/dm\s+me/.test(contentLower)) return 'dm';
    if (/link\s+in\s+bio/.test(contentLower)) return 'link_bio';

    return null;
  }

  /**
   * Categorize content structure
   */
  private categorizeStructure(lines: string[]): string {
    if (lines.length === 1) return 'single_line';
    if (lines.length <= 3) return 'short';
    if (lines.length <= 6) return 'medium';
    return 'long';
  }

  /**
   * Categorize overall content archetype
   */
  private categorizeContentType(content: string): string {
    const normalized = content.toLowerCase();
    const firstLine = content.split('\n').find(line => line.trim())?.toLowerCase() || '';

    if (/^\d+\s+(things?|ways?|lessons?|tips?|mistakes?|reasons?)/.test(firstLine)) {
      return 'listicle';
    }
    if (/(how to|step by step|here's how|do this)/.test(normalized)) {
      return 'tutorial';
    }
    if (/(i learned|i used to|i was wrong|my story|when i|i realized)/.test(normalized)) {
      return 'storytelling';
    }
    if (/(unpopular opinion|hot take|most people are wrong|stop doing)/.test(normalized)) {
      return 'contrarian';
    }
    if (/(mistake|avoid this|don't do this|warning)/.test(normalized)) {
      return 'mistake_avoidance';
    }
    if (/(myth|truth|what nobody tells you|secret)/.test(normalized)) {
      return 'myth_busting';
    }
    if (/\?/.test(firstLine)) {
      return 'question_led';
    }

    return 'insight';
  }

  /**
   * Extract emotional triggers
   */
  private extractEmotionalTriggers(content: string): string[] {
    const triggers: string[] = [];
    const contentLower = content.toLowerCase();

    const triggerMap: Record<string, string> = {
      'surprising': 'surprise',
      'shocking': 'shock',
      'unbelievable': 'disbelief',
      'amazing': 'amazement',
      'secret': 'curiosity',
      'exclusive': 'exclusivity',
      'limited': 'scarcity',
      'free': 'value',
      'mistake': 'fear',
      'avoid': 'caution',
      'proven': 'trust',
    };

    for (const [word, trigger] of Object.entries(triggerMap)) {
      if (contentLower.includes(word) && !triggers.includes(trigger)) {
        triggers.push(trigger);
      }
    }

    return triggers.slice(0, 3); // Max 3 triggers per content
  }

  /**
   * Update patterns with new success
   */
  private async updatePatterns(record: SuccessRecord): Promise<void> {
    for (const patternKey of record.patterns) {
      const existing = this.patterns.get(patternKey);

      if (existing) {
        // Update existing pattern
        existing.frequency++;
        existing.avgScore = (existing.avgScore * (existing.frequency - 1) + record.score) / existing.frequency;
        existing.lastSeen = record.timestamp;
        
        // Add example
        if (!existing.examples.includes(record.content.substring(0, 100))) {
          existing.examples.push(record.content.substring(0, 100));
          if (existing.examples.length > 5) {
            existing.examples = existing.examples.slice(-5);
          }
        }

        // Track platform success
        existing.platformSuccess[record.platform] = 
          (existing.platformSuccess[record.platform] || 0) + 1;
      } else {
        // Create new pattern
        const [type, pattern] = patternKey.split(':');
        
        this.patterns.set(patternKey, {
          id: patternKey,
          type: type as PatternType,
          pattern,
          frequency: 1,
          avgScore: record.score,
          examples: [record.content.substring(0, 100)],
          firstSeen: record.timestamp,
          lastSeen: record.timestamp,
          platformSuccess: { [record.platform]: 1 },
        });
      }
    }

    // Trim patterns if needed
    if (this.patterns.size > this.config.maxPatterns) {
      // Remove least frequent patterns
      const sorted = Array.from(this.patterns.entries())
        .sort((a, b) => a[1].frequency - b[1].frequency);
      
      const toRemove = sorted.slice(0, this.patterns.size - this.config.maxPatterns);
      toRemove.forEach(([key]) => this.patterns.delete(key));
    }
  }

  /**
   * Analyze patterns periodically
   */
  private async analyzePatterns(): Promise<void> {
    // Decay old patterns
    const now = Date.now();
    const decayThreshold = this.config.patternDecayDays * 24 * 60 * 60 * 1000;

    for (const [key, pattern] of this.patterns) {
      const lastSeenTime = new Date(pattern.lastSeen).getTime();
      if (now - lastSeenTime > decayThreshold) {
        // Decay frequency
        pattern.frequency = Math.max(1, Math.floor(pattern.frequency * 0.5));
        
        // Remove if too low
        if (pattern.frequency < this.config.minPatternFrequency) {
          this.patterns.delete(key);
        }
      }
    }
  }

  /**
   * Get learning insights
   */
  async getInsights(): Promise<LearningInsight> {
    if (!this.initialized) await this.initialize();

    // Get top patterns by score
    const topPatterns = Array.from(this.patterns.values())
      .filter(p => p.frequency >= this.config.minPatternFrequency)
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10);

    // Find best performing agent
    const agentScores = new Map<string, { total: number; count: number }>();
    for (const success of this.successes) {
      const current = agentScores.get(success.agentId) || { total: 0, count: 0 };
      current.total += success.score;
      current.count++;
      agentScores.set(success.agentId, current);
    }

    let bestAgent = 'none';
    let bestAvg = 0;
    for (const [agentId, stats] of agentScores) {
      const avg = stats.total / stats.count;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestAgent = agentId;
      }
    }

    // Calculate average success score
    const avgScore = this.successes.length > 0
      ? this.successes.reduce((sum, s) => sum + s.score, 0) / this.successes.length
      : 0;

    // Generate recommendations
    const recommendations = this.generateRecommendations(topPatterns);

    return {
      topPatterns,
      bestPerformingAgent: bestAgent,
      avgSuccessScore: Math.round(avgScore),
      totalSuccesses: this.successes.length,
      recommendations,
    };
  }

  /**
   * Generate recommendations based on patterns
   */
  private generateRecommendations(topPatterns: LearnedPattern[]): string[] {
    const recommendations: string[] = [];

    // Hook recommendations
    const hookPatterns = topPatterns.filter(p => p.type === 'hook_pattern');
    if (hookPatterns.length > 0) {
      const topHook = hookPatterns[0];
      recommendations.push(`Use "${topHook.pattern}" hook patterns (avg score: ${Math.round(topHook.avgScore)})`);
    }

    // CTA recommendations
    const ctaPatterns = topPatterns.filter(p => p.type === 'cta_pattern');
    if (ctaPatterns.length > 0) {
      const topCTA = ctaPatterns[0];
      recommendations.push(`"${topCTA.pattern}" CTAs perform best`);
    }

    // Emotional trigger recommendations
    const emotionPatterns = topPatterns.filter(p => p.type === 'emotional_trigger');
    if (emotionPatterns.length >= 2) {
      const topEmotions = emotionPatterns.slice(0, 2).map(p => p.pattern);
      recommendations.push(`Use ${topEmotions.join(' and ')} emotional triggers`);
    }

    // Structure recommendations
    const structurePatterns = topPatterns.filter(p => p.type === 'structure_pattern');
    if (structurePatterns.length > 0) {
      const topStructure = structurePatterns[0];
      recommendations.push(`${topStructure.pattern} content length performs well`);
    }

    // Default recommendation
    if (recommendations.length === 0) {
      recommendations.push('Keep creating content to build learning data');
    }

    return recommendations;
  }

  /**
   * Get pattern analysis for a platform
   */
  getPatternAnalysis(platform?: string): PatternAnalysis {
    const filterByPlatform = (p: LearnedPattern) => {
      if (!platform) return true;
      return (p.platformSuccess[platform] || 0) > 0;
    };

    const patterns = Array.from(this.patterns.values()).filter(filterByPlatform);

    return {
      hookPatterns: patterns
        .filter(p => p.type === 'hook_pattern')
        .sort((a, b) => b.avgScore - a.avgScore)
        .slice(0, 5)
        .map(p => p.pattern),
      ctaPatterns: patterns
        .filter(p => p.type === 'cta_pattern')
        .sort((a, b) => b.avgScore - a.avgScore)
        .slice(0, 5)
        .map(p => p.pattern),
      emotionalTriggers: patterns
        .filter(p => p.type === 'emotional_trigger')
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 5)
        .map(p => p.pattern),
      effectiveStructures: patterns
        .filter(p => p.type === 'structure_pattern')
        .sort((a, b) => b.avgScore - a.avgScore)
        .slice(0, 3)
        .map(p => p.pattern),
      contentTypes: patterns
        .filter(p => p.type === 'content_type')
        .sort((a, b) => b.avgScore - a.avgScore)
        .slice(0, 5)
        .map(p => p.pattern),
    };
  }

  /**
   * Build an adaptive strategy from learned viral and high-engagement patterns
   */
  async getAdaptiveContentStrategy(platform?: string): Promise<AdaptiveContentStrategy> {
    if (!this.initialized) await this.initialize();

    const analysis = this.getPatternAnalysis(platform);
    const topPatterns = Array.from(this.patterns.values())
      .filter(pattern => {
        if (!platform) return true;
        return (pattern.platformSuccess[platform] || 0) > 0;
      })
      .sort((a, b) => b.avgScore - a.avgScore);

    const topContentType = analysis.contentTypes[0] || 'insight';
    const topHook = analysis.hookPatterns[0];
    const topCTA = analysis.ctaPatterns[0];
    const topStructure = analysis.effectiveStructures[0];
    const emotionalTriggers = analysis.emotionalTriggers.slice(0, 3);

    const guidance: string[] = [
      `Bias toward ${topContentType} content because it has the strongest recent engagement profile.`,
    ];

    if (topHook) {
      guidance.push(`Open with a ${topHook} hook.`);
    }
    if (topStructure) {
      guidance.push(`Use a ${topStructure} structure.`);
    }
    if (topCTA) {
      guidance.push(`End with a ${topCTA} style CTA when natural.`);
    }
    if (emotionalTriggers.length > 0) {
      guidance.push(`Lean on these emotional triggers: ${emotionalTriggers.join(', ')}.`);
    }

    const recentWins = this.successes
      .filter(success => !platform || success.platform === platform)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (recentWins.length > 0) {
      const viralWins = recentWins.filter(win => (win.viralScore?.viralPotential || 'low') === 'viral').length;
      if (viralWins > 0) {
        guidance.push(`Recent viral wins on this lane: ${viralWins}; follow the strongest existing pattern instead of inventing a new format.`);
      }
    } else {
      guidance.push('Learning data is still limited, so keep testing fresh angles within the locked niche.');
    }

    return {
      platform,
      recommendedContentType: topContentType,
      recommendedHookPattern: topHook,
      recommendedCTA: topCTA,
      recommendedStructure: topStructure,
      emotionalTriggers,
      guidance,
    };
  }

  /**
   * Get recent successes
   */
  getRecentSuccesses(limit = 20): SuccessRecord[] {
    return this.successes.slice(-limit);
  }

  // ==================== PERSISTENCE ====================

  private async loadPatterns(): Promise<void> {
    try {
      const data = await kvGet(KEYS.patterns);
      if (data) {
        const patterns = JSON.parse(data);
        this.patterns = new Map(patterns);
      }
    } catch {
      this.patterns = new Map();
    }
  }

  private async savePatterns(): Promise<void> {
    try {
      const patterns = Array.from(this.patterns.entries());
      await kvSet(KEYS.patterns, JSON.stringify(patterns));
    } catch {
      console.error('[LearningSystem] Failed to save patterns');
    }
  }

  private async loadSuccesses(): Promise<void> {
    try {
      const data = await kvGet(KEYS.successes);
      this.successes = data ? JSON.parse(data) : [];
    } catch {
      this.successes = [];
    }
  }

  private async saveSuccesses(): Promise<void> {
    try {
      await kvSet(KEYS.successes, JSON.stringify(this.successes));
    } catch {
      console.error('[LearningSystem] Failed to save successes');
    }
  }
}

// Export singleton
export const learningSystem = new LearningSystem();
