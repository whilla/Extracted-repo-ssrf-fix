/**
 * Enhanced Brainstorming Engine
 * Real AI-powered ideation with:
 * - Iterative refinement (follow-up questions, exploration)
 * - Conversation history tracking
 * - Multi-angle exploration
 * - Memory integration
 * - Provider-agnostic calls
 */

import { universalChat } from './aiService';
import type { BrandKit } from '@/lib/types';
import { addContentIdea, buildMemoryContext } from './agentMemoryService';
import type { ChatMessage } from '@/lib/types';

export interface BrainstormSession {
  id: string;
  topic: string;
  brandKit: BrandKit | null;
  messages: ChatMessage[];
  ideas: { text: string; confidence: number; angles: string[] }[];
  createdAt: number;
  updatedAt: number;
}

const brainstormSessions = new Map<string, BrainstormSession>();

/**
 * Start a new brainstorming session
 */
export function initBrainstormSession(
  topic: string,
  brandKit: BrandKit | null
): BrainstormSession {
  const id = `brainstorm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const session: BrainstormSession = {
    id,
    topic,
    brandKit,
    messages: [],
    ideas: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  brainstormSessions.set(id, session);
  return session;
}

/**
 * Get brainstorm session
 */
export function getBrainstormSession(id: string): BrainstormSession | null {
  return brainstormSessions.get(id) || null;
}

/**
 * Generate initial ideas with multi-angle exploration
 */
export async function generateInitialIdeas(
  sessionId: string,
  count = 5
): Promise<{ text: string; confidence: number; angles: string[] }[]> {
  const session = getBrainstormSession(sessionId);
  if (!session) throw new Error('Brainstorm session not found');

  const systemPrompt = `You are a senior creative content strategist. Generate scroll-stopping, platform-native content ideas that a real audience would engage with.
${session.brandKit ? `Brand: ${session.brandKit.niche} | Tone: ${session.brandKit.tone} | Audience: ${session.brandKit.audience || 'general'}` : ''}

Rules:
- No generic ideas. Every idea must have a specific hook mechanism (curiosity, tension, contrast, or transformation).
- Ideas must be executable — not vague concepts.
- Avoid repeating ideas from the session history.
- Favor advertiser-safe, platform-compliant concepts.

For each idea provide:
1. Core idea (1-2 sentences with a clear hook)
2. Confidence (0-1 scale based on viral potential)
3. Three distinct angles to approach it

Return JSON array: [{ "idea": "...", "confidence": 0.8, "angles": ["angle1", "angle2", "angle3"] }]`;

  const userMessage = `Topic: "${session.topic}"
  ${session.brandKit?.contentPillars?.length ? `Content pillars: ${session.brandKit.contentPillars.join(', ')}` : ''}

Generate creative content ideas now.`;

  try {
    const response = await universalChat(
      [{ role: 'user', content: userMessage }],
      { model: 'gpt-4o', brandKit: session.brandKit, avoidPuter: false }
    );

    // Parse JSON response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      idea: string;
      confidence: number;
      angles: string[];
    }>;

    const ideas = parsed
      .slice(0, count)
      .map((item) => ({
        text: item.idea,
        confidence: Math.min(1, Math.max(0, item.confidence || 0.7)),
        angles: item.angles || [],
      }));

    // Store in session
    session.ideas = ideas;
    session.messages.push({
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
      
    });
    session.updatedAt = Date.now();

    return ideas;
  } catch (error) {
    console.error('[BrainstormEngine] Failed to generate initial ideas:', error);
    throw error;
  }
}

/**
 * Refine an idea iteratively - ask follow-up questions and get alternatives
 */
export async function refineIdea(
  sessionId: string,
  ideaText: string,
  refinementQuestion: string
): Promise<{ refinement: string; alternatives: string[] }> {
  const session = getBrainstormSession(sessionId);
  if (!session) throw new Error('Brainstorm session not found');

  // Add user message to history
  session.messages.push({
    id: `msg_${Date.now()}`,
    role: 'user',
    content: `Let's refine this idea: "${ideaText}"\n\nQuestion: ${refinementQuestion}`,
    timestamp: new Date().toISOString(),
    
  });

  const systemPrompt = `You are a senior content strategist refining ideas iteratively.
${session.brandKit ? `Brand: ${session.brandKit.niche} | Tone: ${session.brandKit.tone}` : ''}

Rules:
- Strengthen the hook. If the original idea is weak, say why and fix it.
- Provide three alternative angles that are distinctly different from each other.
- No generic suggestions. Each alternative must have a specific mechanism (curiosity gap, contrarian take, emotional spike, or pattern interrupt).

Return JSON: { "refinement": "improved version...", "alternatives": ["alt1", "alt2", "alt3"] }`;

  try {
    const response = await universalChat(
      session.messages.map((m) => ({ role: m.role, content: m.content })),
      { model: 'gpt-4o', brandKit: session.brandKit, avoidPuter: false }
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]) as {
      refinement: string;
      alternatives: string[];
    };

    // Add assistant response to history
    session.messages.push({
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
      
    });
    session.updatedAt = Date.now();

    return {
      refinement: parsed.refinement,
      alternatives: parsed.alternatives || [],
    };
  } catch (error) {
    console.error('[BrainstormEngine] Failed to refine idea:', error);
    throw error;
  }
}

/**
 * Explore multiple angles for an idea
 */
export async function exploreAngles(
  sessionId: string,
  ideaText: string,
  angleCount = 3
): Promise<string[]> {
  const session = getBrainstormSession(sessionId);
  if (!session) throw new Error('Brainstorm session not found');

  // Add user message
  session.messages.push({
    id: `msg_${Date.now()}`,
    role: 'user' as const,
    content: `Explore ${angleCount} different angles to approach this idea: "${ideaText}"`,
    timestamp: new Date().toISOString(),
  });

  const systemPrompt = `You are a creative strategist exploring distinct content angles.
${session.brandKit ? `Brand: ${session.brandKit.niche}` : ''}

For the given idea, provide ${angleCount} angles that are genuinely different from each other. Each must have:
- A unique hook mechanism (curiosity, tension, contrast, transformation, or revelation)
- A clear platform fit
- A specific audience segment it targets

Return ONLY a JSON array of strings: ["angle1", "angle2", "angle3"]`;

  try {
    const response = await universalChat(
      session.messages.map((m) => ({ role: m.role, content: m.content })),
      { model: 'gpt-4o', brandKit: session.brandKit, avoidPuter: false }
    );

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');

    const angles = JSON.parse(jsonMatch[0]) as string[];

    session.messages.push({
      id: `msg_${Date.now()}`,
      role: 'assistant' as const,
      content: response,
      timestamp: new Date().toISOString(),
    });
    session.updatedAt = Date.now();

    return angles.slice(0, angleCount);
  } catch (error) {
    console.error('[BrainstormEngine] Failed to explore angles:', error);
    throw error;
  }
}

/**
 * Get conversation history
 */
export function getBrainstormHistory(sessionId: string): ChatMessage[] {
  const session = getBrainstormSession(sessionId);
  return session?.messages || [];
}

/**
 * Continue brainstorm with a new message
 */
export async function continueBrainstorm(
  sessionId: string,
  message: string
): Promise<string> {
  const session = getBrainstormSession(sessionId);
  if (!session) throw new Error('Brainstorm session not found');

  // Add user message
  session.messages.push({
    id: `msg_${Date.now()}`,
    role: 'user' as const,
    content: message,
    timestamp: new Date().toISOString(),
  });

  const systemPrompt = `You are a senior creative strategist in an active brainstorm session.
Topic: "${session.topic}"
${session.brandKit ? `Brand: ${session.brandKit.niche} | Tone: ${session.brandKit.tone}` : ''}
Current ideas: ${session.ideas.map((i) => i.text).join(' | ')}

Continue the conversation naturally. Build on what exists — do not repeat ideas. Suggest refinements, new directions, or challenge weak ideas directly. Be specific, not vague.`;

  try {
    const response = await universalChat(
      session.messages.map((m) => ({ role: m.role, content: m.content })),
      { model: 'gpt-4o', brandKit: session.brandKit, avoidPuter: false }
    );

    session.messages.push({
      id: `msg_${Date.now()}`,
      role: 'assistant' as const,
      content: response,
      timestamp: new Date().toISOString(),
    });
    session.updatedAt = Date.now();

    return response;
  } catch (error) {
    console.error('[BrainstormEngine] Failed to continue brainstorm:', error);
    throw error;
  }
}

/**
 * Finalize brainstorm session and save ideas to memory
 */
export async function finalizeBrainstormSession(
  sessionId: string,
  selectedIdeas: string[],
  primaryPlatform: 'twitter' | 'instagram' | 'tiktok' | 'linkedin' = 'twitter'
): Promise<void> {
  const session = getBrainstormSession(sessionId);
  if (!session) throw new Error('Brainstorm session not found');

  // Save each selected idea to memory
  for (const ideaText of selectedIdeas) {
    try {
      await addContentIdea(ideaText, 'brainstormed', primaryPlatform);
    } catch (error) {
      console.error(`[BrainstormEngine] Failed to save idea "${ideaText}":`, error);
    }
  }

  // Clean up session after 1 hour
  setTimeout(() => {
    brainstormSessions.delete(sessionId);
  }, 60 * 60 * 1000);
}

/**
 * Quick ideate - fast generation without conversation history (for quick workflows)
 */
export async function quickBrainstorm(
  topic: string,
  brandKit: BrandKit | null,
  count = 5
): Promise<string[]> {
  const prompt = `Generate ${count} unique, creative content ideas for this topic.
Topic: "${topic}"
${brandKit ? `Brand: ${brandKit.niche}, Tone: ${brandKit.tone}` : ''}

Each idea should be:
- Scroll-stopping
- Shareable
- Aligned with current trends
- Specific and actionable

Return ONLY a numbered list of ideas. No explanations.`;

  try {
    const response = await universalChat(
      [{ role: 'user', content: prompt }],
      { model: 'gpt-4o', brandKit, avoidPuter: true }
    );

    const ideas: string[] = [];
    const lines = response.split('\n');
    for (const line of lines) {
      const match = line.match(/^\d+[\.\)]\s*(.+)/);
      if (match) {
        ideas.push(match[1].trim());
      }
    }

    return ideas.slice(0, count);
  } catch (error) {
    console.warn('[BrainstormEngine] Quick ideate failed:', error);
    // Fallback: structured prompts
    return Array.from({ length: count }, (_, i) => `Content idea ${i + 1}: Create a post about "${topic}" that solves a specific problem for your audience`);
  }
}
