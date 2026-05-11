/**
 * Enhanced Content Orchestrator
 * Replaces template-based content generation with real AI
 * - Uses actual AI providers for interpretation and creation
 * - Maintains context across generation steps
 * - Enriches content with brand voice and platform optimization
 * - Handles media generation integration
 */

import { universalChat, analyzeImage } from './aiService';
import type { BrandKit } from '@/lib/types';
import { buildMemoryContext, addContentIdea } from './agentMemoryService';

export interface ContentBrief {
  topic: string;
  platform: 'twitter' | 'instagram' | 'tiktok' | 'linkedin';
  goal: 'engagement' | 'awareness' | 'conversions' | 'education';
  tone?: string;
  format?: string;
}

export interface OrchestrationStep {
  step: 'brief' | 'plan' | 'script' | 'optimize' | 'media';
  status: 'pending' | 'in_progress' | 'complete' | 'error';
  output: string;
  alternatives?: string[];
  timestamp: number;
}

export interface OrchestrationSession {
  id: string;
  brief: ContentBrief;
  brandKit: BrandKit | null;
  steps: OrchestrationStep[];
  finalContent: string;
  mediaRequirements: { type: 'image' | 'video' | 'audio'; description: string }[];
  createdAt: number;
}

const orchestrationSessions = new Map<string, OrchestrationSession>();

/**
 * Start a new content orchestration session
 */
export function startOrchestration(
  brief: ContentBrief,
  brandKit: BrandKit | null
): OrchestrationSession {
  const id = `orch_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const session: OrchestrationSession = {
    id,
    brief,
    brandKit,
    steps: [],
    finalContent: '',
    mediaRequirements: [],
    createdAt: Date.now(),
  };
  orchestrationSessions.set(id, session);
  return session;
}

/**
 * STEP 1: Analyze brief and create content plan
 */
export async function orchestrateStep1_Plan(sessionId: string): Promise<string> {
  const session = orchestrationSessions.get(sessionId);
  if (!session) throw new Error('Orchestration session not found');

  const step: OrchestrationStep = {
    step: 'plan',
    status: 'in_progress',
    output: '',
    timestamp: Date.now(),
  };

  try {
    const prompt = `You are a content strategist. Create a detailed content plan based on this brief:

Topic: ${session.brief.topic}
Platform: ${session.brief.platform}
Goal: ${session.brief.goal}
${session.brandKit?.tone ? `Brand Tone: ${session.brandKit.tone}` : ''}
${session.brandKit?.audience ? `Target Audience: ${session.brandKit.audience}` : ''}

Create a structured plan that includes:
1. Hook strategy (first 3 seconds)
2. Main message (what to communicate)
3. Call-to-action (what should the audience do)
4. Emotional angle (what should they feel)
5. Platform-specific optimization

Format as JSON with these exact keys: {
  "hook_strategy": "...",
  "main_message": "...",
  "call_to_action": "...",
  "emotional_angle": "...",
  "platform_optimization": "..."
}`;

    const response = await universalChat(
      [{ role: 'user', content: prompt }],
      { model: 'gpt-4o', brandKit: session.brandKit }
    );

    step.output = response;
    step.status = 'complete';
    session.steps.push(step);

    return response;
  } catch (error) {
    step.status = 'error';
    step.output = String(error);
    session.steps.push(step);
    throw error;
  }
}

/**
 * STEP 2: Generate script based on plan
 */
export async function orchestrateStep2_Script(sessionId: string): Promise<string> {
  const session = orchestrationSessions.get(sessionId);
  if (!session) throw new Error('Orchestration session not found');

  const planStep = session.steps.find((s) => s.step === 'plan');
  if (!planStep) throw new Error('Must complete plan step first');

  const step: OrchestrationStep = {
    step: 'script',
    status: 'in_progress',
    output: '',
    timestamp: Date.now(),
  };

  try {
    const prompt = `You are a screenwriter creating content based on this plan:

${planStep.output}

Topic: ${session.brief.topic}
Platform: ${session.brief.platform}
${session.brandKit?.tone ? `Brand Tone: ${session.brandKit.tone}` : ''}

Write a production-ready script that:
- Starts with a strong hook (first line should stop scrollers)
- Flows naturally with rhythm and pacing
- Includes specific visual beats or actions
- Is platform-native (${session.brief.platform} style)
- Ends with a clear call-to-action
- Is between 60-120 words for scripts, adapt for ${session.brief.platform} platform conventions

Return ONLY the script text, no annotations.`;

    const response = await universalChat(
      [
        {
          role: 'user',
          content: prompt,
        },
      ],
      { model: 'gpt-4o', brandKit: session.brandKit }
    );

    step.output = response.trim();
    step.status = 'complete';
    session.steps.push(step);
    session.finalContent = step.output;

    return response;
  } catch (error) {
    step.status = 'error';
    step.output = String(error);
    session.steps.push(step);
    throw error;
  }
}

/**
 * STEP 3: Optimize for platform and brand
 */
export async function orchestrateStep3_Optimize(sessionId: string): Promise<string> {
  const session = orchestrationSessions.get(sessionId);
  if (!session) throw new Error('Orchestration session not found');

  if (!session.finalContent) throw new Error('Must complete script step first');

  const step: OrchestrationStep = {
    step: 'optimize',
    status: 'in_progress',
    output: '',
    alternatives: [],
    timestamp: Date.now(),
  };

  try {
    const prompt = `You are a social media optimization expert. Optimize this content for maximum impact:

Content: ${session.finalContent}
Platform: ${session.brief.platform}
${(session.brandKit as any)?.emotionalTriggers?.length ? `Emotional triggers: ${(session.brandKit as any).emotionalTriggers.join(', ')}` : ''}

Provide BOTH:
1. Optimized version (better hooks, keywords, rhythm for ${session.brief.platform})
2. Two alternative versions with different angles

Format as JSON:
{
  "optimized": "main version...",
  "alternatives": ["version 2...", "version 3..."],
  "hashtags": ["tag1", "tag2"],
  "emoji_suggestions": ["emoji1", "emoji2"],
  "engagement_tips": "brief tips for max engagement"
}`;

    const response = await universalChat(
      [{ role: 'user', content: prompt }],
      { model: 'gpt-4o', brandKit: session.brandKit }
    );

    const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
    step.output = parsed.optimized || session.finalContent;
    step.alternatives = parsed.alternatives || [];
    step.status = 'complete';
    session.steps.push(step);
    session.finalContent = step.output;

    return step.output;
  } catch (error) {
    step.status = 'error';
    step.output = String(error);
    session.steps.push(step);
    throw error;
  }
}

/**
 * STEP 4: Identify media requirements
 */
export async function orchestrateStep4_MediaRequirements(
  sessionId: string
): Promise<{ type: 'image' | 'video' | 'audio'; description: string }[]> {
  const session = orchestrationSessions.get(sessionId);
  if (!session) throw new Error('Orchestration session not found');

  if (!session.finalContent) throw new Error('Must complete script step first');

  try {
    const prompt = `Analyze this content and identify what media assets it needs:

Content: ${session.finalContent}
Platform: ${session.brief.platform}

For each media requirement, provide:
- Type: image, video, or audio
- Description: detailed description for generation
- Priority: high, medium, low

Return as JSON array:
[
  { "type": "image|video|audio", "description": "...", "priority": "high|medium|low" }
]`;

    const response = await universalChat(
      [{ role: 'user', content: prompt }],
      { model: 'gpt-4o', brandKit: session.brandKit }
    );

    const parsed = JSON.parse(response.match(/\[[\s\S]*\]/)?.[0] || '[]');
    session.mediaRequirements = parsed.filter(
      (m: any) => m.type && m.description
    );

    return session.mediaRequirements;
  } catch (error) {
    console.error('[ContentOrchestrator] Failed to identify media requirements:', error);
    return [];
  }
}

/**
 * Full orchestration pipeline
 */
export async function runFullOrchestration(
  brief: ContentBrief,
  brandKit: BrandKit | null
): Promise<{
  sessionId: string;
  content: string;
  plan: string;
  mediaRequirements: { type: string; description: string }[];
}> {
  const session = startOrchestration(brief, brandKit);

  try {
    // Step 1: Plan
    await orchestrateStep1_Plan(session.id);

    // Step 2: Script
    await orchestrateStep2_Script(session.id);

    // Step 3: Optimize
    await orchestrateStep3_Optimize(session.id);

    // Step 4: Media requirements
    await orchestrateStep4_MediaRequirements(session.id);

    const planStep = session.steps.find((s) => s.step === 'plan');

    return {
      sessionId: session.id,
      content: session.finalContent,
      plan: planStep?.output || '',
      mediaRequirements: session.mediaRequirements,
    };
  } catch (error) {
    console.error('[ContentOrchestrator] Full orchestration failed:', error);
    throw error;
  }
}

/**
 * Get orchestration session
 */
export function getOrchestrationSession(id: string): OrchestrationSession | null {
  return orchestrationSessions.get(id) || null;
}

/**
 * Save orchestrated content as idea
 */
export async function saveOrchestrationAsIdea(
  sessionId: string,
  platform: 'twitter' | 'instagram' | 'tiktok' | 'linkedin'
): Promise<void> {
  const session = orchestrationSessions.get(sessionId);
  if (!session) throw new Error('Session not found');

  await addContentIdea(session.finalContent, 'orchestrated', platform);

  // Clean up after 2 hours
  setTimeout(() => {
    orchestrationSessions.delete(sessionId);
  }, 2 * 60 * 60 * 1000);
}
