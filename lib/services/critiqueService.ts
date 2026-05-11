import { universalChat } from './aiService';
import { buildMemoryContext } from './agentMemoryService';
import { performanceService } from './performanceService';

export interface CritiqueResult {
  isApproved: boolean;
  score: number; // 0-100
  feedback: string;
  suggestedChanges: string[];
  critiqueCategory: 'hook' | 'tone' | 'alignment' | 'cta' | 'general';
}

export class critiqueService {
  /**
   * Reviews a piece of content against the agent's brand identity and performance history.
   */
  static async reviewContent(agentId: string, content: string, contentType: 'script' | 'caption') {
    const memoryContext = await buildMemoryContext(agentId);
    const activeInsights = await performanceService.getActiveInsights(agentId);
    
    const insightsContext = activeInsights.length > 0 
      ? `\n\nPROVEN PERFORMANCE DATA:\n${activeInsights.map(i => `- ${i.insight}`).join('\n')}`
      : '';

    const prompt = `You are the "Chief Content Critic" for a high-growth social media brand.
Your job is to be brutally honest and ensure that every piece of content is "Viral-Ready" before it is ever seen by a human.

=== BRAND CONTEXT ===
${memoryContext}
${insightsContext}

=== CONTENT TO REVIEW ===
Type: ${contentType}
Content:
"""
${content}
"""

=== CRITIQUE GUIDELINES ===
1. HOOK (Critical): Does the first 3 seconds grab attention? Is there a strong "curiosity gap"?
2. BRAND ALIGNMENT: Does it sound like the agent? Is it consistent with the niche?
3. VALUE: Does it provide actual value or just noise?
4. CTA: Is there a clear, natural call to action?
5. PERFORMANCE: Based on the proven insights, does this follow what has worked in the past?

=== OUTPUT FORMAT ===
Return a strict JSON object:
{
  "isApproved": boolean,
  "score": number,
  "feedback": "Concise summary of why it passed or failed",
  "suggestedChanges": ["Specific change 1", "Specific change 2"],
  "critiqueCategory": "hook" | "tone" | "alignment" | "cta" | "general"
}

Rule: Be strict. If it's generic or "AI-sounding", reject it.`;

    try {
      const response = await universalChat(prompt, { model: 'gpt-4o' });
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Invalid critique format');
      
      return JSON.parse(jsonMatch[0]) as CritiqueResult;
    } catch (error) {
      console.error('[critiqueService] Review error:', error);
      // Fail-safe: if the critic fails, we let the human decide
      return {
        isApproved: true, 
        score: 50,
        feedback: 'Critique system unavailable; routing to human approval.',
        suggestedChanges: [] as string[],
        critiqueCategory: 'general' as const
      };
    }
  }

  /**
   * Orchestrates the iterative loop between a Creator and a Critic.
   */
  static async refineContent(agentId: string, initialContent: string, contentType: 'script' | 'caption', maxIterations = 3) {
    let currentContent = initialContent;
    let iteration = 0;
    const history: { content: string; critique: CritiqueResult }[] = [];

    while (iteration < maxIterations) {
      const critique = await this.reviewContent(agentId, currentContent, contentType);
      
      if (critique.isApproved) {
        return { finalContent: currentContent, iterations: iteration + 1, finalCritique: critique };
      }

      history.push({ content: currentContent, critique });
      iteration++;

      // Ask the Creator to rewrite based on the critique
      const rewritePrompt = `Your previous draft was rejected by the Chief Content Critic.
      
      DRAFT:
      """${currentContent}"""
      
      CRITIQUE:
      "${critique.feedback}"
      
      REQUIRED CHANGES:
      ${critique.suggestedChanges.map(c => `- ${c}`).join('\n')}
      
      Please rewrite the ${contentType} to be more viral, punchy, and aligned with the brand. 
      Return ONLY the rewritten content.`;

      const { universalChat } = await import('./aiService');
      currentContent = await universalChat(rewritePrompt, { model: 'gpt-4o' });
    }

    return { 
      finalContent: currentContent, 
      iteration, 
      finalCritique: { 
        isApproved: false, 
        score: 0, 
        feedback: 'Max iterations reached without full approval. Human review required.', 
        suggestedChanges: [], 
critiqueCategory: 'general' as const
      } 
    };
  }
}
