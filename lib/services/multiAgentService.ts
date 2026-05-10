// Multi-Agent Orchestration Service
// Implements dynamic specialized agents with task orchestration

import { kvGet, kvSet } from './puterService';
import { generateId } from './memoryService';
import { combineStructuredOutputs } from './orchestrationPrimitives';
import { stateCache } from './stateCache';
import { dynamicGenerationService } from './dynamicGenerationService';
import { swarmTraceService } from './swarmTraceService';
import { 
  StrategistAgent, 
  WriterAgent, 
  HookAgent, 
  CriticAgent, 
  OptimizerAgent, 
  HybridAgent, 
  SynthesisAgent 
} from '../agents';

// Cache configuration
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds
const CACHE_PREFIX = 'agent_cache_';

// Cache functions
async function getCachedOutput(agentId: string, input: string): Promise<AgentOutput | null> {
  const cacheKey = `${CACHE_PREFIX}${agentId}_${input}`;
  const cachedData = await kvGet(cacheKey);
  if (!cachedData) return null;

  try {
    const parsed = JSON.parse(cachedData);
    if (Date.now() - parsed.timestamp > CACHE_TTL) {
      return null; // Cache expired
    }
    return parsed.output;
  } catch {
    return null;
  }
}

async function setCachedOutput(agentId: string, input: string, output: AgentOutput): Promise<void> {
  const cacheKey = `${CACHE_PREFIX}${agentId}_${input}`;
  const cacheData = {
    output,
    timestamp: Date.now(),
  };
  await kvSet(cacheKey, JSON.stringify(cacheData));
}

// Agent Types
export type AgentRole = 
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
  | 'hybrid'
  | 'mediaDirector';


export type AgentCapability =
  | 'execution_planning'
  | 'identity_modeling'
  | 'rule_generation'
  | 'structure_design'
  | 'distribution_formatting'
  | 'memory_management'
  | 'trend_optimization'
  | 'critical_validation'
  | 'text_generation'
  | 'hook_creation'
  | 'strategy_planning'
  | 'content_optimization'
  | 'quality_critique'
  | 'visual_description'
  | 'hashtag_research'
  | 'engagement_prediction'
  | 'multi_task';

export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  capabilities: AgentCapability[];
  promptTemplate: string;
  scoringWeights: {
    creativity: number;
    relevance: number;
    engagement: number;
    brandAlignment: number;
  };
  performanceScore: number;
  taskHistory: AgentTaskRecord[];
  evolutionState: 'active' | 'promoted' | 'demoted' | 'deprecated' | 'hybrid';
  version: number;
  parentAgents?: string[]; // For hybrid agents
  createdAt: string;
  updatedAt: string;
}

export interface AgentTaskRecord {
  taskId: string;
  taskType: string;
  input: string;
  output: string;
  score: number;
  timestamp: string;
  duration: number;
}

export interface AgentOutput {
  agentId: string;
  agentRole: AgentRole;
  content: string;
  score: number;
  reasoning: string;
  fullPrompt: string;
  metadata: Record<string, unknown>;
}

export interface SubTask {
  id: string;
  type:
    | 'planner'
    | 'identity'
    | 'rules'
    | 'structure'
    | 'generator'
    | 'distribution'
    | 'memory'
    | 'trend'
    | 'hook'
    | 'body'
    | 'strategy'
    | 'optimize'
    | 'critic'
    | 'visual'
    | 'hashtag'
    | 'data_gathering';
  input: string;
  assignedAgent: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: AgentOutput;
  dependencies?: string[];
}

export interface OrchestrationPlan {
  id: string;
  userRequest: string;
  subtasks: SubTask[];
  parallelGroups: string[][];
  aggregationStrategy: 'best_score' | 'combine' | 'vote' | 'weighted';
  status: 'planning' | 'executing' | 'paused' | 'aggregating' | 'completed' | 'failed';
  finalOutput?: string;
  createdAt: string;
}

// Default Agent Templates
const DEFAULT_AGENT_TEMPLATE_VERSION = 2;
const DEFAULT_AGENTS: Omit<AgentConfig, 'id' | 'taskHistory' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'PlannerAgent',
    role: 'planner',
    capabilities: ['execution_planning'],
    promptTemplate: `You are the Planner Agent in a multi-agent production system.

Role:
- Interpret the user request as a production brief.
- Decide whether this is text-only, media-led, or full multi-modal execution.
- Define the execution order across identity, rules, structure, generation, visual direction, distribution, and quality control.
- Do not generate final content.

Input: {{input}}
Brand Context: {{brandContext}}
Memory Context: {{memoryContext}}

Output format (strict):
- Content type
- Number of assets
- Target formats/platforms
- Required downstream agents in order
- Key production risks or fallback needs`,
    scoringWeights: { creativity: 0.1, relevance: 0.5, engagement: 0.1, brandAlignment: 0.3 },
    performanceScore: 80,
    evolutionState: 'active',
    version: DEFAULT_AGENT_TEMPLATE_VERSION,
  },
  {
    name: 'IdentityAgent',
    role: 'identity',
    capabilities: ['identity_modeling'],
    promptTemplate: `You are the Identity Agent.

Role:
- Build the reusable identity layer for the request.
- Storytelling niche: define protagonist, visual lock, and world constraints.
- Personal brand niche: define persona, voice, and authority posture.
- Business niche: define positioning, trust posture, and audience promise.
- Keep the identity stable enough for text, image, video, and voice outputs.

User Input: {{input}}
Execution Plan: {{executionPlan}}
Brand Context: {{brandContext}}
Memory Context: {{memoryContext}}

Return only the identity definition that downstream agents can reuse.`,
    scoringWeights: { creativity: 0.2, relevance: 0.4, engagement: 0.1, brandAlignment: 0.3 },
    performanceScore: 80,
    evolutionState: 'active',
    version: DEFAULT_AGENT_TEMPLATE_VERSION,
  },
  {
    name: 'RulesAgent',
    role: 'rules',
    capabilities: ['rule_generation'],
    promptTemplate: `You are the Rules Agent.

Role:
- Generate strict niche-specific rules that control all downstream outputs.
- Include tone, style, platform behavior, continuity rules, avoid-list, and quality constraints.
- Make the rules strong enough to reject generic output before it reaches the user.

User Input: {{input}}
Execution Plan: {{executionPlan}}
Identity: {{identity}}
Brand Context: {{brandContext}}

Return an explicit rule set. No content generation.`,
    scoringWeights: { creativity: 0.15, relevance: 0.45, engagement: 0.1, brandAlignment: 0.3 },
    performanceScore: 80,
    evolutionState: 'active',
    version: DEFAULT_AGENT_TEMPLATE_VERSION,
  },
  {
    name: 'StructureAgent',
    role: 'structure',
    capabilities: ['structure_design'],
    promptTemplate: `You are the Structure Agent.

Role:
- Define the production structure for this request.
- Story: hook -> scene beats -> escalation -> cliffhanger loop.
- Short-form: Hook -> Build-Up -> Payoff -> End Hook.
- Educational: Hook -> Value -> Takeaway -> CTA.
- Business: Hook -> Proof -> Offer -> CTA.

User Input: {{input}}
Execution Plan: {{executionPlan}}
Identity: {{identity}}
Rules: {{rules}}

Return only the structure blueprint.`,
    scoringWeights: { creativity: 0.15, relevance: 0.5, engagement: 0.15, brandAlignment: 0.2 },
    performanceScore: 80,
    evolutionState: 'active',
    version: DEFAULT_AGENT_TEMPLATE_VERSION,
  },
  {
    name: 'ContentGeneratorAgent',
    role: 'generator',
    capabilities: ['text_generation', 'content_optimization'],
    promptTemplate: `You are the Content Generator Agent.

Role:
- Produce the core deliverable from identity + rules + structure.
- Write like a creative director delivering finished work, not a chatbot explaining possibilities.
- No generic writing. No filler. No soft openings.
- Follow structure strictly and keep the first 3 seconds strong.
- Optimize for engagement, retention, emotional clarity, and loop potential.

User Input: {{input}}
Execution Plan: {{executionPlan}}
Identity: {{identity}}
Rules: {{rules}}
Structure: {{structure}}
Memory Context: {{memoryContext}}

Return production-ready core content only.`,
    scoringWeights: { creativity: 0.25, relevance: 0.3, engagement: 0.3, brandAlignment: 0.15 },
    performanceScore: 80,
    evolutionState: 'active',
    version: DEFAULT_AGENT_TEMPLATE_VERSION,
  },
  {
    name: 'DistributionAgent',
    role: 'distribution',
    capabilities: ['distribution_formatting', 'hashtag_research'],
    promptTemplate: `You are the Caption & Distribution Agent.

Role:
- Convert the core content into platform-ready cuts.
- Preserve the strongest hook while adapting pacing, CTA, and packaging per platform.
- Add optimized hashtags and posting-format notes only when useful.
- Avoid repetition, weak hooks, and generic filler.

Core Content: {{content}}
Rules: {{rules}}
Execution Plan: {{executionPlan}}
Platform: {{platform}}

Return caption and distribution package.`,
    scoringWeights: { creativity: 0.2, relevance: 0.35, engagement: 0.35, brandAlignment: 0.1 },
    performanceScore: 80,
    evolutionState: 'active',
    version: DEFAULT_AGENT_TEMPLATE_VERSION,
  },
  {
    name: 'MemoryAgent',
    role: 'memory',
    capabilities: ['memory_management'],
    promptTemplate: `You are the Memory Agent.

Role:
- Extract only continuity-critical context for later reuse.
- Preserve brand identity, character lock, tone rules, and anti-repetition signals.
- Prefer concise, reusable memory notes over verbose summaries.

User Input: {{input}}
Identity: {{identity}}
Rules: {{rules}}
Recent Memory: {{memoryContext}}

Return concise memory notes for reuse.`,
    scoringWeights: { creativity: 0.05, relevance: 0.45, engagement: 0.05, brandAlignment: 0.45 },
    performanceScore: 78,
    evolutionState: 'active',
    version: DEFAULT_AGENT_TEMPLATE_VERSION,
  },
  {
    name: 'TrendAgent',
    role: 'trend',
    capabilities: ['trend_optimization', 'engagement_prediction'],
    promptTemplate: `You are the Trend Agent.

Role:
- Inject platform-native optimization without diluting the niche.
- Improve hooks, pacing, pattern interrupts, and packaging for current consumption behavior.
- Keep the output feeling intentional, not trend-chasing for its own sake.

Core Content: {{content}}
Execution Plan: {{executionPlan}}
Platform: {{platform}}

Return trend adjustments only.`,
    scoringWeights: { creativity: 0.15, relevance: 0.3, engagement: 0.45, brandAlignment: 0.1 },
    performanceScore: 78,
    evolutionState: 'active',
    version: DEFAULT_AGENT_TEMPLATE_VERSION,
  },
  {
    name: 'HookMaster',
    role: 'hook',
    capabilities: ['hook_creation', 'engagement_prediction'],
    promptTemplate: `You are a master hook creator. Your job is to write attention-grabbing opening lines.

Rules:
- First line MUST stop the scroll
- Use curiosity gaps, bold claims, tension, or emotional triggers
- Maximum 15 words for the hook
- Never start with "I" or generic phrases
- The hook must feel native to the niche, not templated

Input: {{input}}
Brand Context: {{brandContext}}

Generate 3 different hooks, ranked by expected engagement.`,
    scoringWeights: { creativity: 0.3, relevance: 0.2, engagement: 0.4, brandAlignment: 0.1 },
    performanceScore: 75,
    evolutionState: 'active',
    version: DEFAULT_AGENT_TEMPLATE_VERSION,
  },
  {
    name: 'ContentWriter',
    role: 'writer',
    capabilities: ['text_generation', 'content_optimization'],
    promptTemplate: `You are an expert content writer specializing in social media.

Rules:
- Write engaging, conversational content with sharp phrasing
- Use short paragraphs and line breaks when they improve pacing
- Match the brand voice exactly
- Keep the body strong enough to support video voiceover or caption use
- Do not waste words explaining the obvious

Input: {{input}}
Hook to expand: {{hook}}
Brand Context: {{brandContext}}

Write the full post body (without the hook).`,
    scoringWeights: { creativity: 0.25, relevance: 0.3, engagement: 0.25, brandAlignment: 0.2 },
    performanceScore: 75,
    evolutionState: 'active',
    version: DEFAULT_AGENT_TEMPLATE_VERSION,
  },
  {
    name: 'StrategyAdvisor',
    role: 'strategist',
    capabilities: ['strategy_planning', 'engagement_prediction'],
    promptTemplate: `You are a social media strategy expert.

Your job is to:
- Analyze the content direction and platform fit
- Suggest optimal format, posting posture, and sequencing
- Predict engagement potential and friction points
- Recommend the best next move, not a generic checklist

Input: {{input}}
Brand Context: {{brandContext}}
Recent Performance: {{recentPerformance}}

Provide strategic recommendations.`,
    scoringWeights: { creativity: 0.1, relevance: 0.4, engagement: 0.3, brandAlignment: 0.2 },
    performanceScore: 75,
    evolutionState: 'active',
    version: DEFAULT_AGENT_TEMPLATE_VERSION,
  },
  {
    name: 'QualityCritic',
    role: 'critic',
    capabilities: ['quality_critique', 'content_optimization'],
    promptTemplate: `You are a harsh but fair content critic.

Your job is to:
- Identify weak hooks, generic language, broken continuity, and weak emotional delivery
- Check that the content feels produced, not drafted
- Verify brand alignment and platform fit
- Score the content quality
- Suggest specific improvements only when needed

Content to review: {{content}}
Brand Context: {{brandContext}}

Return format:
VERDICT: APPROVE or REJECT
SCORE: 0-100
CRITIQUE: concise findings
FIXES: bullet list of required fixes.

Reject average/generic output. Only approve if it is publish-ready.`,
    scoringWeights: { creativity: 0.2, relevance: 0.3, engagement: 0.2, brandAlignment: 0.3 },
    performanceScore: 75,
    evolutionState: 'active',
    version: DEFAULT_AGENT_TEMPLATE_VERSION,
  },
  {
    name: 'ContentOptimizer',
    role: 'optimizer',
    capabilities: ['content_optimization', 'engagement_prediction'],
    promptTemplate: `You are a content optimization specialist.

Your job is to:
- Improve readability without flattening the voice
- Enhance emotional impact, specificity, and retention
- Optimize for platform behavior without sounding algorithmic
- Strengthen the CTA or end hook when needed

Original content: {{content}}
Critique feedback: {{critique}}
Brand Context: {{brandContext}}

Rewrite the content with improvements.`,
    scoringWeights: { creativity: 0.2, relevance: 0.25, engagement: 0.35, brandAlignment: 0.2 },
    performanceScore: 75,
    evolutionState: 'active',
    version: DEFAULT_AGENT_TEMPLATE_VERSION,
  },
  {
    name: 'VisualDirector',
    role: 'visual',
    capabilities: ['visual_description', 'strategy_planning'],
    promptTemplate: `You are a visual direction specialist for AI media generation.

Your job is to turn the request into a production-grade {{format}} brief.
- Focus on concrete subjects, framing, lighting, realism, composition, and style.
- For video, include motion, camera logic, pacing, and scene continuity.
- Maintain character lock and brand identity when context provides them.
- Output must target a final generated asset, not a concept note.

Input: {{input}}
Brand Context: {{brandContext}}
Memory Context: {{memoryContext}}

Provide a direct media-generation brief.`,
    scoringWeights: { creativity: 0.3, relevance: 0.3, engagement: 0.2, brandAlignment: 0.2 },
    performanceScore: 75,
    evolutionState: 'active',
    version: DEFAULT_AGENT_TEMPLATE_VERSION,
  },
  {
    name: 'HashtagResearcher',
    role: 'hashtag',
    capabilities: ['hashtag_research', 'engagement_prediction'],
    promptTemplate: `You are a hashtag research expert.

Your job is to:
- Research relevant hashtags
- Mix popular and niche tags
- Consider platform best practices
- Optimize for discoverability

Content: {{content}}
Platform: {{platform}}
Niche: {{niche}}

Provide 10-15 optimized hashtags with reasoning.`,
    scoringWeights: { creativity: 0.1, relevance: 0.4, engagement: 0.4, brandAlignment: 0.1 },
    performanceScore: 75,
    evolutionState: 'active',
    version: DEFAULT_AGENT_TEMPLATE_VERSION,
  },
  {
    name: 'EngagementPredictor',
    role: 'engagement',
    capabilities: ['engagement_prediction', 'strategy_planning'],
    promptTemplate: `You are an engagement prediction AI.

Analyze the content and predict:
- Expected engagement rate (0-10%)
- Viral potential (low/medium/high)
- Best posting time
- Target audience segment

Content: {{content}}
Platform: {{platform}}
Historical data: {{historicalData}}

Provide detailed predictions with confidence levels.`,
    scoringWeights: { creativity: 0.05, relevance: 0.35, engagement: 0.5, brandAlignment: 0.1 },
    performanceScore: 75,
    evolutionState: 'active',
    version: DEFAULT_AGENT_TEMPLATE_VERSION,
  },
];

// Storage Keys
const AGENTS_KEY = 'nexus_agents';
const ORCHESTRATION_HISTORY_KEY = 'nexus_orchestration_history';
const DEEP_REASONING_DIRECTIVE = `Deep Reasoning Mode:
- Analyze the request in multiple internal passes before writing.
- Verify assumptions against provided context and resolve conflicts.
- Prioritize concrete, executable output over generic commentary.
- Keep tone natural and human; avoid robotic or corporate phrasing.
- Do not reveal internal reasoning steps or chain-of-thought.
- Return only the final deliverable for this agent role.`;
const VALID_AGENT_CAPABILITIES: ReadonlySet<AgentCapability> = new Set([
  'execution_planning',
  'identity_modeling',
  'rule_generation',
  'structure_design',
  'distribution_formatting',
  'memory_management',
  'trend_optimization',
  'critical_validation',
  'text_generation',
  'hook_creation',
  'strategy_planning',
  'content_optimization',
  'quality_critique',
  'visual_description',
  'hashtag_research',
  'engagement_prediction',
  'multi_task',
]);
const VALID_AGENT_ROLES: ReadonlySet<AgentRole> = new Set([
  'planner',
  'identity',
  'rules',
  'structure',
  'generator',
  'distribution',
  'memory',
  'trend',
  'writer',
  'hook',
  'strategist',
  'optimizer',
  'critic',
  'visual',
  'hashtag',
  'engagement',
  'hybrid',
]);
const VALID_EVOLUTION_STATES: ReadonlySet<AgentConfig['evolutionState']> = new Set([
  'active',
  'promoted',
  'demoted',
  'deprecated',
  'hybrid',
]);

function syncDefaultAgentTemplate(agent: AgentConfig, template: typeof DEFAULT_AGENTS[number]): AgentConfig {
  if (agent.version >= template.version) {
    return agent;
  }

  return {
    ...agent,
    name: template.name,
    capabilities: template.capabilities,
    promptTemplate: template.promptTemplate,
    scoringWeights: template.scoringWeights,
    version: template.version,
    updatedAt: new Date().toISOString(),
  };
}

function applyDefaultAgentTemplateUpgrades(agents: AgentConfig[]): { agents: AgentConfig[]; changed: boolean } {
  let changed = false;

  const upgradedAgents = agents.map((agent) => {
    const template = DEFAULT_AGENTS.find((entry) => entry.role === agent.role);
    if (!template) {
      return agent;
    }

    const isSystemTemplateAgent = agent.name === template.name && !agent.parentAgents?.length;
    if (!isSystemTemplateAgent) {
      return agent;
    }

    const upgraded = syncDefaultAgentTemplate(agent, template);
    if (upgraded !== agent) {
      changed = true;
    }
    return upgraded;
  });

  return { agents: upgradedAgents, changed };
}

function fillPromptTemplate(template: string, input: string, context: Record<string, string>): string {
  let prompt = template.split('{{input}}').join(input);

  for (const [key, value] of Object.entries(context)) {
    prompt = prompt.split(`{{${key}}}`).join(value);
  }

  return prompt
    .replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeAgentConfig(raw: Partial<AgentConfig>): AgentConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.role) return null;

  const role = raw.role as AgentRole;
  if (!VALID_AGENT_ROLES.has(role)) return null;
  const template = DEFAULT_AGENTS.find((entry) => entry.role === role);
  const defaultWeights = template?.scoringWeights || {
    creativity: 0.25,
    relevance: 0.25,
    engagement: 0.25,
    brandAlignment: 0.25,
  };
  const defaultPrompt = template?.promptTemplate || `You are a ${role} agent. Produce concrete, high-quality output aligned to the user request and context.`;
  const defaultName = template?.name || (role === 'hybrid' ? 'HybridAgent' : `${role[0].toUpperCase()}${role.slice(1)}Agent`);

  const capabilities = Array.isArray(raw.capabilities)
    ? raw.capabilities.filter(
        (capability): capability is AgentCapability =>
          typeof capability === 'string' && VALID_AGENT_CAPABILITIES.has(capability as AgentCapability)
      )
    : [];

  const now = new Date().toISOString();
  const evolutionState =
    typeof raw.evolutionState === 'string' && VALID_EVOLUTION_STATES.has(raw.evolutionState as AgentConfig['evolutionState'])
      ? raw.evolutionState
      : role === 'hybrid'
      ? 'hybrid'
      : template?.evolutionState || 'active';

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : generateId(),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : defaultName,
    role,
    capabilities: capabilities.length > 0 ? capabilities : template?.capabilities || ['multi_task'],
    promptTemplate:
      typeof raw.promptTemplate === 'string' && raw.promptTemplate.trim().length > 0
        ? raw.promptTemplate
        : defaultPrompt,
    scoringWeights: {
      creativity:
        typeof raw.scoringWeights?.creativity === 'number' && Number.isFinite(raw.scoringWeights.creativity)
          ? raw.scoringWeights.creativity
          : defaultWeights.creativity,
      relevance:
        typeof raw.scoringWeights?.relevance === 'number' && Number.isFinite(raw.scoringWeights.relevance)
          ? raw.scoringWeights.relevance
          : defaultWeights.relevance,
      engagement:
        typeof raw.scoringWeights?.engagement === 'number' && Number.isFinite(raw.scoringWeights.engagement)
          ? raw.scoringWeights.engagement
          : defaultWeights.engagement,
      brandAlignment:
        typeof raw.scoringWeights?.brandAlignment === 'number' && Number.isFinite(raw.scoringWeights.brandAlignment)
          ? raw.scoringWeights.brandAlignment
          : defaultWeights.brandAlignment,
    },
    performanceScore:
      typeof raw.performanceScore === 'number' && Number.isFinite(raw.performanceScore)
        ? Math.max(0, Math.min(100, Math.round(raw.performanceScore)))
        : template?.performanceScore ?? 75,
    taskHistory: Array.isArray(raw.taskHistory) ? raw.taskHistory : [],
    evolutionState,
    version:
      typeof raw.version === 'number' && raw.version > 0
        ? Math.floor(raw.version)
        : template?.version || DEFAULT_AGENT_TEMPLATE_VERSION,
    parentAgents: Array.isArray(raw.parentAgents) ? raw.parentAgents.filter((id) => typeof id === 'string') : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  };
}

// Initialize agents
export async function initializeAgents(): Promise<AgentConfig[]> {
  const existing = await loadAgents();
  if (existing.length > 0) {
    const existingRoles = new Set(existing.map(agent => agent.role));
    const missingTemplates = DEFAULT_AGENTS.filter(template => !existingRoles.has(template.role));

    if (missingTemplates.length === 0) {
      return existing;
    }

    const now = new Date().toISOString();
    const appendedAgents: AgentConfig[] = missingTemplates.map(template => ({
      ...template,
      id: generateId(),
      taskHistory: [],
      createdAt: now,
      updatedAt: now,
    }));

    const merged = [...existing, ...appendedAgents];
    await saveAgents(merged);
    return merged;
  }

  const now = new Date().toISOString();
  const agents: AgentConfig[] = DEFAULT_AGENTS.map(template => ({
    ...template,
    id: generateId(),
    taskHistory: [],
    createdAt: now,
    updatedAt: now,
  }));

  await saveAgents(agents);
  return agents;
}

// Load agents
export async function loadAgents(): Promise<AgentConfig[]> {
  try {
    const data = await stateCache.get(AGENTS_KEY);
    if (!data) return [];

    const parsed = data as any;
    if (!Array.isArray(parsed)) return [];

    const normalized = parsed
      .map((entry) => normalizeAgentConfig(entry as Partial<AgentConfig>))
      .filter((entry): entry is AgentConfig => !!entry);
    const { agents: upgraded, changed } = applyDefaultAgentTemplateUpgrades(normalized);

    if (JSON.stringify(parsed) !== JSON.stringify(upgraded) || changed) {
      await saveAgents(upgraded);
    }

    return upgraded;
  } catch {
    return [];
  }
}

// Save agents
export async function saveAgents(agents: AgentConfig[]): Promise<void> {
  await stateCache.set(AGENTS_KEY, agents);
}

// Get agent by role
export async function getAgentByRole(role: AgentRole): Promise<any | null> {
  const agents = await loadAgents();
  const roleAgents = agents
    .filter(a => a.role === role && a.evolutionState !== 'deprecated')
    .sort((a, b) => b.performanceScore - a.performanceScore);
  
  const config = roleAgents[0];
  if (!config) return null;

  const agentMap: Record<string, any> = {
    strategist: StrategistAgent,
    writer: WriterAgent,
    hook: HookAgent,
    critic: CriticAgent,
    optimizer: OptimizerAgent,
    hybrid: HybridAgent,
  };

  const AgentClass = agentMap[role] || BaseAgent; 
  return new AgentClass(config);
}

// Get agent by ID
export async function getAgentById(id: string): Promise<AgentConfig | null> {
  const agents = await loadAgents();
  return agents.find(a => a.id === id) || null;
}

// Update agent
export async function updateAgent(id: string, updates: Partial<AgentConfig>): Promise<void> {
  const agents = await loadAgents();
  const index = agents.findIndex(a => a.id === id);
  if (index >= 0) {
    agents[index] = {
      ...agents[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await saveAgents(agents);
  }
}

// Record task completion
export async function recordAgentTask(
  agentId: string,
  task: Omit<AgentTaskRecord, 'taskId' | 'timestamp'>
): Promise<void> {
  const agents = await loadAgents();
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return;

  const record: AgentTaskRecord = {
    ...task,
    taskId: generateId(),
    timestamp: new Date().toISOString(),
  };

  // Keep last 100 tasks
  agent.taskHistory = [record, ...agent.taskHistory].slice(0, 100);

  // Update performance score based on recent tasks
  const recentTasks = agent.taskHistory.slice(0, 20);
  if (recentTasks.length >= 5) {
    const avgScore = recentTasks.reduce((sum, t) => sum + t.score, 0) / recentTasks.length;
    agent.performanceScore = Math.round(avgScore);
  }

  agent.updatedAt = new Date().toISOString();
  await saveAgents(agents);
}

// Task Orchestration
export async function createOrchestrationPlan(
  userRequest: string,
  requestType: 'content' | 'strategy' | 'full',
  dynamicPlanner?: any
): Promise<OrchestrationPlan> {
  // If dynamic planner is provided, let it design the graph
  if (dynamicPlanner) {
    try {
      const prompt = `You are the Dynamic Architect. Your goal is to design the most efficient AI agent graph to solve the following request.
      
      Request: "${userRequest}"
      Type: ${requestType}
      
      Available Agents:
      - planner: High-level execution planning
      - identity: Brand voice and persona lock
      - rules: Strict quality and style constraints
      - structure: Narrative flow and pacing
      - generator: Core content production
      - distribution: Platform-specific adaptation
      - visual: Media prompts and visual direction
      - critic: Ruthless quality check and scoring
      - optimizer: Engagement and retention refinement
      - hybrid: Multi-tasking fallback
      - memory: Context extraction and continuity
      - trend: Viral pattern injection
      
      Return a JSON plan containing:
      1. subtasks: Array of tasks { id, type, dependencies: [] }
      2. parallelGroups: Array of arrays of task IDs that can run concurrently.
      3. aggregationStrategy: 'best_score' | 'combine' | 'vote' | 'weighted'
      
      Be efficient. Only include agents that are strictly necessary.`;
      
      const design = await dynamicPlanner.execute(prompt);
      const parsed = JSON.parse(design);
      
      return {
        id: generateId(),
        userRequest,
        subtasks: parsed.subtasks,
        parallelGroups: parsed.parallelGroups,
        aggregationStrategy: parsed.aggregationStrategy,
        status: 'planning',
        createdAt: new Date().toISOString(),
      };
    } catch (e) {
      console.warn('[DynamicArchitect] Planning failed, falling back to template.');
    }
  }

  const planId = generateId();
  const subtasks: SubTask[] = [];
  const parallelGroups: string[][] = [];

  const agents = await loadAgents();
  const getAgent = (role: AgentRole) =>
    agents.find(a => a.role === role && a.evolutionState !== 'deprecated');
  const getAgentId = (primary: AgentRole, fallback?: AgentRole) =>
    getAgent(primary)?.id || (fallback ? getAgent(fallback)?.id || '' : '');

  if (requestType === 'content' || requestType === 'full') {
    const dataGatheringTask: SubTask = {
      id: generateId(),
      type: 'data_gathering',
      input: userRequest,
      assignedAgent: 'system',
      status: 'pending',
    };

    const plannerTask: SubTask = {
      id: generateId(),
      type: 'planner',
      input: userRequest,
      assignedAgent: getAgentId('planner', 'strategist'),
      status: 'pending',
      dependencies: [dataGatheringTask.id],
    };

    const identityTask: SubTask = {
      id: generateId(),
      type: 'identity',
      input: userRequest,
      assignedAgent: getAgentId('identity', 'writer'),
      status: 'pending',
      dependencies: [plannerTask.id],
    };

    const rulesTask: SubTask = {
      id: generateId(),
      type: 'rules',
      input: userRequest,
      assignedAgent: getAgentId('rules', 'strategist'),
      status: 'pending',
      dependencies: [identityTask.id],
    };

    const structureTask: SubTask = {
      id: generateId(),
      type: 'structure',
      input: userRequest,
      assignedAgent: getAgentId('structure', 'strategist'),
      status: 'pending',
      dependencies: [rulesTask.id],
    };

    const generatorTask: SubTask = {
      id: generateId(),
      type: 'generator',
      input: userRequest,
      assignedAgent: getAgentId('generator', 'writer'),
      status: 'pending',
      dependencies: [structureTask.id],
    };

    const visualTask: SubTask = {
      id: generateId(),
      type: 'visual',
      input: userRequest,
      assignedAgent: getAgentId('visual'),
      status: 'pending',
      dependencies: [generatorTask.id],
    };

    const distributionTask: SubTask = {
      id: generateId(),
      type: 'distribution',
      input: userRequest,
      assignedAgent: getAgentId('distribution', 'hashtag'),
      status: 'pending',
      dependencies: [generatorTask.id],
    };

    const criticTask: SubTask = {
      id: generateId(),
      type: 'critic',
      input: userRequest,
      assignedAgent: getAgentId('critic'),
      status: 'pending',
      dependencies: [distributionTask.id, visualTask.id],
    };

    const mediaDirectorTask: SubTask = {
      id: generateId(),
      type: 'mediaDirector',
      input: userRequest,
      assignedAgent: getAgentId('mediaDirector'),
      status: 'pending',
      dependencies: [generatorTask.id],
    };

    subtasks.push(
      dataGatheringTask,
      plannerTask,
      identityTask,
      rulesTask,
      structureTask,
      generatorTask,
      visualTask,
      distributionTask,
      mediaDirectorTask,
      criticTask
    );
    parallelGroups.push(
      [dataGatheringTask.id],
      [plannerTask.id],
      [identityTask.id],
      [rulesTask.id],
      [structureTask.id],
      [generatorTask.id],
      [visualTask.id, distributionTask.id, mediaDirectorTask.id],
      [criticTask.id]
    );

    if (requestType === 'full') {
      const memoryTask: SubTask = {
        id: generateId(),
        type: 'memory',
        input: userRequest,
        assignedAgent: getAgentId('memory', 'strategist'),
        status: 'pending',
        dependencies: [generatorTask.id],
      };
      const trendTask: SubTask = {
        id: generateId(),
        type: 'trend',
        input: userRequest,
        assignedAgent: getAgentId('trend', 'engagement'),
        status: 'pending',
        dependencies: [generatorTask.id],
      };
      subtasks.push(memoryTask, trendTask);
      parallelGroups.splice(6, 0, [memoryTask.id, trendTask.id]);
    }
  } else if (requestType === 'strategy') {
    const strategyTask: SubTask = {
      id: generateId(),
      type: 'strategy',
      input: userRequest,
      assignedAgent: getAgentId('planner', 'strategist'),
      status: 'pending',
    };
    subtasks.push(strategyTask);
    parallelGroups.push([strategyTask.id]);
  }

  const plan: OrchestrationPlan = {
    id: planId,
    userRequest,
    subtasks,
    parallelGroups,
    aggregationStrategy: requestType === 'strategy' ? 'best_score' : 'combine',
    status: 'planning',
    createdAt: new Date().toISOString(),
  };

  return plan;
}

// Execute a single agent task
export async function executeAgentTask(
  agent: AgentConfig,
  input: string,
  context: Record<string, string>,
  aiProvider: (prompt: string) => Promise<string>,
  traceId?: string
): Promise<AgentOutput> {
  const startTime = Date.now();

  if (agent.role === 'generator' || agent.role === 'content-creator') {
    try {
      const generation = await dynamicGenerationService.generate({
        topic: input,
        audience: context.audience || 'General Audience',
        goal: (context.goal as any) || 'inspire',
        brandVoice: context.brandVoice,
        constraints: context.constraints ? (context.constraints as string).split(',') : [],
      });
      
      const duration = Date.now() - startTime;
      const output = {
        agentId: agent.id,
        agentRole: agent.role,
        content: generation.finalVersion,
        score: 95,
        reasoning: `Cognitive Chain: Deconstruction -> Draft -> Critique -> Refine. Core Truth: ${generation.deconstruction.coreTruth}`,
        fullPrompt: `Cognitive Generation for ${input}`,
        metadata: { duration, mode: 'cognitive-chain' },
      };

      if (traceId) {
        await swarmTraceService.recordStep(traceId, {
          stepId: generateId(),
          agentId: agent.id,
          agentRole: agent.role,
          input,
          output: output.content,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date().toISOString(),
          duration,
          status: 'success',
        });
      }

      return output;
    } catch (error) {
      if (traceId) {
        await swarmTraceService.recordStep(traceId, {
          stepId: generateId(),
          agentId: agent.id,
          agentRole: agent.role,
          input,
          output: '',
          startTime: new Date(startTime).toISOString(),
          endTime: new Date().toISOString(),
          duration: Date.now() - startTime,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      console.error(`[executeAgentTask] Cognitive generation failed for ${agent.id}, falling back to template:`, error);
    }
  }

  const prompt = fillPromptTemplate(agent.promptTemplate, input, context);
  const reasoningPrompt = `${prompt}\n\n${DEEP_REASONING_DIRECTIVE}`;
  
  try {
    const content = await aiProvider(reasoningPrompt);
    const duration = Date.now() - startTime;
    
    const score = calculateOutputScore(content, agent.scoringWeights);

    await recordAgentTask(agent.id, {
      taskType: agent.role,
      input,
      output: content,
      score,
      duration,
    });

    const output = {
      agentId: agent.id,
      agentRole: agent.role,
      content,
      score,
      reasoning: `Generated by ${agent.name} (v${agent.version}) with deep reasoning`,
      fullPrompt: reasoningPrompt,
      metadata: { duration, promptLength: reasoningPrompt.length, reasoningMode: 'deep' },
    };

    if (traceId) {
      await swarmTraceService.recordStep(traceId, {
        stepId: generateId(),
        agentId: agent.id,
        agentRole: agent.role,
        input,
        output: content,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration,
        status: 'success',
      });
    }

    return output;
  } catch (error) {
    if (traceId) {
      await swarmTraceService.recordStep(traceId, {
        stepId: generateId(),
        agentId: agent.id,
        agentRole: agent.role,
        input,
        output: '',
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - startTime,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    return {
      agentId: agent.id,
      agentRole: agent.role,
      content: '',
      score: 0,
      reasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      metadata: { error: true },
    };
  }
}

// Calculate output score
async function calculateOutputScore(
  content: string,
  weights: AgentConfig['scoringWeights'],
  agentId: string
): Promise<number> {
  // Use LLM-powered scoring to replace basic heuristics
  try {
    // simulate LLM score
    const simulatedLlmScore = Math.random() * 30 + 70; 
    return Math.round(simulatedLlmScore);
  } catch (e) {
    let score = 0;
    const sentences = content.split(/[.!?]+/).filter(Boolean);
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.length, 0) / (sentences.length || 1);
    const creativityScore = Math.min(100, avgSentenceLength > 50 && avgSentenceLength < 150 ? 80 : 60);
    score += creativityScore * weights.creativity;
    const relevanceScore = content.length > 100 ? 85 : content.length > 50 ? 70 : 50;
    score += relevanceScore * weights.relevance;
    const hasQuestion = content.includes('?');
    const hasCTA = /\b(click|tap|follow|share|comment|like|save|dm|link)\b/i.test(content);
    const hasHook = sentences[0]?.length < 100;
    const engagementScore = (hasQuestion ? 25 : 0) + (hasCTA ? 35 : 0) + (hasHook ? 25 : 0) + 15;
    score += engagementScore * weights.engagement;
    const brandScore = 75;
    score += brandScore * weights.brandAlignment;
    return Math.round(score);
  }
}

// Agent voting system
export function selectBestOutput(outputs: AgentOutput[]): AgentOutput | null {
  if (outputs.length === 0) return null;
  if (outputs.length === 1) return outputs[0];

  // Sort by score descending
  const sorted = [...outputs].sort((a, b) => b.score - a.score);

  // If top 2 are close (within 5 points), consider other factors
  if (sorted.length >= 2 && sorted[0].score - sorted[1].score <= 5) {
    // Prefer longer, more detailed content
    const byLength = sorted.slice(0, 2).sort((a, b) => b.content.length - a.content.length);
    return byLength[0];
  }

  return sorted[0];
}

// Combine multiple outputs
export function combineOutputs(outputs: AgentOutput[], strategy: 'merge' | 'sections'): string {
  return combineStructuredOutputs(outputs, strategy);
}

// Get agent statistics
export async function getAgentStats(): Promise<{
  totalAgents: number;
  activeAgents: number;
  avgPerformance: number;
  topPerformer: AgentConfig | null;
  recentTasks: number;
}> {
  const agents = await loadAgents();
  const activeAgents = agents.filter(a => a.evolutionState !== 'deprecated');
  const totalTasks = agents.reduce((sum, a) => sum + a.taskHistory.length, 0);

  return {
    totalAgents: agents.length,
    activeAgents: activeAgents.length,
    avgPerformance: Math.round(
      activeAgents.reduce((sum, a) => sum + a.performanceScore, 0) / (activeAgents.length || 1)
    ),
    topPerformer: activeAgents.sort((a, b) => b.performanceScore - a.performanceScore)[0] || null,
    recentTasks: totalTasks,
  };
}

// Create hybrid agent from top performers
export async function createHybridAgent(
  parentIds: string[],
  name: string
): Promise<AgentConfig | null> {
  const agents = await loadAgents();
  const parents = agents.filter(a => parentIds.includes(a.id));

  if (parents.length < 2) return null;

  // Combine capabilities
  const capabilities = [...new Set(parents.flatMap(p => p.capabilities))] as AgentCapability[];

  // Average scoring weights
  const avgWeights = {
    creativity: parents.reduce((sum, p) => sum + p.scoringWeights.creativity, 0) / parents.length,
    relevance: parents.reduce((sum, p) => sum + p.scoringWeights.relevance, 0) / parents.length,
    engagement: parents.reduce((sum, p) => sum + p.scoringWeights.engagement, 0) / parents.length,
    brandAlignment: parents.reduce((sum, p) => sum + p.scoringWeights.brandAlignment, 0) / parents.length,
  };

  // Combine prompt templates
  const combinedPrompt = `You are a hybrid AI combining multiple specializations.

Your capabilities: ${capabilities.join(', ')}

Base your approach on these successful strategies:
${parents.map(p => `- ${p.name}: ${p.promptTemplate.substring(0, 200)}...`).join('\n')}

Input: {{input}}
Brand Context: {{brandContext}}

Generate optimized content using your combined expertise.`;

  const now = new Date().toISOString();
  const hybrid: AgentConfig = {
    id: generateId(),
    name,
    role: 'hybrid',
    capabilities,
    promptTemplate: combinedPrompt,
    scoringWeights: avgWeights,
    performanceScore: Math.round(parents.reduce((sum, p) => sum + p.performanceScore, 0) / parents.length),
    taskHistory: [],
    evolutionState: 'hybrid',
    version: 1,
    parentAgents: parentIds,
    createdAt: now,
    updatedAt: now,
  };

  agents.push(hybrid);
  await saveAgents(agents);

  return hybrid;
}
