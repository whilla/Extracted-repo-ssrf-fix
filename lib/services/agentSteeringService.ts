/**
 * AGENT STEERING SERVICE
 * Implements granular Human-In-The-Loop (HITL) feedback to steer AI behavior.
 * 
 * Responsibilities:
 * - Process corrective feedback on agent outputs
 * - Update brand and niche memory based on user corrections
 * - Inject positive/negative patterns into the LearningSystem
 * - Apply hard constraints to the GovernorSystem
 */

import { learningSystem } from '../core/LearningSystem';
import { memoryManager } from '../core/MemoryManager';
import { governor } from '../core/GovernorSystem';
import { puterService } from './puterService';

export type SteeringType = 'fact_correction' | 'tone_adjustment' | 'hard_constraint' | 'style_preference';

export interface SteeringInput {
  type: SteeringType;
  feedback: string;
  context?: string; // The specific text being corrected
  agentId?: string;
}

export class AgentSteeringService {
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
    console.log('[AgentSteering] Initialized');
  }

  /**
   * Main entry point for processing human steering input
   */
  async steer(input: SteeringInput): Promise<{ success: boolean; effect: string }> {
    if (!this.initialized) await this.initialize();

    switch (input.type) {
      case 'fact_correction':
        return this.handleFactCorrection(input.feedback);
      case 'tone_adjustment':
        return this.handleToneAdjustment(input.feedback, input.context);
      case 'hard_constraint':
        return this.handleHardConstraint(input.feedback);
      case 'style_preference':
        return this.handleStylePreference(input.feedback);
      default:
        throw new Error(`Unsupported steering type: ${input.type}`);
    }
  }

  private async handleFactCorrection(feedback: string): Promise<{ success: boolean; effect: string }> {
    // Update memory context
    const brandMemory = await memoryManager.getBrandMemory();
    
    // Simple heuristic: identify if feedback mentions 'niche' or 'audience'
    if (feedback.toLowerCase().includes('niche')) {
      await puterService.writeFile(puterService.PATHS.niche, feedback);
    } else if (feedback.toLowerCase().includes('audience')) {
      // Logic to update targetAudience in brandkit.json
      const brandKit = await puterService.readFile(puterService.PATHS.brandKit, true) || {};
      brandKit.targetAudience = feedback;
      await puterService.writeFile(puterService.PATHS.brandKit, brandKit);
    }

    return { 
      success: true, 
      effect: 'Updated brand memory and niche definitions.' 
    };
  }

  private async handleToneAdjustment(feedback: string, context?: string): Promise<{ success: boolean; effect: string }> {
    // Inject as a "Synthetic Success/Failure" record in LearningSystem
    // If it's a correction, it represents a negative pattern
    await learningSystem.recordEngagementFeedback({
      postId: `steer_${Date.now()}`,
      platform: 'general',
      content: context || 'N/A',
      score: 0, // Low score indicates this was a correction
      engagements: 0,
    });

    // We also record the *desired* tone as a positive pattern
    await learningSystem.recordSuccess({
      agentId: 'human_steer',
      content: `[TONE PREFERENCE] ${feedback}`,
      success: true,
      reasoning: 'Human-provided tone preference',
      metadata: {},
      viralScore: { total: 100 }, // Treat human preference as maximum signal
    } as any, { userInput: 'steering', taskType: 'style' } as any);

    return { 
      success: true, 
      effect: 'Tone preference recorded. Future generations will adapt.' 
    };
  }

  private async handleHardConstraint(feedback: string): Promise<{ success: boolean; effect: string }> {
    // Inject directly into the Governor system's blacklist
    const currentRules = await governor.getRules();
    currentRules.push({
      id: `human_${Date.now()}`,
      type: 'hard_constraint',
      pattern: feedback,
      action: 'block',
      severity: 'critical',
      message: `User constraint: ${feedback}`
    });
    
    await governor.updateRules(currentRules);

    return { 
      success: true, 
      effect: 'Hard constraint applied to Governor. Content violating this will be blocked.' 
    };
  }

  private async handleStylePreference(feedback: string): Promise<{ success: boolean; effect: string }> {
    // Add to the "Playbook" of winning styles
    const patterns = await puterService.readFile(`${puterService.PATHS.skills}/style-playbook.json`, true) || { preferences: [] };
    (patterns as any).preferences.push({
      timestamp: new Date().toISOString(),
      preference: feedback,
    });
    await puterService.writeFile(`${puterService.PATHS.skills}/style-playbook.json`, patterns);

    return { 
      success: true, 
      effect: 'Style preference saved to the AI playbook.' 
    };
  }
}

export const agentSteeringService = new AgentSteeringService();
