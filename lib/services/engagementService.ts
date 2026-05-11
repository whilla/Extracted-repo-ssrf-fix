/**
 * Social Engagement Service
 * Real-time comment replies, DM handling, and mentions
 */

import { kvGet, kvSet } from './puterService';
import { universalChat } from './aiService';
import type { Platform, BrandKit } from '@/lib/types';
import { loadBrandKit } from './memoryService';

export type EngagementType = 'comment' | 'mention' | 'dm' | 'reply';

export interface EngagementItem {
  id: string;
  type: EngagementType;
  platform: Platform;
  postId?: string;
  postContent?: string;
  author: string;
  authorHandle: string;
  authorAvatar?: string;
  content: string;
  timestamp: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | 'question';
  status: 'pending' | 'responded' | 'ignored' | 'escalated';
  response?: string;
  respondedAt?: string;
  ignoredAt?: string;
  escalatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ReplySuggestion {
  suggestedReply: string;
  tone: 'professional' | 'casual' | 'witty' | 'empathetic';
  emojis: string[];
  shouldRespond: boolean;
  reason: string;
}

const ENGAGEMENTS_KEY = 'social_engagements';
const ENGAGEMENT_CONFIG_KEY = 'engagement_config';

interface EngagementConfig {
  autoReply: boolean;
  sentimentThreshold: number;
  ignoredHandles: string[];
  responseTimeLimit: number;
}

const defaultConfig: EngagementConfig = {
  autoReply: false,
  sentimentThreshold: 0.5,
  ignoredHandles: [],
  responseTimeLimit: 3600,
};

function generateId(): string {
  return `eng_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function loadEngagements(): Promise<EngagementItem[]> {
  const data = await kvGet(ENGAGEMENTS_KEY);
  if (!data) return [];
  
  try {
    return JSON.parse(data);
  } catch (e) {
    console.error('[EngagementService] Failed to parse engagements data:', e);
    return [];
  }
}

async function saveEngagements(engagements: EngagementItem[]): Promise<void> {
  await kvSet(ENGAGEMENTS_KEY, JSON.stringify(engagements.slice(0, 500)));
}

export async function addEngagement(
  type: EngagementType,
  platform: Platform,
  author: string,
  authorHandle: string,
  content: string,
  options?: {
    postId?: string;
    postContent?: string;
    authorAvatar?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<EngagementItem> {
  if (!author?.trim()) {
    throw new Error('Author is required');
  }
  if (!authorHandle?.trim()) {
    throw new Error('Author handle is required');
  }
  if (!content?.trim()) {
    throw new Error('Content is required');
  }

  const engagements = await loadEngagements();

  const sentiment = analyzeSentiment(content);

  const item: EngagementItem = {
    id: generateId(),
    type,
    platform,
    author: author.trim(),
    authorHandle: authorHandle.trim(),
    content: content.trim(),
    timestamp: new Date().toISOString(),
    sentiment,
    status: 'pending',
    ...options,
  };

  engagements.unshift(item);
  await saveEngagements(engagements);

  return item;
}

function analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' | 'question' {
  const lower = text.toLowerCase();
  
  const positiveWords = ['love', 'great', 'amazing', 'awesome', 'thanks', 'thank', 'beautiful', 'perfect', 'excellent'];
  const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'disappointed', 'frustrat', 'angry'];
  const questionWords = ['?', 'how', 'what', 'why', 'when', 'where', 'can you', 'could'];

  for (const word of positiveWords) {
    if (lower.includes(word)) return 'positive';
  }
  for (const word of negativeWords) {
    if (lower.includes(word)) return 'negative';
  }
  for (const word of questionWords) {
    if (lower.includes(word)) return 'question';
  }
  return 'neutral';
}

export async function generateReplySuggestion(
  engagement: EngagementItem,
  brandKit?: BrandKit | null
): Promise<ReplySuggestion> {
  const brand = brandKit || await loadBrandKit();

  const sentimentEmojis: Record<string, string[]> = {
    positive: ['❤️', '🙏', '✨'],
    negative: ['😔', '💙', '🙏'],
    question: ['💡', '🙂', '✨'],
    neutral: ['👍', '💫'],
  };

  const prompt = `Generate a reply to this ${engagement.platform} ${engagement.type}.

Original ${engagement.type} from @${engagement.authorHandle}:
"${engagement.content}"

Post they're replying to: "${engagement.postContent || 'N/A'}"

BRAND CONTEXT:
- Brand name: ${brand?.brandName || 'brand'}
- Niche: ${brand?.niche || 'general'}
- Tone: ${brand?.tone || 'professional, friendly'}
- USP: ${brand?.uniqueSellingPoint || ''}

Requirements:
1. Keep reply under 280 characters
2. Match brand tone
3. Be authentic, not robotic
4. Add 1-2 relevant emojis naturally
5. For questions - answer helpfully
6. For negative - show empathy and offer help
7. For positive - show gratitude

Return JSON:
{
  "suggestedReply": "your reply here",
  "tone": "professional|casual|witty|empathetic",
  "emojis": ["emoji1", "emoji2"],
  "shouldRespond": true|false,
  "reason": "why you chose this response"
}`;

  try {
    const response = await universalChat(prompt, { model: 'gpt-4o-mini', brandKit: brand });
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('Parsed JSON is not an object');
        }
        
        const suggestedReply = typeof parsed.suggestedReply === 'string' ? parsed.suggestedReply : '';
        const tone = ['professional', 'casual', 'witty', 'empathetic'].includes(parsed.tone) 
          ? parsed.tone 
          : 'professional';
        const emojis = Array.isArray(parsed.emojis) 
          ? parsed.emojis.filter((e: unknown) => typeof e === 'string')
          : sentimentEmojis[engagement.sentiment || 'neutral'];
        const shouldRespond = typeof parsed.shouldRespond === 'boolean' ? parsed.shouldRespond : true;
        const reason = typeof parsed.reason === 'string' ? parsed.reason : 'AI suggestion';
        
        return {
          suggestedReply,
          tone,
          emojis,
          shouldRespond,
          reason,
        };
      } catch (parseError) {
        console.warn('[EngagementService] Failed to parse AI response JSON:', parseError);
      }
    }
  } catch (error) {
    console.warn('[EngagementService] Reply generation failed:', error);
  }

  const defaultReplies: Record<string, string> = {
    question: 'Thanks for reaching out! Let me help you with that.',
    positive: 'Thank you so much! We appreciate your support! 🙌',
    negative: 'We\'re sorry to hear that. Please DM us so we can help!',
    neutral: 'Thanks for the comment!',
  };

  return {
    suggestedReply: defaultReplies[engagement.sentiment || 'neutral'],
    tone: 'professional',
    emojis: sentimentEmojis[engagement.sentiment || 'neutral'],
    shouldRespond: engagement.sentiment === 'question' || engagement.sentiment === 'negative',
    reason: 'Default response based on sentiment',
  };
}

export async function respondToEngagement(
  engagementId: string,
  response: string
): Promise<boolean> {
  const engagements = await loadEngagements();
  const index = engagements.findIndex(e => e.id === engagementId);

  if (index === -1) return false;

  engagements[index].response = response;
  engagements[index].status = 'responded';
  engagements[index].respondedAt = new Date().toISOString();

  await saveEngagements(engagements);
  return true;
}

export async function getEngagements(options?: {
  type?: EngagementType;
  platform?: Platform;
  status?: EngagementItem['status'];
  limit?: number;
}): Promise<EngagementItem[]> {
  let engagements = await loadEngagements();

  if (options?.type) {
    engagements = engagements.filter(e => e.type === options.type);
  }
  if (options?.platform) {
    engagements = engagements.filter(e => e.platform === options.platform);
  }
  if (options?.status) {
    engagements = engagements.filter(e => e.status === options.status);
  }
  if (options?.limit) {
    engagements = engagements.slice(0, options.limit);
  }

  return engagements;
}

export async function getEngagementStats(): Promise<{
  total: number;
  pending: number;
  responded: number;
  byPlatform: Record<Platform, number>;
  bySentiment: Record<string, number>;
}> {
  const engagements = await loadEngagements();

  return {
    total: engagements.length,
    pending: engagements.filter(e => e.status === 'pending').length,
    responded: engagements.filter(e => e.status === 'responded').length,
    byPlatform: engagements.reduce((acc, e) => {
      acc[e.platform] = (acc[e.platform] || 0) + 1;
      return acc;
    }, {} as Record<Platform, number>),
    bySentiment: engagements.reduce((acc, e) => {
      acc[e.sentiment || 'neutral'] = (acc[e.sentiment || 'neutral'] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };
}

export async function ignoreEngagement(engagementId: string): Promise<boolean> {
  const engagements = await loadEngagements();
  const index = engagements.findIndex(e => e.id === engagementId);

  if (index === -1) return false;

  engagements[index].status = 'ignored';
  engagements[index].ignoredAt = new Date().toISOString();
  await saveEngagements(engagements);
  return true;
}

export async function escalateEngagement(engagementId: string): Promise<boolean> {
  const engagements = await loadEngagements();
  const index = engagements.findIndex(e => e.id === engagementId);

  if (index === -1) return false;

  engagements[index].status = 'escalated';
  engagements[index].escalatedAt = new Date().toISOString();
  await saveEngagements(engagements);
  return true;
}

export async function clearOldEngagements(daysOld: number = 30): Promise<number> {
  const engagements = await loadEngagements();
  const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  
  const filtered = engagements.filter(e => {
    const timestamp = new Date(e.timestamp).getTime();
    return isNaN(timestamp) || timestamp > cutoff;
  });
  
  const cleared = engagements.length - filtered.length;
  await saveEngagements(filtered);
  return cleared;
}