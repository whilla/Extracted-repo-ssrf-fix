/**
 * INTELLIGENT CHAT SERVICE
 * Acts like ChatGPT - reasoning, brand-aware, proactive suggestions
 */

import { kvGet } from './puterService';
import { universalChat } from './aiService';

export interface BrandContext {
  niche: string;
  audience: string;
  tone: string;
  characterLock: string;
  styleRules: string;
  contentPillars: string[];
  bannedTopics: string[];
  platformPreferences: Record<string, string>;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface IntelligentResponse {
  response: string;
  reasoning: string;
  suggestions: string[];
  brandUsed: boolean;
  context: {
    niche?: string;
    platform?: string;
  };
}

async function loadBrandContext(): Promise<BrandContext | null> {
  try {
    const brandKit = await kvGet('brand_kit');
    if (!brandKit) return null;

    const brand = typeof brandKit === 'string' ? JSON.parse(brandKit) : brandKit;
    
    return {
      niche: brand.niche || brand.brandNiche || '',
      audience: brand.targetAudience || brand.audience || '',
      tone: brand.tone || 'professional',
      characterLock: brand.characterLock || brand.character || '',
      styleRules: brand.styleRules || brand.writingStyle || '',
      contentPillars: brand.contentPillars || brand.pillars || [],
      bannedTopics: brand.bannedTopics || [],
      platformPreferences: brand.platformPreferences || {},
    };
  } catch (e) {
    console.warn('[IntelligentChat] Failed to load brand context:', e);
    return null;
  }
}

function buildSystemPrompt(brand: BrandContext | null, userContext?: string): string {
  const parts: string[] = [
    `You are a highly intelligent AI assistant that thinks step-by-step before responding.`,
    `You are helpful, creative, witty, and provide detailed explanations.`,
    `You ALWAYS provide proactive suggestions unless the user explicitly says not to.`,
    `When appropriate, offer related ideas, improvements, or next steps.`,
  ];

  if (brand) {
    parts.push(`\n\n=== BRAND CONTEXT (ALWAYS USE THIS) ===`);
    parts.push(`Niche: ${brand.niche}`);
    parts.push(`Target Audience: ${brand.audience}`);
    parts.push(`Tone: ${brand.tone}`);
    parts.push(`Character: ${brand.characterLock}`);
    parts.push(`Style Rules: ${brand.styleRules}`);
    
    if (brand.contentPillars.length > 0) {
      parts.push(`Content Pillars: ${brand.contentPillars.join(', ')}`);
    }
    if (brand.bannedTopics.length > 0) {
      parts.push(`Banned Topics: ${brand.bannedTopics.join(', ')}`);
    }
    
    parts.push(`\nWhen generating content, ALWAYS align with this brand context.`);
    parts.push(`If something conflicts with brand rules, modify it to fit.`);
  }

  if (userContext) {
    parts.push(`\n=== CURRENT CONTEXT ===\n${userContext}`);
  }

  parts.push(`\n=== RESPONSE FORMAT ===`);
  parts.push(`1. First, show your reasoning (think step-by-step)`);
  parts.push(`2. Then provide your main response`);
  parts.push(`3. Finally, offer 2-3 proactive suggestions unless asked not to`);

  return parts.join('\n');
}

export async function intelligentChat(
  userMessage: string,
  conversationHistory: ChatMessage[] = [],
  options?: {
    platform?: string;
    taskType?: string;
    customContext?: string;
    includeReasoning?: boolean;
  }
): Promise<IntelligentResponse> {
  const brand = await loadBrandContext();
  
  const systemPrompt = buildSystemPrompt(brand, options?.customContext);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-10), // Last 10 messages for context
    { role: 'user', content: userMessage },
  ];

  const prompt = messages.map(m => 
    `${m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System'}: ${m.content}`
  ).join('\n\n');

  try {
    const response = await universalChat(prompt, {
      model: 'gpt-4o',
      brandKit: brand ? {
        brandName: brand.niche,
        niche: brand.niche,
        tone: brand.tone,
        uniqueSellingPoint: brand.characterLock,
        targetAudience: brand.audience,
      } : undefined,
    });

    // Parse response to extract reasoning and suggestions
    const parsed = parseSmartResponse(response);

    return {
      response: parsed.mainResponse,
      reasoning: parsed.reasoning,
      suggestions: parsed.suggestions,
      brandUsed: !!brand,
      context: {
        niche: brand?.niche,
        platform: options?.platform,
      },
    };
  } catch (error) {
    console.error('[IntelligentChat] Error:', error);
    throw error;
  }
}

function parseSmartResponse(response: string): {
  mainResponse: string;
  reasoning: string;
  suggestions: string[];
} {
  const reasoningMatch = response.match(/Reasoning:?\s*([\s\S]*?)(?=Response:|$)/i);
  const suggestionsMatch = response.match(/Suggestions:?\s*([\s\S]*?)$/i);
  
  let mainResponse = response;
  let reasoning = '';
  let suggestions: string[] = [];

  // If structured response
  if (response.includes('Reasoning:') || response.includes('**Reasoning**')) {
    mainResponse = response
      .replace(/Reasoning:?\s*[\s\S]*?(?=Response:|$)/i, '')
      .replace(/\*\*Reasoning\*\*[\s\S]*?(?=\*\*Response\*\*|$)/i, '')
      .trim();
  }

  if (reasoningMatch) {
    reasoning = reasoningMatch[1].trim();
  } else if (response.length > 200) {
    // Extract first paragraph as reasoning
    const paragraphs = response.split('\n\n');
    if (paragraphs.length > 1) {
      reasoning = paragraphs[0];
      mainResponse = paragraphs.slice(1).join('\n\n');
    }
  }

  if (suggestionsMatch) {
    const suggestionText = suggestionsMatch[1];
    suggestions = suggestionText
      .split(/[-•\d.]/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
  } else if (response.toLowerCase().includes('suggest')) {
    // Try to extract suggestions from body
    const lines = response.split('\n');
    const suggestionLines = lines.filter(l => 
      l.toLowerCase().includes('suggest') || 
      l.toLowerCase().includes('you could') ||
      l.toLowerCase().includes('try') ||
      l.startsWith('-')
    );
    suggestions = suggestionLines.slice(0, 3).map(l => l.replace(/^[-•\d.]+\s*/, ''));
  }

  // If no suggestions found, add defaults
  if (suggestions.length === 0) {
    suggestions = [
      'Would you like me to generate a post from this?',
      'Should I analyze any files you have?',
      'Want me to help schedule this content?',
    ];
  }

  return { mainResponse: mainResponse.trim(), reasoning, suggestions };
}

// Smart scheduling - analyze content and suggest optimal times
export async function analyzeScheduling(
  content: string,
  platforms: string[]
): Promise<{
  reasoning: string;
  suggestedTimes: Record<string, string>;
  bestPlatform: string;
}> {
  const brand = await loadBrandContext();
  
  const prompt = `Analyze this content and suggest optimal posting times.
  
Content: ${content}
Platforms: ${platforms.join(', ')}

${brand ? `Brand: ${brand.niche}, Audience: ${brand.audience}, Tone: ${brand.tone}` : ''}

For each platform:
1. Determine if it's time-sensitive or evergreen
2. Consider the target audience's active hours
3. Research best posting times for that platform
4. Provide specific date/time suggestions

Response format:
- Best Platform: [which platform to prioritize]
- Reasoning: [step-by-step analysis]
- Schedule: [platform -> best time]`;

  try {
    const response = await universalChat(prompt, { model: 'gpt-4o' });
    
    const bestPlatformMatch = response.match(/Best Platform:?\s*([^\n]+)/i);
    const scheduleMatches = response.match(/Schedule:?\s*([\s\S]*?)$/i);
    
    const suggestedTimes: Record<string, string> = {};
    if (scheduleMatches) {
      const schedule = scheduleMatches[1];
      platforms.forEach(p => {
        const match = schedule.match(new RegExp(p + ':?\\s*([^\\n]+)', 'i'));
        if (match) suggestedTimes[p] = match[1].trim();
      });
    }

    return {
      reasoning: response,
      suggestedTimes: suggestedTimes || {},
      bestPlatform: bestPlatformMatch ? bestPlatformMatch[1].trim() : platforms[0],
    };
  } catch (e) {
    console.error('[SmartSchedule] Error:', e);
    return {
      reasoning: 'Unable to analyze scheduling.',
      suggestedTimes: {},
      bestPlatform: platforms[0],
    };
  }
}

export default {
  intelligentChat,
  analyzeScheduling,
  loadBrandContext,
};