/**
 * SPECIALIZED AGENT IMPLEMENTATIONS
 * 
 * Each agent extends BaseAgent with specific:
 * - Prompt templates
 * - Processing logic
 * - Optimization rules
 */

import { BaseAgent, type AgentExecutionContext, type AgentConfig } from './BaseAgent';

// ==================== STRATEGIST AGENT ====================

/**
 * StrategistAgent - Plans content strategy
 */
export class StrategistAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Strategist',
      role: 'strategist',
      capabilities: ['strategy_planning', 'engagement_analysis', 'brand_alignment'],
      promptTemplate: STRATEGIST_PROMPT,
      scoringWeights: {
        creativity: 0.2,
        relevance: 0.35,
        engagement: 0.25,
        brandAlignment: 0.2,
      },
      optimizationRules: [
        { condition: 'low_score', action: 'increase_relevance', threshold: 60 },
        { condition: 'declining_trend', action: 'enhance_prompt', threshold: 0 },
      ],
    });
  }

  protected buildPrompt(context: AgentExecutionContext): string {
    let prompt = this.config.promptTemplate;
    
    // Inject context
    prompt = prompt.replace('{{input}}', context.userInput);
    prompt = prompt.replace('{{platform}}', context.platform);
    
    // Add brand context if available
    if (context.memoryContext.brandMemory?.brandKit) {
      const brand = context.memoryContext.brandMemory.brandKit;
      prompt = prompt.replace('{{brandContext}}', 
        `Brand: ${brand.brandName}\nTone: ${brand.tone}\nAudience: ${brand.targetAudience}\nNiche: ${brand.niche}`
      );
    } else {
      prompt = prompt.replace('{{brandContext}}', 'No brand context available');
    }

    // Add custom instructions
    if (context.customInstructions) {
      prompt += `\n\nAdditional Instructions: ${context.customInstructions}`;
    }

    // Add governor feedback if this is a regeneration
    if (context.governorFeedback) {
      prompt += `\n\nPrevious feedback to address: ${context.governorFeedback}`;
    }

    return prompt;
  }

  protected processOutput(rawOutput: string, context: AgentExecutionContext): string {
    // Extract the strategy section
    const lines = rawOutput.split('\n').filter(l => l.trim());
    
    // If output has clear sections, extract the main strategy
    if (lines.length > 3) {
      return lines.join('\n');
    }
    
    return rawOutput.trim();
  }
}

// ==================== WRITER AGENT ====================

/**
 * WriterAgent - Creates main content body
 */
export class WriterAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Writer',
      role: 'writer',
      capabilities: ['content_generation', 'brand_alignment'],
      promptTemplate: WRITER_PROMPT,
      scoringWeights: {
        creativity: 0.3,
        relevance: 0.25,
        engagement: 0.25,
        brandAlignment: 0.2,
      },
      optimizationRules: [
        { condition: 'low_score', action: 'increase_creativity', threshold: 60 },
        { condition: 'high_variance', action: 'simplify_prompt', threshold: 0 },
        { condition: 'declining_trend', action: 'enhance_prompt', threshold: 0 },
      ],
    });
  }

  protected buildPrompt(context: AgentExecutionContext): string {
    let prompt = this.config.promptTemplate;
    
    // Inject context
    prompt = prompt.replace('{{input}}', context.userInput);
    prompt = prompt.replace('{{platform}}', context.platform);
    
    // Get platform character limit
    const platformLimits: Record<string, number> = {
      twitter: 280,
      threads: 500,
      instagram: 2200,
      linkedin: 3000,
      tiktok: 2200,
    };
    const charLimit = platformLimits[context.platform.toLowerCase()] || 2200;
    prompt = prompt.replace('{{charLimit}}', String(charLimit));

    // Add brand context
    if (context.memoryContext.brandMemory?.brandKit) {
      const brand = context.memoryContext.brandMemory.brandKit;
      prompt = prompt.replace('{{brandContext}}', 
        `Brand: ${brand.brandName}\nTone: ${brand.tone}\nVoice: Be ${brand.tone}, authentic, and engaging`
      );
    } else {
      prompt = prompt.replace('{{brandContext}}', 'Be conversational and engaging');
    }

    // Add successful hooks for inspiration
    if (context.memoryContext.brandMemory?.successfulHooks?.length) {
      const hooks = context.memoryContext.brandMemory.successfulHooks.slice(-3);
      prompt += `\n\nSuccessful hook patterns to consider:\n- ${hooks.join('\n- ')}`;
    }

    // Add previous content to avoid if regenerating
    if (context.previousContent) {
      prompt += `\n\nAvoid similarity to this previous version:\n"${context.previousContent.substring(0, 200)}..."`;
    }

    // COLLABORATION: Integrate findings from other agents
    prompt += this.getBlackboardContext(context);

    if (context.governorFeedback) {
      prompt += `\n\nCRITICAL: Address this feedback: ${context.governorFeedback}`;
    }

    return prompt;
  }
}

// ==================== HOOK AGENT ====================

/**
 * HookAgent - Creates attention-grabbing opening lines
 */
export class HookAgent extends BaseAgent {
  constructor() {
    super({
      name: 'HookMaster',
      role: 'hook',
      capabilities: ['hook_creation', 'engagement_analysis'],
      promptTemplate: HOOK_PROMPT,
      scoringWeights: {
        creativity: 0.35,
        relevance: 0.2,
        engagement: 0.35,
        brandAlignment: 0.1,
      },
      optimizationRules: [
        { condition: 'low_score', action: 'increase_creativity', threshold: 65 },
        { condition: 'declining_trend', action: 'enhance_prompt', threshold: 0 },
      ],
    });
  }

  protected buildPrompt(context: AgentExecutionContext): string {
    let prompt = this.config.promptTemplate;
    
    prompt = prompt.replace('{{input}}', context.userInput);
    prompt = prompt.replace('{{platform}}', context.platform);

    // Add brand tone
    if (context.memoryContext.brandMemory?.brandKit) {
      prompt = prompt.replace('{{tone}}', context.memoryContext.brandMemory.brandKit.tone);
    } else {
      prompt = prompt.replace('{{tone}}', 'engaging and authentic');
    }

    // Add patterns to avoid
    if (context.memoryContext.brandMemory?.avoidPatterns?.length) {
      const avoid = context.memoryContext.brandMemory.avoidPatterns.slice(-5);
      prompt += `\n\nAVOID these overused patterns:\n- ${avoid.join('\n- ')}`;
    }

    // Add recent hooks to avoid repetition
    const recentContent = context.memoryContext.contentHistory.slice(-5);
    if (recentContent.length > 0) {
      const recentHooks = recentContent.map(c => c.content.split('\n')[0]).filter(Boolean);
      if (recentHooks.length > 0) {
        prompt += `\n\nDo NOT repeat these recent hooks:\n- ${recentHooks.join('\n- ')}`;
      }
    }

    if (context.governorFeedback) {
      prompt += `\n\nFeedback to address: ${context.governorFeedback}`;
    }

    return prompt;
  }

  protected processOutput(rawOutput: string, context: AgentExecutionContext): string {
    // Extract just the hooks (numbered list)
    const lines = rawOutput.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    // Look for the best hook
    const hooks: string[] = [];
    for (const line of lines) {
      // Match numbered hooks
      const match = line.match(/^\d+[\.\)]\s*(.+)/);
      if (match) {
        hooks.push(match[1].trim());
      } else if (hooks.length === 0 && line.length > 10 && line.length < 150) {
        // First non-numbered line that looks like a hook
        hooks.push(line);
      }
    }

    // Return the first hook, or if we have the full content, build it
    if (hooks.length > 0) {
      // Return all hooks for scoring, but primary is first
      return hooks[0];
    }

    return rawOutput.trim();
  }
}

// ==================== CRITIC AGENT ====================

/**
 * CriticAgent - Evaluates and improves content
 */
export class CriticAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Critic',
      role: 'critic',
      capabilities: ['content_critique', 'optimization', 'engagement_analysis'],
      promptTemplate: CRITIC_PROMPT,
      scoringWeights: {
        creativity: 0.15,
        relevance: 0.3,
        engagement: 0.25,
        brandAlignment: 0.3,
      },
      optimizationRules: [
        { condition: 'low_score', action: 'increase_engagement', threshold: 60 },
        { condition: 'declining_trend', action: 'enhance_prompt', threshold: 0 },
      ],
    });
  }

  protected buildPrompt(context: AgentExecutionContext): string {
    let prompt = this.config.promptTemplate;
    
    prompt = prompt.replace('{{input}}', context.userInput);
    prompt = prompt.replace('{{platform}}', context.platform);

    // If we have previous content to critique and improve
    if (context.previousContent) {
      prompt = prompt.replace('{{content}}', context.previousContent);
    } else {
      prompt = prompt.replace('{{content}}', context.userInput);
    }

    // Add brand context for alignment check
    if (context.memoryContext.brandMemory?.brandKit) {
      const brand = context.memoryContext.brandMemory.brandKit;
      prompt = prompt.replace('{{brandContext}}',
        `Brand: ${brand.brandName}\nTone: ${brand.tone}\nAudience: ${brand.targetAudience}\nAvoid: ${brand.avoidTopics.join(', ')}`
      );
    } else {
      prompt = prompt.replace('{{brandContext}}', 'Focus on engagement and authenticity');
    }

    // COLLABORATION: Integrate findings from other agents
    prompt += this.getBlackboardContext(context);

    // Add governor feedback
    if (context.governorFeedback) {
      prompt += `\n\nPrevious validation issues to fix:\n${context.governorFeedback}`;
    }

    return prompt;
  }

  protected processOutput(rawOutput: string, context: AgentExecutionContext): string {
    // Look for "Improved version" or similar markers
    const improvedMatch = rawOutput.match(/(?:improved|revised|better|final)\s*(?:version|content)?:\s*(.+)/is);
    
    if (improvedMatch) {
      return improvedMatch[1].trim();
    }

    // If no clear marker, look for content after critique
    const sections = rawOutput.split(/(?:issues?|problems?|critique):\s*/i);
    if (sections.length > 1) {
      // Return the last section (improved content)
      return sections[sections.length - 1].trim();
    }

    return rawOutput.trim();
  }
}

// ==================== PROMPT TEMPLATES ====================

const STRATEGIST_PROMPT = `You are an elite social media strategist with deep expertise in viral content.

Your mission: Analyze the request and provide a strategic content plan.

Brand Context:
{{brandContext}}

User Request: {{input}}
Platform: {{platform}}

Provide:
1. Content angle/approach
2. Key message points
3. Emotional triggers to use
4. Recommended format (post, thread, carousel)
5. Best posting time suggestion
6. Expected engagement potential

Be specific and actionable. Think like a growth hacker.`;

const WRITER_PROMPT = `You are a master social media content writer. Your content goes viral because it's authentic, engaging, and impossible to scroll past.

Brand Context:
{{brandContext}}

User Request: {{input}}
Platform: {{platform}}
Character Limit: {{charLimit}}

RULES:
1. Start with a POWERFUL hook (first line must stop the scroll)
2. Write conversationally - like talking to a friend
3. Use short paragraphs and line breaks
4. Include emotional triggers naturally
5. End with a clear call-to-action
6. Stay within character limit
7. NO corporate jargon or robotic language
8. NO "in conclusion", "furthermore", "additionally"

Write the complete post. Make every word count.`;

const HOOK_PROMPT = `You are the world's best hook writer. Your opening lines make people STOP scrolling.

Topic: {{input}}
Platform: {{platform}}
Tone: {{tone}}

HOOK RULES:
1. Maximum 15 words per hook
2. Create curiosity gaps or bold claims
3. Use pattern interrupts
4. Never start with "I" or "Just wanted to"
5. No generic greetings (Hey everyone, Hi guys)
6. Trigger emotion immediately

Generate 5 different hooks, ranked by expected engagement:
1. [Best hook - highest engagement potential]
2. [Strong alternative]
3. [Curiosity-based hook]
4. [Bold/controversial hook]
5. [Question-based hook]

Number each hook clearly.`;

// ==================== OPTIMIZER AGENT ====================

/**
 * OptimizerAgent - Refines and optimizes content for maximum engagement
 */
export class OptimizerAgent extends BaseAgent {
  constructor() {
    super({
      name: 'Optimizer',
      role: 'optimizer',
      capabilities: ['optimization', 'engagement_analysis', 'brand_alignment'],
      promptTemplate: OPTIMIZER_PROMPT,
      scoringWeights: {
        creativity: 0.2,
        relevance: 0.25,
        engagement: 0.35,
        brandAlignment: 0.2,
      },
      optimizationRules: [
        { condition: 'low_score', action: 'increase_engagement', threshold: 60 },
        { condition: 'declining_trend', action: 'enhance_prompt', threshold: 0 },
      ],
    });
  }

  protected buildPrompt(context: AgentExecutionContext): string {
    let prompt = this.config.promptTemplate;
    
    prompt = prompt.replace('{{input}}', context.userInput);
    prompt = prompt.replace('{{platform}}', context.platform);
    
    // Add existing content if available
    if (context.previousContent) {
      prompt = prompt.replace('{{content}}', context.previousContent);
    } else {
      prompt = prompt.replace('{{content}}', context.userInput);
    }

    // Add brand context
    if (context.memoryContext.brandMemory?.brandKit) {
      const brand = context.memoryContext.brandMemory.brandKit;
      prompt = prompt.replace('{{brandContext}}',
        `Brand: ${brand.brandName}\nTone: ${brand.tone}\nAudience: ${brand.targetAudience}`
      );
    } else {
      prompt = prompt.replace('{{brandContext}}', 'Focus on maximum engagement');
    }

    // COLLABORATION: Integrate findings from other agents
    prompt += this.getBlackboardContext(context);

    if (context.governorFeedback) {
      prompt += `\n\nGovernor feedback to address:\n${context.governorFeedback}`;
    }

    return prompt;
  }

  protected processOutput(rawOutput: string, context: AgentExecutionContext): string {
    // Look for "Optimized version" or similar markers
    const optimizedMatch = rawOutput.match(/(?:optimized|improved|final|enhanced)\s*(?:version|content)?:\s*(.+)/is);
    
    if (optimizedMatch) {
      return optimizedMatch[1].trim();
    }

    // If no clear marker, return the full output
    return rawOutput.trim();
  }
}

// ==================== HYBRID AGENT ====================

/**
 * HybridAgent - Can perform multiple tasks based on context
 */
export class HybridAgent extends BaseAgent {
  constructor() {
    super({
      name: 'HybridMaster',
      role: 'hybrid',
      capabilities: ['content_generation', 'hook_creation', 'strategy_planning', 'optimization', 'multi_task'],
      promptTemplate: HYBRID_PROMPT,
      scoringWeights: {
        creativity: 0.25,
        relevance: 0.25,
        engagement: 0.25,
        brandAlignment: 0.25,
      },
      optimizationRules: [
        { condition: 'low_score', action: 'enhance_prompt', threshold: 60 },
        { condition: 'high_variance', action: 'simplify_prompt', threshold: 0 },
      ],
    });
  }

  protected buildPrompt(context: AgentExecutionContext): string {
    let prompt = this.config.promptTemplate;
    
    prompt = prompt.replace('{{input}}', context.userInput);
    prompt = prompt.replace('{{platform}}', context.platform);

    // Add brand context
    if (context.memoryContext.brandMemory?.brandKit) {
      const brand = context.memoryContext.brandMemory.brandKit;
      prompt = prompt.replace('{{brandContext}}',
        `Brand: ${brand.brandName}\nTone: ${brand.tone}\nNiche: ${brand.niche}\nAudience: ${brand.targetAudience}`
      );
    } else {
      prompt = prompt.replace('{{brandContext}}', 'Be engaging and authentic');
    }

    // Add memory context
    if (context.memoryContext.brandMemory?.successfulHooks?.length) {
      const hooks = context.memoryContext.brandMemory.successfulHooks.slice(-3);
      prompt += `\n\nProven hook patterns:\n- ${hooks.join('\n- ')}`;
    }

    if (context.governorFeedback) {
      prompt += `\n\nCRITICAL FEEDBACK:\n${context.governorFeedback}`;
    }

    return prompt;
  }
}

import { SynthesisAgent } from './SynthesisAgent';
import { VisualCriticAgent } from './VisualCriticAgent';
export { SynthesisAgent, VisualCriticAgent };

const CRITIC_PROMPT = `You are a ruthless but fair content critic. Your job is to make good content GREAT.

Content to analyze:
{{content}}

Platform: {{platform}}
Brand Context: {{brandContext}}

CRITIQUE CHECKLIST:
1. Hook strength (does it stop the scroll?)
2. Robotic/corporate language (reject any jargon)
3. Engagement potential (questions, relatability)
4. Structure (Hook → Value → CTA)
5. Brand alignment
6. Emotional impact
7. Call-to-action clarity

First, identify ALL issues.
Then, provide the IMPROVED VERSION that fixes every issue.

Format:
ISSUES:
- [issue 1]
- [issue 2]
...

IMPROVED VERSION:
[Your improved content here]`;

const OPTIMIZER_PROMPT = `You are a content optimization expert. Your job is to take existing content and make it PERFECT for maximum engagement.

Brand Context:
{{brandContext}}

Content to optimize:
{{content}}

Platform: {{platform}}

OPTIMIZATION CHECKLIST:
1. HOOK: Is the first line scroll-stopping? Enhance if needed.
2. READABILITY: Short sentences, clear structure, proper line breaks.
3. ENGAGEMENT: Add questions, calls-to-action, relatable elements.
4. EMOTION: Amplify emotional triggers without being manipulative.
5. CLARITY: Remove fluff, jargon, and corporate language.
6. PLATFORM FIT: Optimize length and format for {{platform}}.

Provide the OPTIMIZED VERSION only. No explanations.

OPTIMIZED VERSION:`;

const HYBRID_PROMPT = `You are an elite multi-talented content creator. You can strategize, write, create hooks, and optimize - all in one.

Brand Context:
{{brandContext}}

User Request: {{input}}
Platform: {{platform}}

Your task: Create the PERFECT piece of content that:
1. Opens with a powerful hook (first line stops the scroll)
2. Delivers genuine value in the body
3. Uses conversational, authentic language
4. Ends with a clear call-to-action
5. Fits the platform perfectly

Write naturally like a human creator, not an AI. Be bold. Be memorable. Be shareable.

CONTENT:`;
