/**
 * GOVERNOR SYSTEM - System Authority
 * Validates ALL outputs and enforces quality standards
 * 
 * Responsibilities:
 * - Validate all generated content
 * - Reject robotic/low engagement content
 * - Enforce Hook -> Value -> CTA structure
 * - Trigger regeneration or provider switch on rejection
 * - Maintain system health and failsafe modes
 */

import { kvGet, kvSet } from '../services/puterService';
import { ViralScoringEngine } from './ViralScoringEngine';
import { universalChat } from '../services/aiService';

// Governor Types
export interface GovernorValidation {
  approved: boolean;
  score: number;
  issues: GovernorIssue[];
  feedback: string;
  action?: GovernorAction;
}

export interface GovernorIssue {
  type: 'quality' | 'robotic' | 'repetitive' | 'structure' | 'engagement' | 'brand' | 'safety' | 'error';
  severity: 'warning' | 'error' | 'critical';
  message: string;
  location?: string;
}

export type GovernorAction = 'approve' | 'regenerate' | 'switch_provider' | 'reject' | 'failsafe';

export interface GovernorConfig {
  enabled: boolean;
  qualityThreshold: number;
  strictMode: boolean;
  maxRegenerations: number;
  failsafeThreshold: number;
  roboticPatternPenalty: number;
  repetitionPenalty: number;
  enforcedStructure: boolean;
}

export interface GovernorState {
  mode: 'normal' | 'conservative' | 'failsafe';
  consecutiveRejections: number;
  totalValidations: number;
  totalApprovals: number;
  totalRejections: number;
  lastValidation: string | null;
  failsafeReason: string | null;
}

export interface ValidationContext {
  platform?: string;
  taskType?: string;
  isRegeneration?: boolean;
  previousContent?: string;
  governorFeedback?: string;
}

// Robotic/Corporate patterns to detect
const ROBOTIC_PATTERNS: { pattern: RegExp; penalty: number; message: string }[] = [
  { pattern: /\bin conclusion\b/i, penalty: 20, message: 'Avoid "in conclusion" - sounds robotic' },
  { pattern: /\bfurthermore\b/i, penalty: 15, message: 'Replace "furthermore" with conversational language' },
  { pattern: /\badditionally\b/i, penalty: 12, message: '"Additionally" feels corporate' },
  { pattern: /\bmoreover\b/i, penalty: 12, message: '"Moreover" is too formal' },
  { pattern: /\bconsequently\b/i, penalty: 12, message: '"Consequently" sounds academic' },
  { pattern: /\bsynergy\b/i, penalty: 20, message: 'Corporate buzzword detected: "synergy"' },
  { pattern: /\bleverage\b/i, penalty: 15, message: 'Avoid corporate speak: "leverage"' },
  { pattern: /\boptimize\b/i, penalty: 10, message: '"Optimize" sounds technical' },
  { pattern: /\bstreamline\b/i, penalty: 12, message: '"Streamline" is overused' },
  { pattern: /\bparadigm\b/i, penalty: 20, message: 'Business jargon: "paradigm"' },
  { pattern: /\bholistic\b/i, penalty: 15, message: '"Holistic" sounds like marketing speak' },
  { pattern: /\bit is important to note\b/i, penalty: 18, message: 'Remove filler phrases' },
  { pattern: /\bit should be noted\b/i, penalty: 15, message: 'Direct statements are better' },
  { pattern: /\bin order to\b/i, penalty: 8, message: 'Simplify to just "to"' },
  { pattern: /\bat the end of the day\b/i, penalty: 12, message: 'Cliché phrase' },
  { pattern: /\bmoving forward\b/i, penalty: 10, message: 'Corporate cliché' },
  { pattern: /\bthought leader\b/i, penalty: 18, message: 'Avoid self-promotion clichés' },
];

// Generic/Low engagement patterns
const GENERIC_PATTERNS: { pattern: RegExp; penalty: number; message: string }[] = [
  { pattern: /^(hey|hi|hello) (everyone|guys|friends)/i, penalty: 25, message: 'Generic opening - be more creative' },
  { pattern: /^(just|simply) (wanted|want) to (say|share)/i, penalty: 20, message: 'Weak opening - get to the point' },
  { pattern: /^(i('m| am)) (so )?excited to/i, penalty: 15, message: '"Excited to announce" is overused' },
  { pattern: /^check out/i, penalty: 18, message: '"Check out" is a weak hook' },
  { pattern: /^(did you know|here's a secret)/i, penalty: 12, message: 'Overused curiosity pattern' },
  { pattern: /\bgame.?changer\b/i, penalty: 15, message: '"Game-changer" is cliché' },
  { pattern: /\btake it to the next level\b/i, penalty: 15, message: 'Cliché phrase' },
  { pattern: /\bstay tuned\b/i, penalty: 10, message: '"Stay tuned" is outdated' },
];

// Required structure elements
const STRUCTURE_REQUIREMENTS = {
  minHookLength: 10,
  maxHookLength: 150,
  minBodyLength: 50,
  requiresCTA: true,
  requiresLineBreaks: true,
};

/**
 * GovernorSystem Class
 * The authority that validates all AI outputs
 */
export class GovernorSystem {
  private config: GovernorConfig;
  private state: GovernorState;
  private scoringEngine: ViralScoringEngine;
  private validationHistory: ValidationRecord[] = [];
  private initialized = false;

  constructor() {
    this.config = {
      enabled: true,
      qualityThreshold: 60,
      strictMode: false,
      maxRegenerations: 3,
      failsafeThreshold: 10, // Consecutive rejections before failsafe
      roboticPatternPenalty: 1.0, // Multiplier
      repetitionPenalty: 1.0,
      enforcedStructure: true,
    };

    this.state = {
      mode: 'normal',
      consecutiveRejections: 0,
      totalValidations: 0,
      totalApprovals: 0,
      totalRejections: 0,
      lastValidation: null,
      failsafeReason: null,
    };

    this.scoringEngine = new ViralScoringEngine();
  }

  /**
   * Initialize the governor system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load config and state from storage
    const savedConfig = await this.loadConfig();
    if (savedConfig) {
      this.config = { ...this.config, ...savedConfig };
    }

    const savedState = await this.loadState();
    if (savedState) {
      // Reset daily counters if needed
      this.state = { ...this.state, ...savedState };
    }

    this.initialized = true;
    console.log('[GovernorSystem] Initialized in', this.state.mode, 'mode');
  }

  /**
   * Main validation method
   */
  async validate(content: string, context: ValidationContext = {}): Promise<GovernorValidation> {
    if (!this.initialized) await this.initialize();
    
    this.state.totalValidations++;

    // Check if governor is disabled
    if (!this.config.enabled) {
      return this.createApproval(content, 100);
    }

    // Check for empty content
    if (!content || content.trim().length === 0) {
      return this.createRejection('Content is empty', 0, [
        { type: 'quality', severity: 'critical', message: 'No content provided' }
      ]);
    }

    // SEMANTIC VALIDATION: use LLM to analyze quality and robotic patterns
    let semanticResult: { approved: boolean; score: number; feedback: string; issues: GovernorIssue[] } | null = null;
    try {
      const semanticPrompt = `You are the Quality Governor for a high-end content platform.
Analyze the following content for:
1. Robotic/AI language (e.g. "In conclusion", "Additionally", corporate jargon)
2. Engagement quality (Does it stop the scroll? Is the hook strong?)
3. Brand alignment and authenticity.

Content:
"""
${content}
"""

Return only a JSON object with:
{
  "approved": boolean,
  "score": 0-100,
  "feedback": "concise summary of issues",
  "issues": [
    { "type": "robotic" | "engagement" | "quality", "severity": "warning" | "error", "message": "details" }
  ]
}
Return NO other text.`;
      
      const response = await universalChat(semanticPrompt, { model: 'gpt-4o-mini' });
      const parsed = JSON.parse(response.replace(/```json|```/g, ''));
      semanticResult = { approved: parsed.approved, score: parsed.score, feedback: parsed.feedback, issues: parsed.issues };
    } catch (e) {
      console.warn('[GovernorSystem] Semantic validation failed, falling back to heuristics:', e);
    }

    const issues: GovernorIssue[] = [];
    let score = 100;

    if (semanticResult) {
      score = semanticResult.score;
      issues.push(...semanticResult.issues);
      
      if (!semanticResult.approved) {
        const roboticResult = this.checkRoboticPatterns(content);
        score -= roboticResult.penalty * 0.5; 
        issues.push(...roboticResult.issues);
      }
    } else {
      const roboticResult = this.checkRoboticPatterns(content);
      score -= roboticResult.penalty * this.config.roboticPatternPenalty;
      issues.push(...roboticResult.issues);
    }

    const genericResult = this.checkGenericPatterns(content);
    score -= genericResult.penalty * 0.2; 
    issues.push(...genericResult.issues);

    if (this.config.enforcedStructure) {
      const structureResult = this.checkStructure(content);
      score -= structureResult.penalty;
      issues.push(...structureResult.issues);
    }

    if (context.previousContent) {
      const repetitionResult = this.checkRepetition(content, context.previousContent);
      score -= repetitionResult.penalty * this.config.repetitionPenalty;
      issues.push(...repetitionResult.issues);
    }

    const viralScore = await this.scoringEngine.score(content);
    score = (score * 0.6 + viralScore.total * 0.4);

    if (context.platform) {
      const platformResult = this.checkPlatformRequirements(content, context.platform);
      score -= platformResult.penalty;
      issues.push(...platformResult.issues);
    }

    if (this.config.strictMode) {
      score *= 0.9;
    }

    if (this.state.mode === 'failsafe') {
      return this.createRejection('System in failsafe mode', score, issues, 'failsafe');
    }

    this.recordValidation(score, issues);

    const approved = (semanticResult ? semanticResult.approved : true) && 
                     score >= this.config.qualityThreshold && 
                     issues.filter(i => i.severity === 'critical').length === 0;

    if (approved) {
      this.state.consecutiveRejections = 0;
      this.state.totalApprovals++;
      return this.createApproval(content, score, issues);
    } else {
      this.state.consecutiveRejections++;
      this.state.totalRejections++;

      if (this.state.consecutiveRejections >= this.config.failsafeThreshold) {
        await this.activateFailsafe('Too many consecutive rejections');
      }

      const action: GovernorAction = context.isRegeneration ? 'switch_provider' : 'regenerate';
      
      return this.createRejection(
        this.generateFeedback(issues, score),
        score,
        issues,
        action
      );
    }
  }

  /**
   * Check for robotic language patterns
   */
  private checkRoboticPatterns(content: string): { penalty: number; issues: GovernorIssue[] } {
    let penalty = 0;
    const issues: GovernorIssue[] = [];

    for (const { pattern, penalty: p, message } of ROBOTIC_PATTERNS) {
      if (pattern.test(content)) {
        penalty += p;
        issues.push({
          type: 'robotic',
          severity: penalty >= 15 ? 'error' : 'warning',
          message,
        });
      }
    }

    return { penalty, issues };
  }

  /**
   * Check for generic/low engagement patterns
   */
  private checkGenericPatterns(content: string): { penalty: number; issues: GovernorIssue[] } {
    let penalty = 0;
    const issues: GovernorIssue[] = [];

    for (const { pattern, penalty: p, message } of GENERIC_PATTERNS) {
      if (pattern.test(content)) {
        penalty += p;
        issues.push({
          type: 'engagement',
          severity: penalty >= 20 ? 'error' : 'warning',
          message,
        });
      }
    }

    return { penalty, issues };
  }

  /**
   * Check content structure (Hook -> Value -> CTA)
   */
  private checkStructure(content: string): { penalty: number; issues: GovernorIssue[] } {
    let penalty = 0;
    const issues: GovernorIssue[] = [];
    const lines = content.split('\n').filter(l => l.trim().length > 0);

    // Check hook (first line)
    if (lines.length > 0) {
      const hook = lines[0];
      if (hook.length < STRUCTURE_REQUIREMENTS.minHookLength) {
        penalty += 10;
        issues.push({
          type: 'structure',
          severity: 'warning',
          message: 'Hook is too short',
          location: 'first line',
        });
      }
      if (hook.length > STRUCTURE_REQUIREMENTS.maxHookLength) {
        penalty += 15;
        issues.push({
          type: 'structure',
          severity: 'warning',
          message: 'Hook is too long - should stop the scroll quickly',
          location: 'first line',
        });
      }
    }

    // Check body length
    if (content.length < STRUCTURE_REQUIREMENTS.minBodyLength) {
      penalty += 20;
      issues.push({
        type: 'structure',
        severity: 'error',
        message: 'Content is too short - add more value',
      });
    }

    // Check for CTA
    if (STRUCTURE_REQUIREMENTS.requiresCTA) {
      const ctaPatterns = [
        /follow/i, /subscribe/i, /like/i, /share/i, /comment/i,
        /click/i, /tap/i, /link/i, /dm/i, /check out/i,
        /what do you think/i, /agree/i, /thoughts/i,
      ];
      const hasCTA = ctaPatterns.some(p => p.test(content));
      if (!hasCTA) {
        penalty += 10;
        issues.push({
          type: 'structure',
          severity: 'warning',
          message: 'No clear call-to-action detected',
        });
      }
    }

    // Check for line breaks
    if (STRUCTURE_REQUIREMENTS.requiresLineBreaks && content.length > 200) {
      if (lines.length < 3) {
        penalty += 10;
        issues.push({
          type: 'structure',
          severity: 'warning',
          message: 'Add line breaks for better readability',
        });
      }
    }

    return { penalty, issues };
  }

  /**
   * Check for repetition with previous content
   */
  private checkRepetition(content: string, previousContent: string): { penalty: number; issues: GovernorIssue[] } {
    let penalty = 0;
    const issues: GovernorIssue[] = [];

    // Simple similarity check (word overlap)
    const currentWords = new Set(content.toLowerCase().split(/\s+/));
    const previousWords = new Set(previousContent.toLowerCase().split(/\s+/));
    
    let overlap = 0;
    currentWords.forEach(word => {
      if (previousWords.has(word)) overlap++;
    });

    const similarity = overlap / Math.max(currentWords.size, previousWords.size);
    
    if (similarity > 0.7) {
      penalty += 30;
      issues.push({
        type: 'repetitive',
        severity: 'error',
        message: 'Content is too similar to previous version',
      });
    } else if (similarity > 0.5) {
      penalty += 15;
      issues.push({
        type: 'repetitive',
        severity: 'warning',
        message: 'Consider more variation from previous content',
      });
    }

    return { penalty, issues };
  }

  /**
   * Check platform-specific requirements
   */
  private checkPlatformRequirements(content: string, platform: string): { penalty: number; issues: GovernorIssue[] } {
    let penalty = 0;
    const issues: GovernorIssue[] = [];

    const platformLimits: Record<string, number> = {
      twitter: 280,
      threads: 500,
      instagram: 2200,
      linkedin: 3000,
      tiktok: 2200,
    };

    const limit = platformLimits[platform.toLowerCase()];
    if (limit && content.length > limit) {
      penalty += 25;
      issues.push({
        type: 'quality',
        severity: 'error',
        message: `Content exceeds ${platform} character limit (${content.length}/${limit})`,
      });
    }

    return { penalty, issues };
  }

  /**
   * Generate feedback message from issues
   */
  private generateFeedback(issues: GovernorIssue[], score: number): string {
    if (issues.length === 0) {
      return `Score ${Math.round(score)} is below threshold ${this.config.qualityThreshold}`;
    }

    const criticalIssues = issues.filter(i => i.severity === 'critical');
    const errorIssues = issues.filter(i => i.severity === 'error');

    if (criticalIssues.length > 0) {
      return criticalIssues[0].message;
    }

    if (errorIssues.length > 0) {
      return errorIssues.map(i => i.message).join('. ');
    }

    return issues[0].message;
  }

  /**
   * Create approval response
   */
  private createApproval(content: string, score: number, issues: GovernorIssue[] = []): GovernorValidation {
    return {
      approved: true,
      score: Math.round(score),
      issues,
      feedback: 'Content approved',
      action: 'approve',
    };
  }

  /**
   * Create rejection response
   */
  private createRejection(
    feedback: string, 
    score: number, 
    issues: GovernorIssue[],
    action: GovernorAction = 'regenerate'
  ): GovernorValidation {
    return {
      approved: false,
      score: Math.round(score),
      issues,
      feedback,
      action,
    };
  }

  /**
   * Record validation for analytics
   */
  private recordValidation(score: number, issues: GovernorIssue[]): void {
    this.state.lastValidation = new Date().toISOString();
    
    this.validationHistory.push({
      timestamp: this.state.lastValidation,
      score: Math.round(score),
      approved: score >= this.config.qualityThreshold,
      issueCount: issues.length,
      criticalCount: issues.filter(i => i.severity === 'critical').length,
    });

    // Keep last 1000 records
    if (this.validationHistory.length > 1000) {
      this.validationHistory = this.validationHistory.slice(-1000);
    }

    this.saveState();
  }

  /**
   * Activate failsafe mode
   */
  async activateFailsafe(reason: string): Promise<void> {
    this.state.mode = 'failsafe';
    this.state.failsafeReason = reason;
    await this.saveState();
    console.warn('[GovernorSystem] FAILSAFE ACTIVATED:', reason);
  }

  /**
   * Deactivate failsafe mode
   */
  async deactivateFailsafe(): Promise<void> {
    this.state.mode = 'normal';
    this.state.failsafeReason = null;
    this.state.consecutiveRejections = 0;
    await this.saveState();
    console.log('[GovernorSystem] Failsafe deactivated');
  }

  /**
   * Get governor status
   */
  getStatus(): {
    mode: string;
    enabled: boolean;
    threshold: number;
    totalValidations: number;
    approvalRate: number;
    consecutiveRejections: number;
    failsafeReason: string | null;
  } {
    return {
      mode: this.state.mode,
      enabled: this.config.enabled,
      threshold: this.config.qualityThreshold,
      totalValidations: this.state.totalValidations,
      approvalRate: this.state.totalValidations > 0 
        ? Math.round((this.state.totalApprovals / this.state.totalValidations) * 100)
        : 100,
      consecutiveRejections: this.state.consecutiveRejections,
      failsafeReason: this.state.failsafeReason,
    };
  }

  /**
   * Get validation history
   */
  getValidationHistory(limit = 100): ValidationRecord[] {
    return this.validationHistory.slice(-limit);
  }

  /**
   * Update configuration
   */
  async updateConfig(updates: Partial<GovernorConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
  }

  /**
   * Load config from storage
   */
  private async loadConfig(): Promise<GovernorConfig | null> {
    try {
      const data = await kvGet('nexus_governor_config_v2');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  /**
   * Save config to storage
   */
  private async saveConfig(): Promise<void> {
    try {
      await kvSet('nexus_governor_config_v2', JSON.stringify(this.config));
    } catch {
      console.error('[GovernorSystem] Failed to save config');
    }
  }

  /**
   * Load state from storage
   */
  private async loadState(): Promise<GovernorState | null> {
    try {
      const data = await kvGet('nexus_governor_state_v2');
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
      await kvSet('nexus_governor_state_v2', JSON.stringify(this.state));
    } catch {
      console.error('[GovernorSystem] Failed to save state');
    }
  }
}

interface ValidationRecord {
  timestamp: string;
  score: number;
  approved: boolean;
  issueCount: number;
  criticalCount: number;
}

// Export singleton
export const governorSystem = new GovernorSystem();
