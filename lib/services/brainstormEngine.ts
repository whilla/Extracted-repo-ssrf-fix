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

  const systemPrompt = `You are a creative content strategist helping generate scroll-stopping, viral content ideas.
${session.brandKit ? `Niche: ${session.brandKit.niche}
Tone: ${session.brandKit.tone}
Target audience: ${session.brandKit.audience || 'general'}` : ''}

Generate ${count} unique content ideas that are:
- Emotionally resonant
- Platform-native (can adapt to Twitter/TikTok/Instagram/LinkedIn)
- Trend-aligned
- Actionable

For EACH idea, provide:
1. Core idea (1-2 sentences)
2. Confidence level (0-1 scale)
3. Three different angles to approach it

Format as JSON array with objects: { "idea": "...", "confidence": 0.8, "angles": ["angle1", "angle2", "angle3"] }`;

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

  const systemPrompt = `You are helping refine a content idea with iterative suggestions.
${session.brandKit ? `Niche: ${session.brandKit.niche}\nTone: ${session.brandKit.tone}` : ''}

Respond with BOTH:
1. A thoughtful refinement of the idea based on the question
2. Three alternative angles that could work

Format as JSON:
{
  "refinement": "improved version of the idea...",
  "alternatives": ["alt1", "alt2", "alt3"]
}`;

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

  const systemPrompt = `You are a creative strategist exploring multiple content angles.
  ${session.brandKit ? `Niche: ${session.brandKit.niche}` : ''}

For the given idea, provide ${angleCount} distinct angles that could be taken. Each angle should:
- Be platform-specific or adaptable
- Have different hooks/approaches
- Appeal to different segments of the audience

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

  const systemPrompt = `You are a creative brainstorming partner helping develop content ideas for:
Topic: "${session.topic}"
${session.brandKit ? `Brand: ${session.brandKit.niche}` : ''}

Current ideas: ${session.ideas.map((i) => i.text).join(', ')}

Continue the brainstorm conversation naturally. Suggest refinements, alternatives, or new directions based on the user's input.`;

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
