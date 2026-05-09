/**
 * SYNTHESIS AGENT
 * A specialized agent capable of performing "Genetic Evolution" on content.
 * 
 * Responsibilities:
 * - Analyze multiple high-scoring candidates
 * - Extract the "winning" components from each (e.g., Hook from Agent A, Body from Agent B)
 * - Synthesize these components into a single "Master Output"
 * - Ensure cohesive flow and brand alignment throughout the synthesized result
 */

import { BaseAgent, type AgentExecutionContext, type AgentOutput, type AgentConfig } from './BaseAgent';
import { AgentBlackboard } from '../core/AgentBlackboard';

const SYNTHESIS_CONFIG: AgentConfig = {
  name: 'Synthesis Architect',
  role: 'optimizer', // Uses optimizer role for existing pipeline compatibility
  capabilities: ['optimization', 'multi_task', 'brand_alignment'],
  promptTemplate: `You are the Synthesis Architect. Your goal is to perform genetic evolution on candidate content.
  
  INPUTS:
  1. Multiple high-scoring candidate versions.
  2. Agent observations from the Blackboard.
  3. The overarching brand guidelines.

  PROCESS:
  - Identify the most magnetic hook among candidates.
  - Extract the most persuasive arguments or storytelling beats.
  - Use the most effective CTA.
  - Seamlessly merge these into a single, high-impact deliverable.
  - Refine for flow, rhythm, and emotional resonance.

  OUTPUT:
  Return ONLY the final synthesized content.`,
  scoringWeights: {
    creativity: 0.2,
    relevance: 0.3,
    engagement: 0.3,
    brandAlignment: 0.2,
  },
  optimizationRules: [],
};

export class SynthesisAgent extends BaseAgent {
  constructor() {
    super(SYNTHESIS_CONFIG);
  }

  protected async buildPrompt(context: AgentExecutionContext): Promise<string> {
    const { blackboard, userInput, memoryContext } = context;
    
    // Get all observations from the blackboard
    const observations = blackboard?.getSummary() || 'No observations available.';
    
    // Collect the "best" components from previous la-la results
    const bestContent = memoryContext.contentHistory
      .slice(-5)
      .map(c => c.content)
      .join('\\n---\\n');

    return `
      TASK: Synthesize the ultimate version of the following request: "${userInput}"
      
      CURRENT BLACKBOARD OBSERVATIONS:
      ${observations}
      
      TOP PERFORMING HISTORICAL EXAMPLES:
      ${bestContent}
      
      INSTRUCTIONS:
      Perform "Genetic Evolution". Extract the winning DNA (best parts) from these examples and the latest observations to create a version that outperforms all previous iterations.
      
      Ensure it aligns with the brand: ${memoryContext.brandMemory?.brandKit?.brandName || 'the specified brand'}.
    `;
  }

  protected processOutput(rawOutput: string, context: AgentExecutionContext): string {
    return super.processOutput(rawOutput, context);
  }
}
