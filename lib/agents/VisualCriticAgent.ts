/**
 * VISUAL CRITIC AGENT
 * A multi-modal agent that validates generated assets against the original creative brief.
 * 
 * Responsibilities:
 * - Analyze generated images/videos via Vision LLM.
 * - Compare visual output against the text-based visual brief.
 * - Identify misalignments in style, composition, or subject.
 * - Trigger regeneration if the visual asset is "off-brand" or incorrect.
 */

import { BaseAgent, type AgentExecutionContext, type AgentConfig } from './BaseAgent';

const VISUAL_CRITIC_CONFIG: AgentConfig = {
  name: 'Visual Critic',
  role: 'critic',
  capabilities: ['critical_validation', 'visual_description'],
  promptTemplate: `You are the Visual Quality Gate. Your job is to ensure that the generated asset matches the production brief.

BRIEF:
{{brief}}

ASSET ANALYSIS:
{{assetAnalysis}}

Your goal:
1. Check if the subject is correct.
2. Verify that the style/mood matches the brief.
3. Identify any "AI hallucinations" or visual glitches.
4. Ensure brand-specific visual locks are maintained.

Verdict:
- PASS: If the asset is production-ready.
- FAIL: If it needs regeneration.

Include specific reasons for FAIL.`,
  scoringWeights: {
    creativity: 0.1,
    relevance: 0.4,
    engagement: 0.2,
    brandAlignment: 0.3,
  },
  optimizationRules: [],
};

export class VisualCriticAgent extends BaseAgent {
  constructor() {
    super(VISUAL_CRITIC_CONFIG);
  }

  protected buildPrompt(context: AgentExecutionContext): string {
    let prompt = this.config.promptTemplate;
    
    // The brief is usually in the blackboard or the userInput
    const brief = context.blackboard?.getByType('observation')
      .find(obs => obs.agentRole === 'visual')?.content || context.userInput || '';
      
    const assetAnalysis = context.customInstructions || 'Analyze the attached image/video.';

    prompt = prompt.replaceAll('{{brief}}', brief);
    prompt = prompt.replaceAll('{{assetAnalysis}}', assetAnalysis);

    return prompt;
  }
}
