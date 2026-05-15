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
    const prompt = `You are a senior content strategist. Create a detailed content plan from this brief:

Topic: ${session.brief.topic}
Platform: ${session.brief.platform}
Goal: ${session.brief.goal}
${session.brandKit?.tone ? `Brand Tone: ${session.brandKit.tone}` : ''}
${session.brandKit?.audience ? `Target Audience: ${session.brandKit.audience}` : ''}

Return JSON with these exact keys:
{
  "hook_strategy": "specific hook mechanism — not generic advice",
  "main_message": "the single core idea to communicate",
  "call_to_action": "specific action the audience should take",
  "emotional_angle": "what the audience should feel and why",
  "platform_optimization": "how to adapt for ${session.brief.platform} specifically"
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
    const prompt = `You are a senior scriptwriter. Write a production-ready script from this plan:

${planStep.output}

Topic: ${session.brief.topic}
Platform: ${session.brief.platform}
${session.brandKit?.tone ? `Brand Tone: ${session.brandKit.tone}` : ''}

Rules:
- First line must stop scrollers (curiosity, tension, or contrast).
- Natural rhythm — vary sentence length. Use fragments for impact.
- Include specific visual beats or actions.
- Platform-native style for ${session.brief.platform}.
- Clear CTA at the end.
- 60-120 words. Adapt to ${session.brief.platform} conventions.

Return ONLY the script text. No annotations, no explanations.`;

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
    const prompt = `You are a senior social media optimizer. Improve this content for maximum impact:

Content: ${session.finalContent}
Platform: ${session.brief.platform}
${(session.brandKit as any)?.emotionalTriggers?.length ? `Emotional triggers: ${(session.brandKit as any).emotionalTriggers.join(', ')}` : ''}

Rules:
- Strengthen the hook if it is weak.
- Remove any AI-isms, clichés, or filler.
- Two alternative versions must use distinctly different angles (not just rewording).

Return JSON:
{
  "optimized": "main improved version",
  "alternatives": ["angle 2 with different hook mechanism", "angle 3 with different emotional trigger"],
  "hashtags": ["relevant", "specific"],
  "emoji_suggestions": ["only if they add value"],
  "engagement_tips": "one specific tip for ${session.brief.platform}"
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
