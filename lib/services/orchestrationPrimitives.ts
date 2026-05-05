export type OrchestrationAgentRole =
  | 'planner'
  | 'identity'
  | 'rules'
  | 'structure'
  | 'generator'
  | 'distribution'
  | 'memory'
  | 'trend'
  | 'writer'
  | 'hook'
  | 'strategist'
  | 'optimizer'
  | 'critic'
  | 'visual'
  | 'hashtag'
  | 'engagement'
  | 'hybrid';

export interface OrchestrationAgentOutput {
  agentRole: OrchestrationAgentRole;
  content: string;
  score: number;
}

export interface CriticVerdict {
  verdict: 'approve' | 'reject' | 'unknown';
  score: number | null;
  critique: string;
  fixes: string[];
  targetAgent?: OrchestrationAgentRole;
  schemaValid: boolean;
}

export function parseCriticVerdict(content: string): CriticVerdict {
  const raw = (content || '').trim();
  if (!raw) {
    return {
      verdict: 'unknown',
      score: null,
      critique: '',
      fixes: [],
      schemaValid: false,
    };
  }

  const verdictMatch = raw.match(/(?:^|\n)\s*(?:verdict|final verdict)\s*:\s*(approve|reject)\b/i);
  const scoreMatch = raw.match(/(?:^|\n)\s*score\s*:\s*(\d{1,3})\b/i);
  const targetMatch = raw.match(/(?:^|\n)\s*target agent\s*:\s*([a-z_]+)\b/i);
  const critiqueMatch = raw.match(/(?:^|\n)\s*critique\s*:\s*([\s\S]*?)(?=\n\s*fixes\s*:|$)/i);
  const fixesMatch = raw.match(/(?:^|\n)\s*fixes\s*:\s*([\s\S]*)$/i);

  const verdict = (verdictMatch?.[1] || '').toLowerCase() as 'approve' | 'reject' | '';
  const score = scoreMatch ? Number.parseInt(scoreMatch[1], 10) : null;
  const targetAgent = (targetMatch?.[1] || '').toLowerCase() as OrchestrationAgentRole || undefined;
  const critique = (critiqueMatch?.[1] || '').trim();
  const fixesRaw = (fixesMatch?.[1] || '').trim();
  const fixes = fixesRaw
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean);

  const schemaValid = Boolean(verdict && Number.isFinite(score) && critique.length > 0);

  return {
    verdict: verdict || 'unknown',
    score: Number.isFinite(score) ? score : null,
    critique,
    fixes,
    targetAgent: targetAgent || undefined,
    schemaValid,
  };
}

export function combineStructuredOutputs(
  outputs: OrchestrationAgentOutput[],
  strategy: 'merge' | 'sections'
): string {
  if (outputs.length === 0) return '';
  if (outputs.length === 1) return outputs[0].content;

  const bestByRole = (role: OrchestrationAgentRole): OrchestrationAgentOutput | undefined =>
    outputs
      .filter((output) => output.agentRole === role && output.content.trim().length > 0)
      .sort((a, b) => b.score - a.score)[0];

  const planner = bestByRole('planner');
  const identity = bestByRole('identity');
  const rules = bestByRole('rules');
  const structure = bestByRole('structure');
  const generator = bestByRole('generator') || bestByRole('writer');
  const visual = bestByRole('visual');
  const distribution = bestByRole('distribution') || bestByRole('hashtag');
  const critic = bestByRole('critic');

  if (planner || identity || rules || structure || generator || distribution || visual || critic) {
    const sections: string[] = [];
    if (planner?.content) sections.push(`Execution Plan\n${planner.content}`);
    if (identity?.content) sections.push(`Identity\n${identity.content}`);
    if (rules?.content) sections.push(`Rules\n${rules.content}`);
    if (structure?.content) sections.push(`Structure\n${structure.content}`);
    if (generator?.content) sections.push(`Content\n${generator.content}`);
    if (visual?.content) sections.push(`Visual Prompts\n${visual.content}`);
    if (distribution?.content) sections.push(`Captions & Distribution\n${distribution.content}`);
    if (critic?.content) sections.push(`Critic Verdict\n${critic.content}`);
    if (sections.length > 0) return sections.join('\n\n');
  }

  if (strategy === 'sections') {
    return outputs.map((output) => `[${output.agentRole.toUpperCase()}]\n${output.content}`).join('\n\n');
  }

  const hookOutput = outputs.find((output) => output.agentRole === 'hook');
  const bodyOutput = outputs.find((output) => output.agentRole === 'writer');
  const hashtagOutput = outputs.find((output) => output.agentRole === 'hashtag');

  let result = '';
  if (hookOutput) result += `${hookOutput.content}\n\n`;
  if (bodyOutput) result += bodyOutput.content;
  if (hashtagOutput) result += `\n\n${hashtagOutput.content}`;

  return result.trim();
}
