/**
 * TOKEN BUDGET MANAGER
 * Prevents "AI Runaway" and manages API costs across multiple providers.
 * 
 * Responsibilities:
 * - Track token usage per project and per agent
 * - Implement hard and soft spending limits
 * - Manage budget-aware routing (fallback to cheaper models)
 * - Provide usage analytics for cost optimization
 */

import { kvGet, kvSet } from '../services/puterService';

export interface BudgetLimit {
  dailyLimit: number; // In USD
  monthlyLimit: number;
  alertThreshold: number; // 0.0 to 1.0 (e.g., 0.8 for 80%)
  hardStop: boolean;
}

export interface UsageStats {
  totalTokens: number;
  estimatedCost: number;
  requestCount: number;
  lastReset: string;
}

const TOKEN_BUDGET_TIMEZONE = process.env.TOKEN_BUDGET_TIMEZONE || 'UTC';

const PROVIDER_FALLBACKS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-2',
  google: 'gemini-1.5-flash',
  cohere: 'command-r',
  mistral: 'mistral-small',
};

export class TokenBudgetManager {
  private state: Record<string, UsageStats> = {};
  private budget: BudgetLimit = {
    dailyLimit: 10,
    monthlyLimit: 200,
    alertThreshold: 0.8,
    hardStop: false,
  };
  private initialized = false;
  private locks: Map<string, Promise<void>> = new Map();

  private readonly KEYS = {
    usage: 'nexus_budget_usage',
    config: 'nexus_budget_config',
  };

  private getToday(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TOKEN_BUDGET_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const savedUsage = await kvGet(this.KEYS.usage);
      if (savedUsage) {
        const parsed = JSON.parse(savedUsage);
        if (parsed && typeof parsed === 'object') {
          this.state = parsed;
        }
      }

      const savedConfig = await kvGet(this.KEYS.config);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed && typeof parsed === 'object') {
          this.budget = { ...this.budget, ...parsed };
        }
      }
    } catch (e) {
      console.error('[BudgetManager] Failed to parse saved data, using defaults', e);
    }

    this.initialized = true;
    console.log('[BudgetManager] Initialized');
  }

  private async acquireLock(agentId: string): Promise<() => void> {
    while (this.locks.has(agentId)) {
      await this.locks.get(agentId);
    }
    let release: () => void;
    const promise = new Promise<void>(resolve => {
      release = resolve;
    });
    this.locks.set(agentId, promise);
    return () => {
      this.locks.delete(agentId);
      release();
    };
  }

  async trackUsage(agentId: string, tokens: number, cost: number): Promise<void> {
    if (!agentId || typeof agentId !== 'string') {
      throw new Error('Invalid agentId: must be a non-empty string');
    }
    if (typeof tokens !== 'number' || tokens < 0) {
      throw new Error('Invalid tokens: must be a non-negative number');
    }
    if (typeof cost !== 'number' || cost < 0) {
      throw new Error('Invalid cost: must be a non-negative number');
    }

    if (!this.initialized) await this.initialize();

    const releaseLock = await this.acquireLock(agentId);
    try {
      const now = this.getToday();
      const stats = this.state[agentId] || {
        totalTokens: 0,
        estimatedCost: 0,
        requestCount: 0,
        lastReset: now,
      };

      if (stats.lastReset !== now) {
        stats.totalTokens = 0;
        stats.estimatedCost = 0;
        stats.requestCount = 0;
        stats.lastReset = now;
      }

      stats.totalTokens += tokens;
      stats.estimatedCost += cost;
      stats.requestCount++;

      this.state[agentId] = stats;
      await this.saveState();
    } finally {
      releaseLock();
    }
  }

  private getTodayCosts(): number {
    const today = this.getToday();
    return Object.values(this.state).reduce(
      (sum, s) => s.lastReset === today ? sum + s.estimatedCost : sum, 0
    );
  }

  async checkBudgetAvailability(): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.initialized) await this.initialize();

    const totalDailyCost = this.getTodayCosts();

    if (this.budget.hardStop && totalDailyCost >= this.budget.dailyLimit) {
      return { allowed: false, reason: 'Daily budget limit reached (Hard Stop).' };
    }

    if (totalDailyCost >= this.budget.dailyLimit * this.budget.alertThreshold) {
      console.warn(`[BudgetManager] Budget Alert: ${Math.round((totalDailyCost / this.budget.dailyLimit) * 100)}% of daily budget used.`);
    }

    const totalMonthlyCost = this.getMonthlyCosts();
    if (this.budget.hardStop && this.budget.monthlyLimit && totalMonthlyCost >= this.budget.monthlyLimit) {
      return { allowed: false, reason: 'Monthly budget limit reached (Hard Stop).' };
    }

    return { allowed: true };
  }

  private getMonthlyCosts(): number {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    return Object.values(this.state).reduce(
      (sum, s) => s.lastReset >= firstOfMonth ? sum + s.estimatedCost : sum, 0
    );
  }

  async suggestCheaperAlternative(): Promise<string | null> {
    const totalDailyCost = this.getTodayCosts();
    
    if (totalDailyCost > this.budget.dailyLimit * 0.5) {
      return PROVIDER_FALLBACKS.openai || 'gpt-4o-mini';
    }
    
    return null;
  }

  async updateBudget(newLimits: Partial<BudgetLimit>): Promise<void> {
    if (newLimits.dailyLimit !== undefined && newLimits.dailyLimit < 0) {
      throw new Error('dailyLimit must be non-negative');
    }
    if (newLimits.monthlyLimit !== undefined && newLimits.monthlyLimit < 0) {
      throw new Error('monthlyLimit must be non-negative');
    }
    if (newLimits.alertThreshold !== undefined && 
        (newLimits.alertThreshold < 0 || newLimits.alertThreshold > 1)) {
      throw new Error('alertThreshold must be between 0 and 1');
    }

    this.budget = { ...this.budget, ...newLimits };
    await this.saveConfig();
  }

  private async saveState(): Promise<void> {
    try {
      await kvSet(this.KEYS.usage, JSON.stringify(this.state));
    } catch (e) {
      console.error('[BudgetManager] Failed to save usage state', e);
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      await kvSet(this.KEYS.config, JSON.stringify(this.budget));
    } catch (e) {
      console.error('[BudgetManager] Failed to save budget config', e);
    }
  }

  getStats() {
    const today = this.getToday();
    const currentDailySpend = Object.values(this.state).reduce(
      (sum, s) => s.lastReset === today ? sum + s.estimatedCost : sum, 0
    );

    return {
      ...this.budget,
      currentDailySpend,
      agentBreakdown: this.state,
    };
  }
}

export const tokenBudgetManager = new TokenBudgetManager();