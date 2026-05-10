'use client';

import { aiService } from './aiService';
import { kvGet } from './puterService';

export interface GenerationGoal {
  topic: string;
  audience: string;
  goal: 'educate' | 'sell' | 'inspire' | 'entertain';
  brandVoice?: string;
  constraints?: string[];
}

export interface CognitiveDraft {
  deconstruction: {
    coreTruth: string;
    psychologicalTriggers: string[];
    unexpectedAngle: string;
  };
  draft: string;
  critique: string;
  finalVersion: string;
}

/**
 * DynamicGenerationService implements a "Cognitive Chain" to ensure
 * content is truly generative and not template-based.
 */
export const dynamicGenerationService = {
  /**
   * Generates high-impact text using a Deconstruct -> Draft -> Critique -> Refine loop.
   */
  async generate(goal: GenerationGoal): Promise<CognitiveDraft> {
    const brandKit = await kvGet('brand_kit');
    const brandContext = brandKit ? JSON.stringify(brandKit) : 'Standard professional voice';

    // PHASE 1: DECONSTRUCTION
    // We force the AI to think about the psychology and the "angle" before writing.
    const deconstructPrompt = `
      You are a Cognitive Strategist. Your goal is to deconstruct the following request to avoid generic "template" writing.
      
      Topic: ${goal.topic}
      Audience: ${goal.audience}
      Goal: ${goal.goal}
      Brand Context: ${brandContext}
      
      Instead of writing the post, provide:
      1. The Core Truth: The single most important, non-obvious insight about this topic.
      2. Psychological Triggers: Which triggers (e.g., Curiosity, Contrarianism, Empathy) should be used?
      3. The Unexpected Angle: A way to approach this that 99% of other creators would miss.
      
      Return JSON: { "coreTruth": string, "psychologicalTriggers": string[], "unexpectedAngle": string }
    `;

    const deconstructRes = await aiService.chat(deconstructPrompt);
    const deconstruction = JSON.parse(deconstructRes.replace(/```json|```/g, '').trim());

    // PHASE 2: DRAFTING (Constraints-based)
    const draftingPrompt = `
      You are a World-Class Copywriter who HATES templates and marketing clichés.
      
      STRATEGIC FOUNDATION:
      - Core Truth: ${deconstruction.coreTruth}
      - Triggers: ${deconstruction.psychologicalTriggers.join(', ')}
      - Angle: ${deconstruction.unexpectedAngle}
      
      WRITING CONSTRAINTS:
      1. NO marketing clichés (e.g., "Unlock your potential", "Game-changer", "Revolutionize").
      2. NO generic openings (e.g., "In today's fast-paced world...").
      3. Use "Vivid Specifics": Replace vague adjectives with concrete examples.
      4. Use "Human-First" cadence: Vary sentence length. Use fragments for impact.
      
      Target Audience: ${goal.audience}
      Goal: ${goal.goal}
      
      Write the content now. Focus on the "Unexpected Angle".
    `;

    const draft = await aiService.chat(draftingPrompt);

    // PHASE 3: CRITIQUE
    const critiquePrompt = `
      You are a Ruthless Editor. Review the following draft for "Template Smell."
      
      Draft: "${draft}"
      
      Identify:
      1. Any phrases that sound like a generic AI template.
      2. Areas where the writing is too vague.
      3. Places where a specific example would be better than a general statement.
      
      Be brutal. Provide a list of specific improvements.
    `;

    const critique = await aiService.chat(critiquePrompt);

    // PHASE 4: FINAL REFINEMENT
    const refinePrompt = `
      You are a Master Editor. Refine the original draft based on the Ruthless Editor's critique.
      
      Original Draft: "${draft}"
      Critique: "${critique}"
      
      The final version must be indistinguishable from a high-level human expert. It must be visceral, specific, and devoid of all AI-isms.
    `;

    const finalVersion = await aiService.chat(refinePrompt);

    return {
      deconstruction,
      draft,
      critique,
      finalVersion,
    };
  }
};
