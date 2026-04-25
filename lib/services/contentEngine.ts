// Content Engine - Full generation pipeline
import type { BrandKit, ContentDraft, ContentVersion, Platform } from '@/lib/types';
import { chat, generateImage, generatePromptVariations, getCurrentModel, universalChat } from './aiService';
import { validateImageQuality } from './mediaValidator';
import { generateId, saveDraft, loadBrandKit, getRecentTopics, loadDraft } from './memoryService';
import { PLATFORMS } from '@/lib/constants/platforms';
import { learningSystem } from '@/lib/core/LearningSystem';
import { getLiveTrendContext } from './trendingService';
import { generatePlatformCopyPackage, type PlatformCopyPackage } from './hashtagService';
import { generateOfflineContent, isOfflineMode } from './offlineGenerationService';
import {
  trackGenerationFailure,
  trackGenerationStart,
  trackGenerationSuccess,
} from './generationTrackerService';
import { notificationService } from './notificationService';
import { loadAgentMemory } from './agentMemoryService';

const MAX_IMAGE_RETRIES = 3;

interface GenerationOptions {
  idea: string;
  platforms: Platform[];
  format?: 'post' | 'thread' | 'carousel' | 'story';
  includeImage?: boolean;
  includeVoice?: boolean;
  customInstructions?: string;
}

interface GeneratedContent {
  text: string;
  variations: string[];
  hashtags: string[];
  imageUrl?: string;
  imagePrompt?: string;
  platformPackages?: PlatformCopyPackage[];
}

// Generate text content
export async function generateContent(
  options: GenerationOptions,
  brandKit?: BrandKit | null
): Promise<GeneratedContent> {
  const { idea, platforms, format = 'post', customInstructions } = options;
  
  // Load brand kit if not provided
  const brand = brandKit || await loadBrandKit();
  const agentMemory = await loadAgentMemory();
  const recentTopics = await getRecentTopics(5);
  
  // Get platform constraints
  const platformConstraints = platforms.map(p => {
    const config = PLATFORMS[p];
    return `${config.name}: max ${config.maxLength} characters`;
  }).join(', ');

  const model = await getCurrentModel();
  const adaptiveStrategy = await learningSystem.getAdaptiveContentStrategy(platforms[0]);
  const offline = isOfflineMode();
  const lockedNiche = agentMemory.niche || brand?.niche || '';
  const lockedAudience = agentMemory.targetAudience || brand?.targetAudience || '';
  const lockedTone = agentMemory.preferredTone || brand?.tone || '';
  const lockedPillars = agentMemory.contentPillars.length > 0 ? agentMemory.contentPillars : brand?.contentPillars || [];
  const lockedMonetization = agentMemory.monetizationGoals || [];
  const recentIdeas = agentMemory.contentIdeas.slice(-5).map((entry) => entry.idea);
  const nicheGuidance = lockedNiche
    ? `Locked niche: ${lockedNiche}
Target audience: ${lockedAudience || 'Use the saved audience context if available'}
Preferred tone: ${lockedTone || 'Natural, direct, human'}
Content pillars: ${lockedPillars.length > 0 ? lockedPillars.join(', ') : 'Use the locked niche to keep the angle consistent'}
Monetization direction: ${lockedMonetization.length > 0 ? lockedMonetization.join(' | ') : 'Audience-building first'}
Recent saved ideas: ${recentIdeas.length > 0 ? recentIdeas.join(' | ') : 'None saved yet'}`
    : '';
  const liveTrendContext = !offline && lockedNiche ? await getLiveTrendContext(lockedNiche, platforms[0]) : null;

  if (offline) {
    return generateOfflineContent(options, brand);
  }

  const prompt = `Generate engaging ${format} content for social media.

Idea/Topic: ${idea}
Platforms: ${platformConstraints}
Format: ${format}
${customInstructions ? `Special Instructions: ${customInstructions}` : ''}
${recentTopics.length > 0 ? `Avoid repeating these recent topics: ${recentTopics.join('; ')}` : ''}
${nicheGuidance ? `${nicheGuidance}` : ''}
${liveTrendContext ? `Live trend keywords: ${liveTrendContext.trendingKeywords.join(', ')}
Live trend topics: ${liveTrendContext.liveTopics.join(', ')}
Live trend angles: ${liveTrendContext.suggestedAngles.join(' | ')}
Current headlines: ${liveTrendContext.headlines.map(item => item.title).join(' | ')}` : ''}
Adaptive Strategy:
- Recommended content type: ${adaptiveStrategy.recommendedContentType}
${adaptiveStrategy.recommendedHookPattern ? `- Recommended hook pattern: ${adaptiveStrategy.recommendedHookPattern}` : ''}
${adaptiveStrategy.recommendedCTA ? `- Recommended CTA pattern: ${adaptiveStrategy.recommendedCTA}` : ''}
${adaptiveStrategy.recommendedStructure ? `- Recommended structure: ${adaptiveStrategy.recommendedStructure}` : ''}
${adaptiveStrategy.emotionalTriggers.length > 0 ? `- Recommended emotional triggers: ${adaptiveStrategy.emotionalTriggers.join(', ')}` : ''}
${adaptiveStrategy.guidance.length > 0 ? `- Guidance: ${adaptiveStrategy.guidance.join(' ')}` : ''}

Requirements:
1. Start with a stop-scroll hook that uses curiosity, tension, contradiction, or a sharp knowledge gap in the first line
2. Be authentic, conversational, and engaging - write for humans, not algorithms
3. Stay within the shortest platform's character limit
4. Match the brand voice and tone
5. Include a clear call-to-action where appropriate
6. Adjust the content type toward the highest-performing learned pattern when it fits the idea
7. Never sound robotic or templated
8. If a live trend is genuinely relevant, weave it in without breaking niche consistency
9. Do not generate anything harmful, deceptive, exploitative, unsafe, or likely to violate social platform rules
10. Avoid dangerous claims, hate, harassment, scams, manipulative bait, medical/legal/financial guarantees, or misleading promises
11. Stay tightly inside the locked niche if one is provided. Do not drift into generic motivation, self-help, or broad lifestyle advice unless the niche explicitly calls for it

Provide:
1. The main post text
2. Three alternative versions with different hooks/angles
3. 5-8 relevant hashtags (only if appropriate for the platforms)

Format your response as JSON:
{
  "main": "the main post text",
  "variations": ["variation 1", "variation 2", "variation 3"],
  "hashtags": ["hashtag1", "hashtag2", ...]
}`;

  let response: string;
  try {
    response = await universalChat(prompt, { model, brandKit: brand });
  } catch (error) {
    console.warn('Primary content generation failed, using offline fallback', error);
    return generateOfflineContent(options, brand);
  }
  
  // Parse JSON response
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    const platformPackages = await Promise.all(
      platforms.map(platform => generatePlatformCopyPackage(parsed.main || response, platform, brand))
    );
    return {
      text: parsed.main || response,
      variations: parsed.variations || [],
      hashtags: parsed.hashtags || [],
      platformPackages,
    };
  } catch {
    // Fallback: treat entire response as the content
    const platformPackages = await Promise.all(
      platforms.map(platform => generatePlatformCopyPackage(response, platform, brand))
    );
    return {
      text: response,
      variations: [],
      hashtags: [],
      platformPackages,
    };
  }
}

// Generate image for content
export async function generateContentImage(
  idea: string,
  brandKit?: BrandKit | null
): Promise<{ imageUrl: string; imagePrompt: string } | null> {
  const brand = brandKit || await loadBrandKit();
  
  // Generate prompt variations
  const prompts = await generatePromptVariations(idea, 3, brand);
  
  if (prompts.length === 0) {
    // Fallback to simple prompt
    prompts.push(`${idea}, professional social media content, high quality`);
  }

  // Try each prompt until we get a valid image
  for (let attempt = 0; attempt < MAX_IMAGE_RETRIES; attempt++) {
    const prompt = prompts[attempt % prompts.length];
    
    try {
      const imageUrl = await generateImage(prompt, { enhancePrompt: true });
      
      // Validate image quality
      const validation = await validateImageQuality(imageUrl);
      
      if (validation.passed) {
        return { imageUrl, imagePrompt: prompt };
      } else {
        console.warn(`Image validation failed: ${validation.reason}`);
      }
    } catch (error) {
      console.error(`Image generation attempt ${attempt + 1} failed:`, error);
    }
  }

  return null;
}

// Full content generation pipeline
export async function runContentPipeline(
  options: GenerationOptions,
  onProgress?: (stage: string, progress: number) => void
): Promise<ContentDraft> {
  const { includeImage = true } = options;
  const brandKit = await loadBrandKit();
  const tracking = await trackGenerationStart({
    source: 'studio',
    taskType: 'content',
    idea: options.idea,
    platforms: options.platforms,
    allowRetryFailed: true,
  });

  if (tracking.duplicate) {
    if (tracking.record.status === 'completed' && tracking.record.artifactId) {
      const existingDraft = await loadDraft(tracking.record.artifactId);
      if (existingDraft) {
        return existingDraft;
      }
    }

    if (tracking.record.status === 'pending') {
      throw new Error('A matching content generation is already in progress.');
    }
  }

  try {
    // Stage 1: Strategy (already defined by options)
    onProgress?.('Analyzing strategy...', 10);

    // Stage 2: Generate text content
    onProgress?.('Generating content...', 25);
    const content = await generateContent(options, brandKit);

    // Stage 3: Generate image if requested
    let imageResult: { imageUrl: string; imagePrompt: string } | null = null;
    if (includeImage && !isOfflineMode()) {
      onProgress?.('Creating image...', 50);
      imageResult = await generateContentImage(options.idea, brandKit);
    }

    // Stage 4: Create draft with version
    onProgress?.('Saving draft...', 85);
    const version: ContentVersion = {
      v: 1,
      text: content.text,
      imageUrl: imageResult?.imageUrl,
      imagePrompt: imageResult?.imagePrompt,
      createdAt: new Date().toISOString(),
    };

    const draft: ContentDraft = {
      id: generateId(),
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      versions: [version],
      currentVersion: 1,
      status: 'draft',
      platforms: options.platforms,
    };

    await saveDraft(draft);
    await trackGenerationSuccess(tracking.record.id, {
      artifactId: draft.id,
      artifactType: 'draft',
    });
    void notificationService.notifyContentReady('draft', draft.id);

    onProgress?.('Complete!', 100);
    return draft;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Generation failed';
    await trackGenerationFailure(tracking.record.id, errorMessage);
    void notificationService.notifyContentFailed('content draft', errorMessage);
    throw error;
  }
}

// Regenerate content for a draft
export async function regenerateContent(
  draft: ContentDraft,
  what: 'text' | 'image' | 'both',
  customInstructions?: string
): Promise<ContentDraft> {
  const brandKit = await loadBrandKit();
  const latestVersion = draft.versions[draft.versions.length - 1];
  
  let newText = latestVersion.text;
  let newImageUrl = latestVersion.imageUrl;
  let newImagePrompt = latestVersion.imagePrompt;

  if (what === 'text' || what === 'both') {
    const result = await generateContent({
      idea: customInstructions || latestVersion.text.substring(0, 100),
      platforms: draft.platforms,
      customInstructions: customInstructions || 'Create a fresh variation with a different angle',
    }, brandKit);
    newText = result.text;
  }

  if (what === 'image' || what === 'both') {
    const imageResult = await generateContentImage(
      customInstructions || latestVersion.imagePrompt || newText,
      brandKit
    );
    if (imageResult) {
      newImageUrl = imageResult.imageUrl;
      newImagePrompt = imageResult.imagePrompt;
    }
  }

  // Add new version
  const newVersion: ContentVersion = {
    v: latestVersion.v + 1,
    text: newText,
    imageUrl: newImageUrl,
    imagePrompt: newImagePrompt,
    createdAt: new Date().toISOString(),
  };

  draft.versions.push(newVersion);
  draft.updated = new Date().toISOString();

  await saveDraft(draft);
  return draft;
}

// Edit content text
export async function editContentText(
  draft: ContentDraft,
  newText: string
): Promise<ContentDraft> {
  const latestVersion = draft.versions[draft.versions.length - 1];

  const newVersion: ContentVersion = {
    v: latestVersion.v + 1,
    text: newText,
    imageUrl: latestVersion.imageUrl,
    imagePrompt: latestVersion.imagePrompt,
    createdAt: new Date().toISOString(),
  };

  draft.versions.push(newVersion);
  draft.updated = new Date().toISOString();

  await saveDraft(draft);
  return draft;
}

// Get content suggestions based on brand and trends
export async function getContentSuggestions(count = 5): Promise<string[]> {
  const brandKit = await loadBrandKit();
  const recentTopics = await getRecentTopics(10);

  if (!brandKit) {
    return [
      'Share a behind-the-scenes look at your work',
      'Post a tip or trick your audience would find valuable',
      'Ask your audience a question to boost engagement',
      'Share a success story or milestone',
      'Create content around a trending topic in your niche',
    ];
  }

  const prompt = `Generate ${count} specific content ideas for a ${brandKit.niche} brand.

Brand: ${brandKit.brandName}
Audience: ${brandKit.targetAudience}
Tone: ${brandKit.tone}
Content Pillars: ${brandKit.contentPillars.join(', ')}
${recentTopics.length > 0 ? `Avoid these recent topics: ${recentTopics.join('; ')}` : ''}

Requirements:
- Each idea should be specific and actionable
- Ideas should align with the content pillars
- Mix of educational, entertaining, and promotional content
- Consider current trends and seasonal relevance

Return ONLY a JSON array of strings:
["idea 1", "idea 2", ...]`;

  const response = await chat(prompt, { brandKit });

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Parse as newline-separated list
    return response
      .split('\n')
      .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(line => line.length > 10)
      .slice(0, count);
  }

  return [];
}

// Improve existing content
export async function improveContent(
  text: string,
  instruction: string,
  brandKit?: BrandKit | null
): Promise<string> {
  const brand = brandKit || await loadBrandKit();

  const prompt = `Improve this social media content according to the instruction.

Original content:
"${text}"

Instruction: ${instruction}

Requirements:
- Maintain the original meaning and core message
- Keep the brand voice consistent
- Stay within similar character count
- Make it more engaging and shareable

Return ONLY the improved content, nothing else.`;

  return chat(prompt, { brandKit: brand });
}
