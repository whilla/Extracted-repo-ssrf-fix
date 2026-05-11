// Content Performance Prediction Service
import { universalChat } from './aiService';
import type { BrandKit, Platform } from '@/lib/types';

export interface PredictionResult {
  overallScore: number;         // 0-100 predicted performance
  engagementPrediction: {
    likes: string;              // Range like "500-1000"
    comments: string;
    shares: string;
    saves: string;
  };
  viralPotential: 'high' | 'medium' | 'low';
  bestPlatform: Platform;
  platformScores: Record<Platform, number>;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  timing: {
    bestDay: string;
    bestTime: string;
    urgency: 'post_now' | 'schedule' | 'refine_first';
  };
  audienceMatch: number;        // 0-100 how well it matches target audience
  trendAlignment: number;       // 0-100 alignment with current trends
}

export interface ContentAnalysis {
  hook: { score: number; feedback: string };
  body: { score: number; feedback: string };
  cta: { score: number; feedback: string };
  hashtags: { score: number; feedback: string };
  visuals: { score: number; feedback: string };
  overall: { score: number; feedback: string };
}

// Predict performance of content
export async function predictPerformance(
  content: string,
  platform: Platform,
  brandKit: BrandKit | null,
  options: {
    hasImage?: boolean;
    hasVideo?: boolean;
    hashtags?: string[];
    scheduledTime?: Date;
  } = {}
): Promise<PredictionResult> {
  const prompt = `Analyze this ${platform} post and predict its performance.

Content: "${content}"

Context:
- Platform: ${platform}
- Has image: ${options.hasImage || false}
- Has video: ${options.hasVideo || false}
- Hashtags: ${options.hashtags?.join(', ') || 'none specified'}
- Brand niche: ${brandKit?.niche || 'general'}
- Target audience: ${brandKit?.audience || 'general audience'}
${options.scheduledTime ? `- Scheduled for: ${options.scheduledTime.toISOString()}` : ''}

Provide a comprehensive performance prediction. Return JSON:
{
  "overallScore": 0-100,
  "engagementPrediction": {
    "likes": "range like 100-500",
    "comments": "range",
    "shares": "range",
    "saves": "range"
  },
  "viralPotential": "high|medium|low",
  "bestPlatform": "which platform this content would perform best on",
  "platformScores": {
    "twitter": 0-100,
    "instagram": 0-100,
    "linkedin": 0-100,
    "facebook": 0-100,
    "tiktok": 0-100
  },
  "strengths": ["what works well"],
  "weaknesses": ["what could be improved"],
  "suggestions": ["specific actionable improvements"],
  "timing": {
    "bestDay": "day of week",
    "bestTime": "time range",
    "urgency": "post_now|schedule|refine_first"
  },
  "audienceMatch": 0-100,
  "trendAlignment": 0-100
}

Be realistic and specific. Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt, { brandKit });
    return JSON.parse(response);
  } catch {
    return getDefaultPrediction(platform);
  }
}

// Analyze content in detail
export async function analyzeContent(
  content: string,
  platform: Platform,
  brandKit: BrandKit | null
): Promise<ContentAnalysis> {
  const prompt = `Analyze this ${platform} post in detail.

Content: "${content}"

Brand voice: ${brandKit?.tone || 'professional'}
Niche: ${brandKit?.niche || 'general'}

Score and provide feedback on each element. Return JSON:
{
  "hook": {
    "score": 0-100,
    "feedback": "detailed feedback on the opening/hook"
  },
  "body": {
    "score": 0-100,
    "feedback": "feedback on the main content"
  },
  "cta": {
    "score": 0-100,
    "feedback": "feedback on call to action"
  },
  "hashtags": {
    "score": 0-100,
    "feedback": "feedback on hashtag usage"
  },
  "visuals": {
    "score": 0-100,
    "feedback": "suggestions for visual content"
  },
  "overall": {
    "score": 0-100,
    "feedback": "overall assessment and key improvement"
  }
}

Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt, { brandKit });
    return JSON.parse(response);
  } catch {
    return {
      hook: { score: 70, feedback: 'Analysis unavailable' },
      body: { score: 70, feedback: 'Analysis unavailable' },
      cta: { score: 70, feedback: 'Analysis unavailable' },
      hashtags: { score: 70, feedback: 'Analysis unavailable' },
      visuals: { score: 70, feedback: 'Analysis unavailable' },
      overall: { score: 70, feedback: 'Analysis unavailable' },
    };
  }
}

// Get quick score without detailed analysis
export async function getQuickScore(
  content: string,
  platform: Platform
): Promise<{ score: number; emoji: string; label: string }> {
  const prompt = `Rate this ${platform} post on a scale of 0-100 for predicted engagement.

"${content}"

Return ONLY a number between 0-100.`;

  try {
    const response = await universalChat(prompt);
    const score = parseInt(response.match(/\d+/)?.[0] || '50', 10);
    
    return {
      score: Math.min(100, Math.max(0, score)),
      emoji: score >= 80 ? '🔥' : score >= 60 ? '👍' : score >= 40 ? '😐' : '👎',
      label: score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Average' : 'Needs Work',
    };
  } catch {
    return { score: 50, emoji: '😐', label: 'Unknown' };
  }
}

// Compare multiple content versions
export async function comparePredictions(
  contents: string[],
  platform: Platform,
  brandKit: BrandKit | null
): Promise<{
  rankings: Array<{ content: string; score: number; rank: number }>;
  winner: string;
  analysis: string;
}> {
  const prompt = `Compare these ${contents.length} ${platform} posts and rank them by predicted performance.

${contents.map((c, i) => `Option ${i + 1}: "${c}"`).join('\n\n')}

Brand: ${brandKit?.niche || 'general'}

Return JSON:
{
  "rankings": [
    { "content": "Option 1", "score": 85, "rank": 1 },
    { "content": "Option 2", "score": 72, "rank": 2 }
  ],
  "winner": "full content of the winner",
  "analysis": "why the winner is better"
}

Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt, { brandKit });
    return JSON.parse(response);
  } catch {
    return {
      rankings: contents.map((c, i) => ({ content: c, score: 50, rank: i + 1 })),
      winner: contents[0],
      analysis: 'Analysis unavailable',
    };
  }
}

// Suggest improvements to reach a target score
export async function suggestImprovements(
  content: string,
  currentScore: number,
  targetScore: number,
  platform: Platform,
  brandKit: BrandKit | null
): Promise<{
  improvedContent: string;
  changes: string[];
  expectedScore: number;
}> {
  const prompt = `Improve this ${platform} post to increase its predicted score from ${currentScore} to ${targetScore}+.

Original: "${content}"

Brand voice: ${brandKit?.tone || 'professional'}
Niche: ${brandKit?.niche || 'general'}

Return JSON:
{
  "improvedContent": "the improved version",
  "changes": ["list of changes made"],
  "expectedScore": predicted score after improvements
}

Make meaningful improvements while keeping the core message.
Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt, { brandKit });
    return JSON.parse(response);
  } catch {
    return {
      improvedContent: content,
      changes: ['Unable to generate improvements'],
      expectedScore: currentScore,
    };
  }
}

// Predict best time to post for this specific content
export async function predictBestTime(
  content: string,
  platform: Platform,
  brandKit: BrandKit | null
): Promise<{
  bestTimes: Array<{ day: string; time: string; reason: string }>;
  worstTimes: Array<{ day: string; time: string; reason: string }>;
}> {
  const prompt = `Based on this ${platform} content, what are the best times to post it?

Content: "${content}"

Niche: ${brandKit?.niche || 'general'}
Target audience: ${brandKit?.audience || 'general'}

Consider:
- Content topic and relevance to time
- Target audience's typical online hours
- Platform-specific optimal times

Return JSON:
{
  "bestTimes": [
    { "day": "Tuesday", "time": "9:00 AM", "reason": "why this time is good" }
  ],
  "worstTimes": [
    { "day": "Saturday", "time": "3:00 AM", "reason": "why this time is bad" }
  ]
}

Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt, { brandKit });
    return JSON.parse(response);
  } catch {
    return {
      bestTimes: [{ day: 'Tuesday', time: '10:00 AM', reason: 'General peak engagement' }],
      worstTimes: [{ day: 'Saturday', time: '3:00 AM', reason: 'Low activity' }],
    };
  }
}

// Helper function
function getDefaultPrediction(platform: Platform): PredictionResult {
  return {
    overallScore: 50,
    engagementPrediction: {
      likes: '50-200',
      comments: '5-20',
      shares: '2-10',
      saves: '5-15',
    },
    viralPotential: 'low',
    bestPlatform: platform,
    platformScores: {
      twitter: 50,
      instagram: 50,
      linkedin: 50,
      facebook: 50,
      tiktok: 50,
      threads: 50,
      youtube: 50,
      pinterest: 50,
      discord: 50,
      reddit: 50,
      whatsapp: 50,
      telegram: 50,
      snapchat: 50,
      general: 50,
    },
    strengths: ['Unable to analyze'],
    weaknesses: ['Unable to analyze'],
    suggestions: ['Try again with more specific content'],
    timing: {
      bestDay: 'Tuesday',
      bestTime: '10:00 AM',
      urgency: 'schedule',
    },
    audienceMatch: 50,
    trendAlignment: 50,
  };
}
