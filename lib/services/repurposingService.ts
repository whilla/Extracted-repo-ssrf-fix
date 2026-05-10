'use client';

import { aiService } from './aiService';
import { platformAdapterService } from './platformAdapterService';
import { multiAgentService } from './multiAgentService';
import { kvGet } from './puterService';
import { youtubeTranscriptService } from './youtubeTranscriptService';
import { audioTranscriptionService } from './audioTranscriptionService';
import type { Platform, BrandKit } from '@/lib/types';

export interface RepurposeRequest {
  masterContent: string;
  platforms: Platform[];
  brandKitId?: string;
  toneAdjustment?: string;
  competitiveGaps?: string[]; // Strategic gaps identified by CompetitiveIntelService
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
    let { masterContent, platforms, toneAdjustment, competitiveGaps } = request;
    
    // 1. Source Resolution: Convert any media source into a text master
    if (masterContent.includes('youtube.com/') || masterContent.includes('youtu.be/')) {

      try {
        const transcript = await youtubeTranscriptService.fetchTranscript(masterContent);
        masterContent = `[YOUTUBE TRANSCRIPT: ${transcript.videoId}]\n\n${transcript.fullText}`;
      } catch (error) {
        console.warn('[RepurposingService] YouTube fetch failed, proceeding with URL as text:', error);
      }
    } else if (audioTranscriptionService.isSupportedFormat(masterContent)) {
      try {
        const transcription = await audioTranscriptionService.transcribeFile(masterContent);
        masterContent = `[AUDIO TRANSCRIPTION]\n\n${transcription.text}`;
      } catch (error) {
        console.warn('[RepurposingService] Audio transcription failed, proceeding with path as text:', error);
      }
    }

    // 2. Analyze Master Content (The "Distillation" Phase)
    const analysis = await this.analyzeMasterContent(masterContent);
    
    // 3. Generate Platform-Specific Variations
    const variations: RepurposedContent[] = [];
    
    await Promise.all(platforms.map(async (platform) => {
      const variation = await this.adaptForPlatform(
        platform, 
        analysis, 
        masterContent, 
        toneAdjustment,
        competitiveGaps
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
    const isTranscript = content.includes('[TRANSCRIPT FROM YOUTUBE VIDEO') || 
                         content.includes('[YOUTUBE TRANSCRIPT') || 
                         content.includes('[AUDIO TRANSCRIPTION]');
                         
    const processedContent = isTranscript 
      ? `The following is a raw spoken-word transcript. Please distill the key arguments, value propositions, and emotional hooks, removing filler words (um, ah, like), repetitions, and verbal tics:\n\n${content}`
      : content;

    const systemPrompt = `
      You are a Master Content Strategist. Your goal is to distill long-form content into its most potent, viral elements.
      
      ${isTranscript ? 'SPECIAL INSTRUCTION: This is a raw transcript. Focus on extracting the la-essence of the message, removing verbal tics, and identifying the "Gold Nuggets" (the most impactful quotes and ideas).' : ''}
      
      Analyze the provided content and identify:
      1. The Core Message: The one single truth or value proposition.
      2. Key Hooks: 3-5 different "angles" (e.g., Contrarian, Educational, Emotional, Listicle) that can be used for different platforms.
      3. Target Audience: Who is this most likely to resonate with?
    `;

    const userPrompt = `Analyze this content:\n\n${processedContent}`;

    const response = await aiService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    const cleaned = response.replace(/```json|```/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
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
    toneAdjustment?: string,
    competitiveGaps?: string[]
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
      ${competitiveGaps ? `STRATEGIC COMPETITIVE GAPS TO EXPLOIT: ${competitiveGaps.join(', ')}` : ''}

      Task: Create a post for ${platform}. 
      ${competitiveGaps ? 'CRITICAL: Use the Competitive Gaps to create a "Contrarian" or "Superiority" angle. Position our brand as the solution to what the competition is missing.' : 'Use one of the key hooks.'}
      
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
