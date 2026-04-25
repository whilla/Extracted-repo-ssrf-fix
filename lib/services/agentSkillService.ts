import { loadSkill, saveSkill } from './memoryService';

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  prompt: string;
  category: string;
  enabled: boolean;
  createdAt: string;
  usageCount: number;
}

type AgentSkillTemplate = Omit<AgentSkill, 'id' | 'createdAt' | 'usageCount'>;

export const DEFAULT_APP_AGENT_SKILLS: AgentSkillTemplate[] = [
  {
    name: 'Direct Execution Mode',
    description: 'When user asks for output, produce it directly without advisory detours.',
    prompt: 'If the user asks for a deliverable, return the deliverable immediately. Do not reply with tutorials unless explicitly requested.',
    category: 'execution',
    enabled: true,
  },
  {
    name: 'Character Prompt Resolver',
    description: 'Treat rich character descriptions as image-generation requests by default.',
    prompt: 'If a message contains a detailed character description, route to direct image generation even when the user does not explicitly say "create image".',
    category: 'media',
    enabled: true,
  },
  {
    name: 'Provider Fallback Discipline',
    description: 'When one media provider fails, try alternatives before returning an error.',
    prompt: 'Attempt configured provider fallback chains for image/video generation before surfacing a failure to the user.',
    category: 'media',
    enabled: true,
  },
  {
    name: 'Fast First Draft',
    description: 'Optimize for response speed with a quality-preserving fast path.',
    prompt: 'Prefer a fast generation pass first, then escalate quality passes only when requested or when quality checks fail.',
    category: 'latency',
    enabled: true,
  },
  {
    name: 'Clarify Ambiguity Briefly',
    description: 'Ask one concise question only when missing details block execution.',
    prompt: 'If required inputs are missing, ask one short clarifying question. Otherwise execute immediately.',
    category: 'conversation',
    enabled: true,
  },
  {
    name: 'Premium Realism Bias',
    description: 'Honor premium cinematic requests with stricter quality constraints.',
    prompt: 'For requests mentioning Netflix, Seedance, premium cinematic, or ultra realism, prioritize identity continuity, natural motion, and high-fidelity output.',
    category: 'quality',
    enabled: true,
  },
];

function toStoredSkill(template: AgentSkillTemplate, index: number): AgentSkill {
  return {
    ...template,
    id: `skill_builtin_${index}_${Date.now()}`,
    createdAt: new Date().toISOString(),
    usageCount: 0,
  };
}

export async function ensureAgentSkillsInstalled(): Promise<AgentSkill[]> {
  const existing = await loadSkill<AgentSkill[]>('all_skills');
  const normalized = Array.isArray(existing) ? existing : [];

  if (normalized.length === 0) {
    const initial = DEFAULT_APP_AGENT_SKILLS.map(toStoredSkill);
    await saveSkill('all_skills', initial);
    return initial;
  }

  const existingNames = new Set(normalized.map((skill) => skill.name));
  const missing = DEFAULT_APP_AGENT_SKILLS
    .filter((template) => !existingNames.has(template.name))
    .map(toStoredSkill);

  if (missing.length === 0) {
    return normalized;
  }

  const merged = [...normalized, ...missing];
  await saveSkill('all_skills', merged);
  return merged;
}

export async function getEnabledAgentSkills(): Promise<AgentSkill[]> {
  const skills = await ensureAgentSkillsInstalled();
  return skills.filter((skill) => skill.enabled !== false);
}

export function buildAgentSkillContext(skills: AgentSkill[]): string {
  if (!skills.length) return '';

  const lines = skills.slice(0, 12).map((skill) => `- ${skill.name}: ${skill.prompt}`);
  return `\n\nActive App Skills:\n${lines.join('\n')}`;
}
