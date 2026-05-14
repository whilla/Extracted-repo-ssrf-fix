

import { universalChat } from './aiService';

export interface NicheAnalysisInput {
  request: string;
  niche?: string;
  tone?: string;
  goal?: string;
}

export interface BrandProfile {
  niche: string;
  tone: string;
  goal: string;
  contentType: 'story' | 'education' | 'entertainment' | 'business' | 'hybrid';
  audienceIntent: 'learn' | 'feel' | 'watch' | 'engage' | 'convert';
  audience: string;
  emotionalTriggers: string[];
  styleTags: string[];
}

const DEFAULT_PROFILE: BrandProfile = {
  niche: 'general creator',
  tone: 'direct and human',
  goal: 'increase engagement',
  contentType: 'hybrid',
  audienceIntent: 'engage',
  audience: 'broad social audience',
  emotionalTriggers: ['curiosity', 'contrast'],
  styleTags: ['cinematic', 'concise'],
};

function sanitizeStringList(values: unknown, fallback: string[], limit = 6): string[] {
  if (!Array.isArray(values)) return fallback;

  const cleaned = values
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, limit);

  return cleaned.length > 0 ? cleaned : fallback;
}

function detectContentType(text: string): BrandProfile['contentType'] {
  const lower = text.toLowerCase();
  if (/\b(story|scene|character|episode|narrative|cinematic)\b/.test(lower)) return 'story';
  if (/\b(teach|lesson|guide|explain|tutorial|education)\b/.test(lower)) return 'education';
  if (/\b(entertain|funny|viral|trend|meme|reel)\b/.test(lower)) return 'entertainment';
  if (/\b(business|brand|sales|offer|product|lead)\b/.test(lower)) return 'business';
  return 'hybrid';
}

function detectAudienceIntent(text: string): BrandProfile['audienceIntent'] {
  const lower = text.toLowerCase();
  if (/\b(learn|understand|how to|step|framework)\b/.test(lower)) return 'learn';
  if (/\b(feel|emotion|suspense|horror|inspire)\b/.test(lower)) return 'feel';
  if (/\b(watch|loop|retention|replay|scene)\b/.test(lower)) return 'watch';
  if (/\b(convert|sale|buy|lead|signup|book)\b/.test(lower)) return 'convert';
  return 'engage';
}

export async function analyzeNiche(input: NicheAnalysisInput): Promise<BrandProfile> {
  const merged = `${input.request}\nNiche: ${input.niche || ''}\nTone: ${input.tone || ''}\nGoal: ${input.goal || ''}`.trim();
  const heuristic: BrandProfile = {
    niche: input.niche?.trim() || 'general creator',
    tone: input.tone?.trim() || 'direct and human',
    goal: input.goal?.trim() || 'increase engagement',
    contentType: detectContentType(merged),
    audienceIntent: detectAudienceIntent(merged),
    audience: /(?:audience|for)\s*[:=-]?\s*([^\n.]{4,80})/i.exec(merged)?.[1]?.trim() || 'social content consumers',
    emotionalTriggers: ['curiosity', 'contrast', 'specificity'],
    styleTags: ['cinematic', 'retention-focused'],
  };

  try {
    const prompt = `You are the Niche Analyzer inside a universal AI content engine.
Extract a compact brand profile that can drive text, image, video, voice, music, sound design, and platform optimization.
Be specific and avoid generic labels.

REQUEST:
${merged}

Return valid JSON only:
{
  "niche": "string",
  "tone": "string",
  "goal": "string",
  "contentType": "story|education|entertainment|business|hybrid",
  "audienceIntent": "learn|feel|watch|engage|convert",
  "audience": "string",
  "emotionalTriggers": ["..."],
  "styleTags": ["..."]
}`;
    const response = await universalChat(prompt, { model: 'gpt-4o' });
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return heuristic;
    const parsed = JSON.parse(match[0]) as Partial<BrandProfile>;

    return {
      niche: parsed.niche?.trim() || heuristic.niche || DEFAULT_PROFILE.niche,
      tone: parsed.tone?.trim() || heuristic.tone || DEFAULT_PROFILE.tone,
      goal: parsed.goal?.trim() || heuristic.goal || DEFAULT_PROFILE.goal,
      contentType: parsed.contentType || heuristic.contentType,
      audienceIntent: parsed.audienceIntent || heuristic.audienceIntent,
      audience: parsed.audience?.trim() || heuristic.audience,
      emotionalTriggers: sanitizeStringList(parsed.emotionalTriggers, heuristic.emotionalTriggers),
      styleTags: sanitizeStringList(parsed.styleTags, heuristic.styleTags),
    };
  } catch {
    return heuristic;
  }
}
