/**
 * BRAND LOCK MANAGER
 * Handles the transition from "analyzing a document" to "locking in" 
 * a formal Brand Kit and Content Strategy.
 * 
 * Responsibilities:
 * - Parse PDFs/Docs for brand details
 * - Manage the "Request for Permission" flow to lock in brand details
 * - Update MemoryManager with finalized brand kits
 * - Define content la-la types (e.g., Voice Storytelling, Conversational, etc.)
 */

import { memoryManager } from '../core/MemoryManager';
import { loadBrandKit, saveBrandKit, type BrandKit } from './memoryService';
import { perceptionService } from './multiModalPerceptionService';

export type ContentSyle = 
  | 'voice_storytelling_animated'
  | 'conversational_direct'
  | 'educational_deepdive'
  | 'contrarian_hot_take'
  | 'minimalist_aesthetic';

export interface BrandLockProposal {
  proposedBrandKit: BrandKit;
  detectedNiche: string;
  suggestedStyle: ContentSyle;
  reasoning: string;
}

export class BrandLockManager {
  private currentProposal: BrandLockProposal | null = null;

  /**
   * Step 1: Analyze a file (like a PDF) and propose a brand identity
   */
  async proposeFromDocument(path: string): Promise<BrandLockProposal> {
    // Use the perception service to "read" the document
    const observation = await perceptionService.perceiveAsset(path, 'document');
    
    // In a real implementation, we would use a specialized "Brand Extractor" agent
    // to convert the description into a formal BrandKit object.
    const proposedKit: BrandKit = {
      brandName: 'Extracted Brand',
      tone: 'Professional yet engaging',
      targetAudience: 'High-intent seekers',
      niche: 'AI Automation',
      avoidTopics: ['generic corporate speak'],
      monetizationGoals: ['SaaSsubscriptions'],
      contentPillars: ['Efficiency', 'Innovation'],
    };

    this.currentProposal = {
      proposedBrandKit: proposedKit,
      detectedNiche: proposedKit.niche,
      suggestedStyle: 'conversational_direct',
      reasoning: `Based on the document at ${path}, the brand focuses on ${proposedKit.niche} with a ${proposedKit.tone} tone.`,
    };

    return this.currentProposal;
  }

  /**
   * Step 2: Lock the proposal into the system
   */
  async lockInBrand(style: ContentSyle): Promise<boolean> {
    if (!this.currentProposal) throw new Error('No brand proposal pending');

    const finalKit = this.currentProposal.proposedBrandKit;
    
    // Update the formal Brand Kit in memory
    await saveBrandKit(finalKit);
    
    // Use the MemoryManager to update specific fields for high-level access
    await memoryManager.updateBrandMemory({
      brandKit: finalKit,
      lastUpdated: new Date().toISOString(),
    });

    // Optionally save the preferred style as a global preference
    await puterService.writeFile(`${puterService.PATHS.settings}/preferred-style.json`, { 
      style, 
      lockedAt: new Date().toISOString() 
    });

    this.currentProposal = null;
    return true;
  }
}

export const brandLockManager = new BrandLockManager();
