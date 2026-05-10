'use client';

import { aiService } from './aiService';
import { platformAdapterService } from './platformAdapterService';
import { multiAgentService } from './multiAgentService';
import { kvGet } from './puterService';
import type { Platform, BrandKit } from '@/lib/types';

export interface RepurposeRequest {
  masterContent: string;
  platforms: Platform[];
  brandKitId?: string;
  toneAdjustment?: string;
}

export interface RepurposedContent {
  platform: Platform;
  text: string;
  hashtags: string[];
  visualSuggestion: string;
  adaptationReasoning: string;
}

export interface RepurposeResult {
  masterAnalysis: {
    coreMessage: string;
    keyHooks: string[];
    targetAudience: string;
  };
  variations: RepurposedContent[];
}

/**
 * RepurposingService handles the transformation of a single master content 
 * piece into a multi-platform campaign.
 */
export const repurposingService = {
  /**
   * Repurposes master content for multiple platforms simultaneously.
   */
  async repurpose(request: RepurposeRequest): Promise<RepurposeResult> {
    const { masterContent, platforms, toneAdjustment } = request;
    
    // 1. Analyze Master Content (The "Distillation" Phase)
    const analysis = await this.analyzeMasterContent(masterContent);
    
    // 2. Generate Platform-Specific Variations
    const variations: RepurposedContent[] = [];
    
    // We process platforms in parallel to optimize performance
    await Promise.all(platforms.map(async (platform) => {
      const variation = await this.adaptForPlatform(
        platform, 
        analysis, 
        masterContent, 
        toneAdjustment
      );
      variations.push(variation);
    }));

    return {
      masterAnalysis: analysis,
      variations: variations.sort((a, b) => a.platform.localeCompare(b.platform)),
    };
  },

  /**
   * Extracts core messages and hooks from the source content.
   */
  async analyzeMasterContent(content: string): Promise<RepurposeResult['masterAnalysis']> {
    const systemPrompt = `
      You are a Master Content Strategist. Your goal is to distill long-form content into its most potent, viral elements.
      
      Analyze the provided content and identify:
      1. The Core Message: The one single truth or value proposition.
      2. Key Hooks: 3-5 different "angles" (e.g., Contrarian, Educational, Emotional, Listicle) that can be used for different platforms.
      3. Target Audience: Who is this most likely to resonate with?
    `;

    const userPrompt = `Analyze this content:\n\n${content}`;

    const response = await aiService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    // Parse the AI response into a structured object
    // In a production environment, we would use zod or structured output
    const cleaned = response.replace(/```json|```/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      // Fallback if AI doesn't return perfect JSON
      return {
        coreMessage: "Content analysis failed, using raw content.",
        keyHooks: ["General angle"],
        targetAudience: "General audience"
      };
    }
  },

  /**
   * Adapts the analyzed content for a specific platform's culture and limits.
   */
  async adaptForPlatform(
    platform: Platform, 
    analysis: RepurposeResult['masterAnalysis'], 
    masterContent: string,
    toneAdjustment?: string
  ): Promise<RepurposedContent> {
    const brandKit = await kvGet('brand_kit');
    const brandContext = brandKit ? JSON.stringify(brandKit) : 'No specific brand kit defined.';

    const systemPrompt = `
      You are a Platform-Specific Content Expert for ${platform}.
      Your goal is to adapt a master message into a high-performing post for ${platform}.
      
      ${platform} CULTURE GUIDELINES:
      - Twitter: Concise, punchy, thread-ready, high curiosity gap.
      - LinkedIn: Professional, value-driven, structured, focused on growth/career.
      - TikTok/Instagram: High energy, immediate hook, visually descriptive, casual.
      - Facebook: Community-focused, conversational, storytelling.
      - YouTube: SEO-optimized, descriptive, curiosity-driven.
    `;

    const userPrompt = `
      MASTER MESSAGE: ${analysis.coreMessage}
      KEY HOOKS: ${analysis.keyHooks.join(', ')}
      SOURCE CONTENT: ${masterContent}
      BRAND CONTEXT: ${brandContext}
      ${toneAdjustment ? `TONE ADJUSTMENT: ${toneAdjustment}` : ''}

      Task: Create a post for ${platform} that uses one of the key hooks.
      
      Please return JSON:
      {
        "text": "The post content",
        "hashtags": ["tag1", "tag2"],
        "visualSuggestion": "Describe the image or video that should accompany this",
        "adaptationReasoning": "Why this approach works for ${platform}"
      }
    `;

    const response = await aiService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    const cleaned = response.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {
        text: "Adaptation failed.",
        hashtags: [],
        visualSuggestion: "Default visual",
        adaptationReasoning: "Error during parsing"
      };
    }

    // Finally, use the platformAdapterService to ensure we aren't over the character limit
    const adapted = platformAdapterService.adaptContentForPlatform(
      parsed.text, 
      parsed.hashtags, 
      platform
    );

    return {
      platform,
      text: adapted.text,
      hashtags: adapted.hashtags,
      visualSuggestion: parsed.visualSuggestion,
      adaptationReasoning: parsed.adaptationReasoning,
    };
  }
};
