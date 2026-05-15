/**
 * Post Generator Service
 * Unified service for generating social media posts with descriptions and emojis
 */

import { universalChat } from './aiService';
import type { BrandKit, Platform } from '@/lib/types';
import { loadBrandKit, generateId } from './memoryService';

function sanitizePromptInput(input: string): string {
  if (!input) return '';
  return input
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .slice(0, 5000);
}

function sanitizeJsonString(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .slice(0, 10000);
}

const EMOJI_MAP: Record<string, string[]> = {
  announcement: ['🚀', '📣', '✨', '🎉'],
  celebration: ['🎊', '🥳', '🎉', '🙌'],
  question: ['❓', '🤔', '💭', '🔍'],
  tip: ['💡', '✨', '🔧', '⚡'],
  warning: ['⚠️', '🛑', '🚨', '📢'],
  love: ['❤️', '😍', '🥰', '💕'],
  success: ['✅', '🎯', '🏆', '💪'],
  thinking: ['🧠', '💭', '🤔', '📝'],
  fire: ['🔥', '💯', '⚡', '🚀'],
  money: ['💰', '💵', '📈', '💎'],
  time: ['⏰', '⏱️', '🕐', '📅'],
  eyes: ['👀', '👁️', '🫣', '✨'],
  search: ['🔎', '📚', '📖', '🔍'],
  rocket: ['🚀', '🌠', '⭐', '💫'],
  work: ['💼', '📊', '📈', '🎯'],
  education: ['📚', '🎓', '🧑‍🏫', '📝'],
  tech: ['💻', '🤖', '🔧', '⚙️'],
};

export interface PostContent {
  id: string;
  text: string;
  description: string;
  variations: string[];
  hashtags: string[];
  emojis: string[];
  platform: Platform;
  characterCount: number;
  createdAt: string;
}

export interface PostGenerationOptions {
  idea: string;
  platform: Platform;
  format?: 'post' | 'thread' | 'story' | 'carousel' | 'reel';
  tone?: 'professional' | 'casual' | 'humorous' | 'inspirational' | 'educational';
  includeEmoji?: boolean;
  includeDescription?: boolean;
  includeHashtags?: boolean;
  customInstructions?: string;
}

export interface ChatResponse {
  message: string;
  type: 'text' | 'code' | 'list' | 'warning';
  suggestions?: string[];
}

function getRandomEmoji(category: string): string {
  const emojis = EMOJI_MAP[category] || EMOJI_MAP['fire'];
  return emojis[Math.floor(Math.random() * emojis.length)];
}

function selectEmojisForContent(content: string, maxCount: number = 3): string[] {
  const categories: string[] = [];
  
  if (/announce|new|launch|introducing/i.test(content)) categories.push('announcement');
  if (/congrats|celebrat|happy|excited/i.test(content)) categories.push('celebration');
  if (/\?|why|how|what if/i.test(content)) categories.push('question');
  if (/tip|advice|learn|trick/i.test(content)) categories.push('tip');
  if (/warn|caution|important|注意/i.test(content)) categories.push('warning');
  if (/love|amazing|incredible|beautiful/i.test(content)) categories.push('love');
  if (/success|win|achieved|accomplish/i.test(content)) categories.push('success');
  if (/think|idea|opinion|believe/i.test(content)) categories.push('thinking');
  if (/hot|trending|viral|fire/i.test(content)) categories.push('fire');
  if (/money|profit|earn|sale/i.test(content)) categories.push('money');
  if (/time|soon|deadline|limited/i.test(content)) categories.push('time');
  if (/check|look|see|discover/i.test(content)) categories.push('eyes');
  if (/search|find|research|explore/i.test(content)) categories.push('search');
  if (/launch|start|grow|scale/i.test(content)) categories.push('rocket');
  if (/work|job|career|business/i.test(content)) categories.push('work');
  if (/learn|study|course|teach/i.test(content)) categories.push('education');
  if (/code|tech|software|ai/i.test(content)) categories.push('tech');
  
  const selectedEmojis: string[] = [];
  for (const category of categories.slice(0, Math.min(2, maxCount))) {
    selectedEmojis.push(getRandomEmoji(category));
  }
  
  return selectedEmojis.slice(0, maxCount);
}

export async function generatePostDescription(
  content: string,
  platform: Platform,
  brandKit?: BrandKit | null
): Promise<string> {
  const brand = brandKit || await loadBrandKit();
  
  const emoji = selectEmojisForContent(content, 2);
  
  const prompt = `Generate a SHORT, engaging description (1-2 sentences max, under 100 chars) for this ${platform} post that highlights its value. 
  Use conversational, catchy tone. ${emoji.length > 0 ? `Include these emojis naturally: ${emoji.join(' ')}` : 'Add relevant emojis if appropriate.'}
  
  Post content: "${sanitizeJsonString(content.slice(0, 200))}"
  Brand niche: ${sanitizePromptInput(brand?.niche || 'general')}
  
  Return just the description text, nothing else.`;

  try {
    const response = await universalChat(prompt, { 
      model: 'gpt-4o-mini', 
      brandKit: brand 
    });
    
    let description = response.trim();
    if (description.length > 100) {
      description = description.slice(0, 97) + '...';
    }
    
    return description;
  } catch (error) {
    console.warn('[PostGenerator] Description generation failed:', error);
    return `Check out this ${platform} post! ${emoji.join(' ')}`;
  }
}

export async function generatePost(
  options: PostGenerationOptions,
  brandKit?: BrandKit | null
): Promise<PostContent> {
  const { 
    idea, 
    platform, 
    format = 'post',
    tone,
    includeEmoji = true,
    includeDescription = true,
    includeHashtags = true,
    customInstructions 
  } = options;

  const brand = brandKit || await loadBrandKit();

  const platformCharLimits: Record<Platform, number> = {
    twitter: 280,
    instagram: 2200,
    tiktok: 2200,
    linkedin: 3000,
    facebook: 63206,
    threads: 500,
    youtube: 5000,
    pinterest: 500,
    discord: 2000,
    reddit: 40000,
    whatsapp: 4096,
    telegram: 4096,
    snapchat: 1000,
    wordpress: 50000,
    medium: 100000,
    ghost: 50000,
    substack: 100000,
    mailchimp: 10000,
    klaviyo: 10000,
    convertkit: 10000,
    general: 5000,
  };

  const charLimit = platformCharLimits[platform];

  const prompt = `Generate a ${format} for ${platform}.

IDEA/TOPIC: ${idea}
PLATFORM: ${platform}
MAX CHARACTERS: ${charLimit}
${tone ? `TONE: ${tone}` : ''}
${customInstructions ? `SPECIAL INSTRUCTIONS: ${customInstructions}` : ''}

BRAND CONTEXT:
- Niche: ${brand?.niche || 'general'}
- Tone: ${brand?.tone || 'natural, conversational'}
- USP: ${brand?.uniqueSellingPoint || ''}
- Content pillars: ${brand?.contentPillars?.join(', ') || 'general'}

REQUIREMENTS:
1. ${includeEmoji ? 'Include 1-3 relevant emojis naturally distributed' : 'No emojis required'}
2. Start with a hook that stops the scroll
3. Write in a natural, human voice - NOT robotic
4. Stay within ${charLimit} characters
5. Include a clear CTA where appropriate
6. ${includeHashtags ? 'Include 3-5 relevant hashtags at the end' : 'No hashtags required'}
7. Make it engaging and valuable

FORMAT:
{
  "text": "Your post content with emojis if enabled",
  "variations": ["alt version 1", "alt version 2"],
  "hashtags": ["relevant", "hashtags"]
}`;

  let response: string;
  try {
    response = await universalChat(prompt, { model: 'gpt-4o', brandKit: brand });
  } catch (error) {
    throw new Error(`Post generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  let parsed: {
    text?: string;
    variations?: string[];
    hashtags?: string[];
  };

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON in response');
    }
  } catch {
    parsed = {
      text: response,
      variations: [],
      hashtags: [],
    };
  }

  const text = parsed.text || '';
  const emojis = includeEmoji ? selectEmojisForContent(text) : [];
  
  let description = '';
  if (includeDescription) {
    description = await generatePostDescription(text, platform, brand);
  }

  const hashtags = includeHashtags ? (parsed.hashtags || []) : [];

  return {
    id: generateId(),
    text,
    description,
    variations: parsed.variations || [],
    hashtags,
    emojis,
    platform,
    characterCount: text.length,
    createdAt: new Date().toISOString(),
  };
}

export async function generatePostVariations(
  originalPost: string,
  platform: Platform,
  count: number = 3,
  brandKit?: BrandKit | null
): Promise<string[]> {
  const brand = brandKit || await loadBrandKit();
  
  const prompt = `Generate ${count} different variations of this ${platform} post.
  
Original: "${sanitizeJsonString(originalPost)}"

Requirements:
1. Each variation should have a different hook/angle
2. Keep the same core message but change the presentation
3. Include relevant emojis naturally
4. Stay within platform character limits

Return as JSON array:
["variation 1", "variation 2", "variation 3"]`;

  try {
    const response = await universalChat(prompt, { model: 'gpt-4o-mini', brandKit: brand });
    const matches = response.match(/\[[\s\S]*\]/);
    if (matches) {
      return JSON.parse(matches[0]);
    }
  } catch (error) {
    console.warn('[PostGenerator] Variation generation failed:', error);
  }
  
  return [];
}

export async function chatWithAgent(
  message: string,
  context?: {
    brandKit?: BrandKit | null;
    recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    purpose?: 'content_creation' | 'general' | 'strategy';
  }
): Promise<ChatResponse> {
  const brand = context?.brandKit || await loadBrandKit();
  const messages = context?.recentMessages || [];
  
  const systemContent = context?.purpose === 'content_creation'
    ? 'You are a senior social media operator. Create scroll-stopping, platform-native content. Every output needs a strong hook, clear emotional arc, and specific CTA. Write like a human — no templates, no clichés, no AI-isms. If brand context is provided, enforce it strictly.'
    : context?.purpose === 'strategy'
    ? 'You are a strategic content advisor. Evaluate ideas on audience fit, differentiation, and conversion potential. Challenge weak ideas directly. Provide specific, actionable recommendations — not vague suggestions.'
    : 'You are a direct, capable social media operator. Answer questions concisely. Skip corporate fluff. If you do not know something, say so — do not guess.';

  const chatMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemContent },
    ...messages.slice(-10).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: sanitizePromptInput(m.content),
    })),
    { role: 'user', content: sanitizePromptInput(message) },
  ];

  try {
    const response = await universalChat(chatMessages, { model: 'gpt-4o', brandKit: brand });
    
    let parsed: { message?: string; type?: string; suggestions?: string[] };
    
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch {
      parsed = { message: response, type: 'text' };
    }

    return {
      message: parsed.message || response,
      type: (parsed.type as ChatResponse['type']) || 'text',
      suggestions: parsed.suggestions,
    };
  } catch (error) {
    return {
      message: `Sorry, I encountered an error. Please try again.`,
      type: 'warning',
      suggestions: ['Try rephrasing your message', 'Check your connection'],
    };
  }
}

export function formatPostWithEmojis(text: string, positions: number[]): string {
  const emojis = selectEmojisForContent(text);
  if (emojis.length === 0) return text;
  
  const result = text;
  const words = result.split(' ');
  const emojiIndices = positions.filter(i => i < words.length);
  
  emojiIndices.forEach((idx, i) => {
    if (emojis[i]) {
      words[idx] = `${emojis[i]} ${words[idx]}`;
    }
  });
  
  return words.join(' ');
}

export function addEmojisToPost(text: string, count: number = 2): string {
  const emojis = selectEmojisForContent(text, count);
  if (emojis.length === 0) return text;
  
  const sentences = text.split(/(?<=[.!?])\s+/);
  
  if (sentences.length >= 2) {
    sentences[0] = `${emojis[0]} ${sentences[0]}`;
    if (sentences.length > 1 && emojis[1]) {
      sentences[sentences.length - 1] = `${sentences[sentences.length - 1]} ${emojis[emojis.length - 1]}`;
    }
  } else {
    return `${emojis.join(' ')} ${text}`;
  }
  
  return sentences.join(' ');
}