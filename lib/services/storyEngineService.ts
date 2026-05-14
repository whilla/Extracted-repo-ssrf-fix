

import { universalChat } from './aiService';
import type { BrandProfile } from './nicheAnalyzerService';

export interface StoryEngineResult {
  hook: string;
  script: string;
  episodicArc: string[];
}

export async function buildStoryContent(
  request: string,
  profile: BrandProfile
): Promise<StoryEngineResult> {
  const prompt = `You are the Story Engine inside a universal AI content pipeline.
Create a production-ready script, not a brainstorming outline.

Request: ${request}
Niche: ${profile.niche}
Tone: ${profile.tone}
Goal: ${profile.goal}
Audience intent: ${profile.audienceIntent}
Audience: ${profile.audience}
Emotional triggers: ${profile.emotionalTriggers.join(', ')}
Style tags: ${profile.styleTags.join(', ')}

Rules:
- The first line must win the first 3 seconds with tension, curiosity, contrast, or emotional spike.
- Keep it concise, cinematic, and platform-native.
- Build a clear progression: hook -> build-up -> payoff -> unresolved loop.
- Favor visual beats and spoken rhythm over exposition.
- If the niche is narrative, preserve character continuity and escalate stakes.
- If the niche is educational or business, keep it specific, useful, and direct.

Return JSON:
{
  "hook": "string",
  "script": "string",
  "episodicArc": ["beat 1", "beat 2", "beat 3", "beat 4"]
}`;

  try {
    const response = await universalChat(prompt, { model: 'gpt-4o' });
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON');
    const parsed = JSON.parse(match[0]) as Partial<StoryEngineResult>;
    return {
      hook: parsed.hook?.trim() || 'Something shifts in the first second, and nothing feels safe after.',
      script: parsed.script?.trim() || request,
      episodicArc: parsed.episodicArc?.filter(Boolean).slice(0, 6) || ['hook', 'escalation', 'loop'],
    };
  } catch {
    return {
      hook: 'Something shifts in the first second, and nothing feels safe after.',
      script: request,
      episodicArc: ['hook', 'escalation', 'loop'],
    };
  }
}
