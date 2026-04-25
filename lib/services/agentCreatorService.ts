// Agent Creator Service
// Create, configure, and deploy custom AI agents with self-modification capabilities

import { kvGet, kvSet, writeFile, readFile, PATHS } from './puterService';
import { generateId } from './memoryService';
import { chat } from './aiService';
import { validateContent } from './governorService';
import { 
  loadAgents, 
  saveAgents, 
  type AgentConfig, 
  type AgentRole, 
  type AgentCapability 
} from './multiAgentService';

// Agent Blueprint for creation
export interface AgentBlueprint {
  name: string;
  description: string;
  role: AgentRole | string;
  personality: AgentPersonality;
  capabilities: AgentCapability[];
  customCapabilities: string[];
  promptTemplate: string;
  systemInstructions: string;
  codeModules: AgentCodeModule[];
  scoringWeights: {
    creativity: number;
    relevance: number;
    engagement: number;
    brandAlignment: number;
    customMetrics: Record<string, number>;
  };
  triggers: AgentTrigger[];
  constraints: AgentConstraint[];
  godModeEnabled: boolean;
  selfModificationLevel: 'none' | 'limited' | 'moderate' | 'full';
}

export interface AgentPersonality {
  tone: string;
  style: string;
  traits: string[];
  vocabulary: string[];
  avoidPhrases: string[];
  exampleOutputs: string[];
}

export interface AgentCodeModule {
  id: string;
  name: string;
  description: string;
  code: string;
  filePath?: string;
  language: 'typescript' | 'javascript' | 'json';
  isActive: boolean;
  version: number;
  lastModified: string;
  modifiedBy: 'user' | 'agent' | 'evolution';
  validation?: {
    passed: boolean;
    errors: string[];
    validatedAt: string;
  };
}

export interface AgentTrigger {
  id: string;
  type: 'keyword' | 'pattern' | 'intent' | 'schedule' | 'event';
  value: string;
  action: 'activate' | 'run_task' | 'modify_behavior';
  priority: number;
}

export interface AgentConstraint {
  id: string;
  type: 'output_length' | 'content_filter' | 'rate_limit' | 'cost_limit' | 'topic_restriction';
  value: string | number;
  enforced: boolean;
}

export interface CreatedAgent extends AgentConfig {
  blueprint: AgentBlueprint;
  codeModules: AgentCodeModule[];
  selfModificationLog: SelfModificationEntry[];
  godModeStats: {
    totalModifications: number;
    successfulModifications: number;
    lastModification: string | null;
  };
}

export interface SelfModificationEntry {
  id: string;
  timestamp: string;
  type: 'prompt' | 'code' | 'weight' | 'capability' | 'behavior';
  before: string;
  after: string;
  reasoning: string;
  impact: 'positive' | 'neutral' | 'negative' | 'unknown';
  approved: boolean;
  appliedAt?: string;
}

// Storage Keys
const CREATED_AGENTS_KEY = 'nexus_created_agents';
const AGENT_BLUEPRINTS_KEY = 'nexus_agent_blueprints';

function slugifyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'module';
}

function getModuleExtension(language: AgentCodeModule['language']): string {
  switch (language) {
    case 'javascript':
      return 'js';
    case 'json':
      return 'json';
    case 'typescript':
    default:
      return 'ts';
  }
}

function getModulePath(agentId: string, module: Pick<AgentCodeModule, 'name' | 'language'>): string {
  const extension = getModuleExtension(module.language);
  return `${PATHS.system}/agents/${agentId}/modules/${slugifyName(module.name)}.${extension}`;
}

async function validatePromptLikeContent(content: string, label: string): Promise<{ passed: boolean; errors: string[] }> {
  const validation = await validateContent(content, { isRegeneration: false });
  const errors = validation.issues
    .filter(issue => issue.severity === 'critical' || issue.severity === 'error')
    .map(issue => `${label}: ${issue.message}`);

  return {
    passed: validation.isValid && errors.length === 0,
    errors,
  };
}

function validateCodeModule(module: Pick<AgentCodeModule, 'name' | 'code' | 'language'>): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  const code = module.code?.trim() || '';

  if (!code) {
    errors.push('Module code is empty.');
  }

  if (code.length < 40) {
    errors.push('Module code is too short to be a valid implementation.');
  }

  if (module.language !== 'json' && !/\bexport\b/.test(code)) {
    errors.push('Module must export at least one symbol.');
  }

  const blockedPatterns = [
    { pattern: /\beval\s*\(/, message: 'Use of eval is not allowed.' },
    { pattern: /\bnew Function\s*\(/, message: 'Dynamic Function construction is not allowed.' },
    { pattern: /\bdocument\.write\s*\(/, message: 'document.write is not allowed.' },
    { pattern: /\blocalStorage\.clear\s*\(/, message: 'Clearing localStorage is not allowed.' },
  ];

  for (const blocked of blockedPatterns) {
    if (blocked.pattern.test(code)) {
      errors.push(blocked.message);
    }
  }

  const delimiterPairs: Array<[string, string]> = [
    ['{', '}'],
    ['(', ')'],
    ['[', ']'],
  ];

  for (const [open, close] of delimiterPairs) {
    const opens = code.split(open).length - 1;
    const closes = code.split(close).length - 1;
    if (opens !== closes) {
      errors.push(`Unbalanced ${open}${close} delimiters.`);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

async function persistModuleFile(agentId: string, module: AgentCodeModule): Promise<AgentCodeModule> {
  const filePath = getModulePath(agentId, module);
  const saved = await writeFile(filePath, module.code);
  if (!saved) {
    throw new Error(`Failed to persist module file at ${filePath}`);
  }

  return {
    ...module,
    filePath,
  };
}

async function persistAgentModules(agent: CreatedAgent): Promise<CreatedAgent> {
  const nextModules: AgentCodeModule[] = [];

  for (const module of agent.codeModules) {
    const persisted = await persistModuleFile(agent.id, module);
    nextModules.push(persisted);
  }

  return {
    ...agent,
    codeModules: nextModules,
  };
}

// Load created agents
export async function loadCreatedAgents(): Promise<CreatedAgent[]> {
  try {
    const data = await kvGet(CREATED_AGENTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// Save created agents
async function saveCreatedAgents(agents: CreatedAgent[]): Promise<void> {
  await kvSet(CREATED_AGENTS_KEY, JSON.stringify(agents));
}

// Get created agent by ID
export async function getCreatedAgent(id: string): Promise<CreatedAgent | null> {
  const agents = await loadCreatedAgents();
  return agents.find(a => a.id === id) || null;
}

// Create new agent from blueprint
export async function createAgentFromBlueprint(blueprint: AgentBlueprint): Promise<CreatedAgent> {
  const now = new Date().toISOString();
  
  const agent: CreatedAgent = {
    id: generateId(),
    name: blueprint.name,
    role: blueprint.role as AgentRole,
    capabilities: blueprint.capabilities,
    promptTemplate: blueprint.promptTemplate,
    scoringWeights: {
      creativity: blueprint.scoringWeights.creativity,
      relevance: blueprint.scoringWeights.relevance,
      engagement: blueprint.scoringWeights.engagement,
      brandAlignment: blueprint.scoringWeights.brandAlignment,
    },
    performanceScore: 0.5,
    taskHistory: [],
    evolutionState: 'active',
    version: 1,
    createdAt: now,
    updatedAt: now,
    blueprint,
    codeModules: blueprint.codeModules || [],
    selfModificationLog: [],
    godModeStats: {
      totalModifications: 0,
      successfulModifications: 0,
      lastModification: null,
    },
  };
  
  const promptValidation = await validatePromptLikeContent(agent.promptTemplate, 'Prompt template');
  if (!promptValidation.passed) {
    throw new Error(promptValidation.errors.join(' '));
  }

  if (agent.blueprint.systemInstructions?.trim()) {
    const instructionValidation = await validatePromptLikeContent(agent.blueprint.systemInstructions, 'System instructions');
    if (!instructionValidation.passed) {
      throw new Error(instructionValidation.errors.join(' '));
    }
  }

  for (const module of agent.codeModules) {
    const validation = validateCodeModule(module);
    if (!validation.passed) {
      throw new Error(`Invalid module "${module.name}": ${validation.errors.join(' ')}`);
    }
    module.validation = {
      passed: true,
      errors: [],
      validatedAt: now,
    };
  }

  const persistedAgent = await persistAgentModules(agent);

  // Save to created agents
  const agents = await loadCreatedAgents();
  agents.push(persistedAgent);
  await saveCreatedAgents(agents);
  
  // Also register with main agent system
  const mainAgents = await loadAgents();
  mainAgents.push({
    id: persistedAgent.id,
    name: persistedAgent.name,
    role: persistedAgent.role,
    capabilities: persistedAgent.capabilities,
    promptTemplate: persistedAgent.promptTemplate,
    scoringWeights: persistedAgent.scoringWeights,
    performanceScore: persistedAgent.performanceScore,
    taskHistory: persistedAgent.taskHistory,
    evolutionState: persistedAgent.evolutionState,
    version: persistedAgent.version,
    createdAt: persistedAgent.createdAt,
    updatedAt: persistedAgent.updatedAt,
  });
  await saveAgents(mainAgents);
  
  return persistedAgent;
}

// God Mode: Generate agent from natural language
export async function generateAgentWithGodMode(
  description: string,
  options: {
    useCase: string;
    complexity: 'simple' | 'moderate' | 'advanced' | 'expert';
    selfModification: boolean;
  }
): Promise<CreatedAgent> {
  const prompt = `You are an expert AI agent architect. Create a comprehensive agent configuration based on:

Description: ${description}
Use Case: ${options.useCase}
Complexity: ${options.complexity}
Self-Modification Enabled: ${options.selfModification}

Return a JSON object with this exact structure:
{
  "name": "Agent name",
  "description": "What this agent does",
  "role": "writer|hook|strategist|optimizer|critic|visual|hashtag|engagement|hybrid",
  "personality": {
    "tone": "professional/casual/friendly/authoritative",
    "style": "concise/detailed/creative/analytical",
    "traits": ["trait1", "trait2"],
    "vocabulary": ["word1", "word2"],
    "avoidPhrases": ["phrase1"],
    "exampleOutputs": ["Example output 1"]
  },
  "capabilities": ["text_generation", "hook_creation", "strategy_planning", "content_optimization", "quality_critique", "visual_description", "hashtag_research", "engagement_prediction", "multi_task"],
  "customCapabilities": ["custom1"],
  "promptTemplate": "Full system prompt for this agent...",
  "systemInstructions": "Internal instructions for behavior...",
  "codeModules": [
    {
      "name": "module_name",
      "description": "What this module does",
      "code": "// TypeScript code here\\nexport function processContent(input: string): string {\\n  return input;\\n}",
      "language": "typescript"
    }
  ],
  "scoringWeights": {
    "creativity": 0.25,
    "relevance": 0.25,
    "engagement": 0.25,
    "brandAlignment": 0.25,
    "customMetrics": {}
  },
  "triggers": [
    {
      "type": "keyword",
      "value": "trigger_word",
      "action": "activate",
      "priority": 1
    }
  ],
  "constraints": [
    {
      "type": "output_length",
      "value": 500,
      "enforced": true
    }
  ],
  "selfModificationLevel": "${options.selfModification ? 'moderate' : 'none'}"
}

Create a sophisticated, production-ready agent configuration.`;

  try {
    const response = await chat(prompt, { model: 'gpt-4o' });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid response format');
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Build blueprint from response
    const blueprint: AgentBlueprint = {
      name: parsed.name || 'Custom Agent',
      description: parsed.description || description,
      role: parsed.role || 'writer',
      personality: parsed.personality || {
        tone: 'professional',
        style: 'concise',
        traits: [],
        vocabulary: [],
        avoidPhrases: [],
        exampleOutputs: [],
      },
      capabilities: parsed.capabilities || ['text_generation'],
      customCapabilities: parsed.customCapabilities || [],
      promptTemplate: parsed.promptTemplate || `You are ${parsed.name}. ${parsed.description}`,
      systemInstructions: parsed.systemInstructions || '',
      codeModules: (parsed.codeModules || []).map((mod: Partial<AgentCodeModule>, index: number) => ({
        id: generateId(),
        name: mod.name || `module_${index}`,
        description: mod.description || '',
        code: mod.code || '',
        language: mod.language || 'typescript',
        isActive: true,
        version: 1,
        lastModified: new Date().toISOString(),
        modifiedBy: 'user',
      })),
      scoringWeights: parsed.scoringWeights || {
        creativity: 0.25,
        relevance: 0.25,
        engagement: 0.25,
        brandAlignment: 0.25,
        customMetrics: {},
      },
      triggers: (parsed.triggers || []).map((t: Partial<AgentTrigger>) => ({
        id: generateId(),
        type: t.type || 'keyword',
        value: t.value || '',
        action: t.action || 'activate',
        priority: t.priority || 1,
      })),
      constraints: (parsed.constraints || []).map((c: Partial<AgentConstraint>) => ({
        id: generateId(),
        type: c.type || 'output_length',
        value: c.value || 500,
        enforced: c.enforced ?? true,
      })),
      godModeEnabled: true,
      selfModificationLevel: parsed.selfModificationLevel || 'none',
    };
    
    return createAgentFromBlueprint(blueprint);
  } catch (error) {
    console.error('God mode agent generation error:', error);
    throw new Error('Failed to generate agent with God Mode');
  }
}

// Self-Modification: Agent proposes changes to itself
export async function proposeSelfModification(
  agentId: string,
  context: {
    recentPerformance: number[];
    failedTasks: string[];
    userFeedback: string[];
  }
): Promise<SelfModificationEntry | null> {
  const agent = await getCreatedAgent(agentId);
  if (!agent) return null;
  
  if (agent.blueprint.selfModificationLevel === 'none') {
    return null;
  }
  
  const prompt = `You are an AI agent analyzing your own performance to propose self-improvements.

Current Agent Configuration:
- Name: ${agent.name}
- Role: ${agent.role}
- Current Prompt Template: ${agent.promptTemplate.substring(0, 500)}...
- Performance Scores: ${context.recentPerformance.join(', ')}
- Failed Tasks: ${context.failedTasks.join('; ')}
- User Feedback: ${context.userFeedback.join('; ')}

Self-Modification Level: ${agent.blueprint.selfModificationLevel}

Analyze your performance and propose ONE improvement. Return JSON:
{
  "type": "prompt|code|weight|capability|behavior",
  "current": "Current value being modified",
  "proposed": "New proposed value",
  "reasoning": "Why this change will improve performance",
  "expectedImprovement": 0.1
}

${agent.blueprint.selfModificationLevel === 'limited' ? 'Only propose minor tweaks to prompts or weights.' : ''}
${agent.blueprint.selfModificationLevel === 'moderate' ? 'You can modify prompts, weights, and add capabilities.' : ''}
${agent.blueprint.selfModificationLevel === 'full' ? 'You can modify anything including code modules.' : ''}`;

  try {
    const response = await chat(prompt, { model: 'gpt-4o' });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.type === 'prompt' || parsed.type === 'behavior') {
      const validation = await validatePromptLikeContent(parsed.proposed || '', 'Self-modification proposal');
      if (!validation.passed) {
        return null;
      }
    }
    
    const modification: SelfModificationEntry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      type: parsed.type,
      before: parsed.current,
      after: parsed.proposed,
      reasoning: parsed.reasoning,
      impact: 'unknown',
      approved: false,
    };
    
    // Add to modification log
    agent.selfModificationLog.push(modification);
    agent.godModeStats.totalModifications++;
    agent.godModeStats.lastModification = modification.timestamp;
    
    await saveCreatedAgent(agent);
    
    return modification;
  } catch (error) {
    console.error('Self-modification proposal error:', error);
    return null;
  }
}

// Apply self-modification
export async function applySelfModification(
  agentId: string,
  modificationId: string
): Promise<boolean> {
  const agent = await getCreatedAgent(agentId);
  if (!agent) return false;
  
  const modification = agent.selfModificationLog.find(m => m.id === modificationId);
  if (!modification || modification.approved) return false;
  
  try {
    switch (modification.type) {
      case 'prompt':
        {
          const validation = await validatePromptLikeContent(modification.after, 'Prompt template');
          if (!validation.passed) {
            modification.impact = 'negative';
            await saveCreatedAgent(agent);
            return false;
          }
        }
        agent.promptTemplate = modification.after;
        agent.blueprint.promptTemplate = modification.after;
        break;
      case 'weight':
        const weights = JSON.parse(modification.after);
        agent.scoringWeights = { ...agent.scoringWeights, ...weights };
        agent.blueprint.scoringWeights = { ...agent.blueprint.scoringWeights, ...weights };
        break;
      case 'code':
        {
          const codeUpdate = JSON.parse(modification.after);
          const moduleIndex = agent.codeModules.findIndex(m => m.name === codeUpdate.name);
          if (moduleIndex < 0) {
            modification.impact = 'negative';
            await saveCreatedAgent(agent);
            return false;
          }

          const validation = validateCodeModule({
            name: codeUpdate.name,
            code: codeUpdate.code,
            language: agent.codeModules[moduleIndex].language,
          });

          if (!validation.passed) {
            modification.impact = 'negative';
            await saveCreatedAgent(agent);
            return false;
          }

          agent.codeModules[moduleIndex] = await persistModuleFile(agent.id, {
            ...agent.codeModules[moduleIndex],
            code: codeUpdate.code,
            version: agent.codeModules[moduleIndex].version + 1,
            lastModified: new Date().toISOString(),
            modifiedBy: 'agent',
            validation: {
              passed: true,
              errors: [],
              validatedAt: new Date().toISOString(),
            },
          });
        }
        break;
      case 'capability':
        const newCap = modification.after as AgentCapability;
        if (!agent.capabilities.includes(newCap)) {
          agent.capabilities.push(newCap);
          agent.blueprint.capabilities.push(newCap);
        }
        break;
      case 'behavior':
        {
          const validation = await validatePromptLikeContent(modification.after, 'System instructions');
          if (!validation.passed) {
            modification.impact = 'negative';
            await saveCreatedAgent(agent);
            return false;
          }
        }
        agent.blueprint.systemInstructions = modification.after;
        break;
    }
    
    // Mark as approved and applied
    modification.approved = true;
    modification.appliedAt = new Date().toISOString();
    agent.godModeStats.successfulModifications++;
    agent.version++;
    agent.updatedAt = new Date().toISOString();
    
    await saveCreatedAgent(agent);
    
    // Also update in main agent system
    await updateMainAgentSystem(agent);
    
    return true;
  } catch (error) {
    console.error('Apply self-modification error:', error);
    modification.impact = 'negative';
    await saveCreatedAgent(agent);
    return false;
  }
}

// Save created agent
async function saveCreatedAgent(agent: CreatedAgent): Promise<void> {
  const agents = await loadCreatedAgents();
  const index = agents.findIndex(a => a.id === agent.id);
  
  if (index >= 0) {
    agents[index] = agent;
  } else {
    agents.push(agent);
  }
  
  await saveCreatedAgents(agents);
}

// Update main agent system
async function updateMainAgentSystem(agent: CreatedAgent): Promise<void> {
  const mainAgents = await loadAgents();
  const index = mainAgents.findIndex(a => a.id === agent.id);
  
  if (index >= 0) {
    mainAgents[index] = {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      capabilities: agent.capabilities,
      promptTemplate: agent.promptTemplate,
      scoringWeights: agent.scoringWeights,
      performanceScore: agent.performanceScore,
      taskHistory: agent.taskHistory,
      evolutionState: agent.evolutionState,
      version: agent.version,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    };
    await saveAgents(mainAgents);
  }
}

// Agent writes its own code module
export async function agentWriteCode(
  agentId: string,
  request: {
    purpose: string;
    inputType: string;
    outputType: string;
    constraints: string[];
  }
): Promise<AgentCodeModule | null> {
  const agent = await getCreatedAgent(agentId);
  if (!agent) return null;
  
  if (agent.blueprint.selfModificationLevel !== 'full') {
    return null;
  }
  
  const prompt = `You are ${agent.name}, an AI agent writing code for yourself.

Purpose: ${request.purpose}
Input Type: ${request.inputType}
Output Type: ${request.outputType}
Constraints: ${request.constraints.join(', ')}

Write a TypeScript module that accomplishes this purpose. Return JSON:
{
  "name": "module_name",
  "description": "What this module does",
  "code": "// Full TypeScript code here\\n...",
  "testCases": [
    {"input": "test input", "expectedOutput": "expected output"}
  ]
}

The code must:
1. Be type-safe TypeScript
2. Handle errors gracefully
3. Be efficient and clean
4. Include comments
5. Export the main function`;

  try {
    const response = await chat(prompt, { model: 'gpt-4o' });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    const module: AgentCodeModule = {
      id: generateId(),
      name: parsed.name || 'custom_module',
      description: parsed.description || request.purpose,
      code: parsed.code || '',
      language: 'typescript',
      isActive: true,
      version: 1,
      lastModified: new Date().toISOString(),
      modifiedBy: 'agent',
    };

    const validation = validateCodeModule(module);
    if (!validation.passed) {
      throw new Error(`Generated module failed validation: ${validation.errors.join(' ')}`);
    }

    const persistedModule = await persistModuleFile(agent.id, {
      ...module,
      validation: {
        passed: true,
        errors: [],
        validatedAt: new Date().toISOString(),
      },
    });
    
    // Add to agent's code modules
    agent.codeModules.push(persistedModule);
    
    // Log the modification
    agent.selfModificationLog.push({
      id: generateId(),
      timestamp: new Date().toISOString(),
      type: 'code',
      before: '',
      after: JSON.stringify({ name: persistedModule.name, code: persistedModule.code }),
      reasoning: `Created new code module for: ${request.purpose}`,
      impact: 'unknown',
      approved: true,
      appliedAt: new Date().toISOString(),
    });
    
    agent.godModeStats.totalModifications++;
    agent.godModeStats.successfulModifications++;
    agent.godModeStats.lastModification = new Date().toISOString();
    
    await saveCreatedAgent(agent);
    
    return persistedModule;
  } catch (error) {
    console.error('Agent code writing error:', error);
    return null;
  }
}

// Agent edits its own code
export async function agentEditCode(
  agentId: string,
  moduleId: string,
  editRequest: {
    issue: string;
    improvement: string;
  }
): Promise<AgentCodeModule | null> {
  const agent = await getCreatedAgent(agentId);
  if (!agent) return null;
  
  const module = agent.codeModules.find(m => m.id === moduleId);
  if (!module) return null;
  
  if (agent.blueprint.selfModificationLevel !== 'full') {
    return null;
  }
  
  const prompt = `You are ${agent.name}, editing your own code module.

Current Code:
\`\`\`${module.language}
${module.code}
\`\`\`

Issue: ${editRequest.issue}
Improvement Requested: ${editRequest.improvement}

Provide the improved code. Return JSON:
{
  "code": "// Updated TypeScript code here\\n...",
  "changes": ["Description of change 1", "Description of change 2"],
  "reasoning": "Why these changes improve the code"
}`;

  try {
    const response = await chat(prompt, { model: 'gpt-4o' });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    const validation = validateCodeModule({
      name: module.name,
      code: parsed.code,
      language: module.language,
    });
    if (!validation.passed) {
      throw new Error(`Edited module failed validation: ${validation.errors.join(' ')}`);
    }

    const oldCode = module.code;
    
    // Update the module
    module.code = parsed.code;
    module.version++;
    module.lastModified = new Date().toISOString();
    module.modifiedBy = 'agent';
    module.validation = {
      passed: true,
      errors: [],
      validatedAt: new Date().toISOString(),
    };
    const persisted = await persistModuleFile(agent.id, module);
    Object.assign(module, persisted);
    
    // Log the modification
    agent.selfModificationLog.push({
      id: generateId(),
      timestamp: new Date().toISOString(),
      type: 'code',
      before: oldCode,
      after: parsed.code,
      reasoning: parsed.reasoning || editRequest.improvement,
      impact: 'unknown',
      approved: true,
      appliedAt: new Date().toISOString(),
    });
    
    agent.godModeStats.totalModifications++;
    agent.godModeStats.successfulModifications++;
    agent.godModeStats.lastModification = new Date().toISOString();
    
    await saveCreatedAgent(agent);
    
    return module;
  } catch (error) {
    console.error('Agent code editing error:', error);
    return null;
  }
}

// Delete created agent
export async function deleteCreatedAgent(id: string): Promise<boolean> {
  const agents = await loadCreatedAgents();
  const filtered = agents.filter(a => a.id !== id);
  
  if (filtered.length === agents.length) return false;
  
  await saveCreatedAgents(filtered);
  
  // Also remove from main agent system
  const mainAgents = await loadAgents();
  const filteredMain = mainAgents.filter(a => a.id !== id);
  await saveAgents(filteredMain);
  
  return true;
}

// Get agent templates for quick creation
export function getAgentTemplates(): Partial<AgentBlueprint>[] {
  return [
    {
      name: 'Content Writer Pro',
      description: 'Expert content writer for social media posts',
      role: 'writer',
      capabilities: ['text_generation', 'content_optimization'],
      selfModificationLevel: 'moderate',
    },
    {
      name: 'Viral Hook Generator',
      description: 'Specializes in attention-grabbing hooks and openers',
      role: 'hook',
      capabilities: ['hook_creation', 'engagement_prediction'],
      selfModificationLevel: 'limited',
    },
    {
      name: 'Strategy Advisor',
      description: 'Provides strategic guidance for content planning',
      role: 'strategist',
      capabilities: ['strategy_planning', 'multi_task'],
      selfModificationLevel: 'moderate',
    },
    {
      name: 'Quality Critic',
      description: 'Reviews and improves content quality',
      role: 'critic',
      capabilities: ['quality_critique', 'content_optimization'],
      selfModificationLevel: 'limited',
    },
    {
      name: 'Full Stack Agent',
      description: 'Advanced agent with full capabilities and self-modification',
      role: 'hybrid',
      capabilities: ['text_generation', 'hook_creation', 'strategy_planning', 'content_optimization', 'quality_critique', 'multi_task'],
      selfModificationLevel: 'full',
      godModeEnabled: true,
    },
  ];
}
