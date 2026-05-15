/**
 * Prompt & Skill Library Service
 * Reusable prompts and AI skills for content generation
 */

import { readFile, writeFile, PATHS, generateId } from './puterService';
import type { BrandKit } from '@/lib/types';

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: PromptCategory;
  template: string;
  variables: PromptVariable[];
  tags: string[];
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  rating: number;
}

export interface PromptVariable {
  name: string;
  description: string;
  type: 'text' | 'select' | 'number' | 'boolean';
  options?: string[];
  defaultValue?: string;
  required: boolean;
}

export type PromptCategory = 
  | 'content_generation'
  | 'social_media'
  | 'copywriting'
  | 'engagement'
  | 'hashtags'
  | 'repurposing'
  | 'analysis'
  | 'custom';

export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  prompts: string[]; // prompt template IDs
  workflow: SkillStep[];
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SkillStep {
  id: string;
  name: string;
  type: 'prompt' | 'transform' | 'condition' | 'output';
  promptId?: string;
  config?: Record<string, unknown>;
}

// Built-in prompt templates
const BUILT_IN_PROMPTS: PromptTemplate[] = [
  {
    id: 'prompt_viral_hook',
    name: 'Viral Hook Generator',
    description: 'Create attention-grabbing hooks for social media posts',
    category: 'social_media',
    template: `Create 5 viral hooks for a {{platform}} post about "{{topic}}".

Brand Context:
- Niche: {{niche}}
- Tone: {{tone}}

Requirements:
- Each hook should be under 15 words
- Use power words and emotional triggers
- Create curiosity gaps
- Make it scroll-stopping

Format: Number each hook 1-5.`,
    variables: [
      { name: 'platform', description: 'Target platform', type: 'select', options: ['Twitter', 'Instagram', 'LinkedIn', 'TikTok'], required: true },
      { name: 'topic', description: 'What the post is about', type: 'text', required: true },
      { name: 'niche', description: 'Your brand niche', type: 'text', required: true },
      { name: 'tone', description: 'Brand tone of voice', type: 'select', options: ['professional', 'casual', 'witty', 'inspirational', 'educational'], required: true },
    ],
    tags: ['viral', 'hooks', 'engagement'],
    isBuiltIn: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    usageCount: 0,
    rating: 4.8,
  },
  {
    id: 'prompt_thread_writer',
    name: 'Thread Writer',
    description: 'Transform any topic into an engaging Twitter/X thread',
    category: 'social_media',
    template: `Write a {{length}}-tweet thread about "{{topic}}".

Brand Voice:
- Niche: {{niche}}
- Tone: {{tone}}

Structure:
1. Hook tweet (attention-grabbing opener)
2. Context tweets (set up the problem/topic)
3. Value tweets (main insights/tips)
4. Call-to-action tweet

Requirements:
- Each tweet under 280 characters
- Use line breaks for readability
- Include 1-2 relevant emojis per tweet
- End with engagement CTA

Format each tweet as:
Tweet 1/{{length}}:
[content]

---`,
    variables: [
      { name: 'topic', description: 'Thread topic', type: 'text', required: true },
      { name: 'length', description: 'Number of tweets', type: 'select', options: ['5', '7', '10', '15'], defaultValue: '7', required: true },
      { name: 'niche', description: 'Your brand niche', type: 'text', required: true },
      { name: 'tone', description: 'Brand tone', type: 'select', options: ['professional', 'casual', 'witty', 'inspirational'], required: true },
    ],
    tags: ['twitter', 'threads', 'long-form'],
    isBuiltIn: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    usageCount: 0,
    rating: 4.9,
  },
  {
    id: 'prompt_carousel',
    name: 'Carousel Script Writer',
    description: 'Create slide-by-slide content for Instagram/LinkedIn carousels',
    category: 'social_media',
    template: `Create a {{slides}}-slide carousel about "{{topic}}".

Brand Context:
- Niche: {{niche}}
- Tone: {{tone}}
- Platform: {{platform}}

For each slide provide:
- Slide title (bold, attention-grabbing)
- Main content (2-3 short sentences)
- Visual suggestion

Structure:
Slide 1: Hook/Problem
Slides 2-{{middleSlides}}: Value/Tips/Steps
Final Slide: CTA

Format:
---
SLIDE 1
Title: [title]
Content: [content]
Visual: [suggestion]
---`,
    variables: [
      { name: 'topic', description: 'Carousel topic', type: 'text', required: true },
      { name: 'slides', description: 'Number of slides', type: 'select', options: ['5', '7', '10'], defaultValue: '7', required: true },
      { name: 'platform', description: 'Target platform', type: 'select', options: ['Instagram', 'LinkedIn'], required: true },
      { name: 'niche', description: 'Your brand niche', type: 'text', required: true },
      { name: 'tone', description: 'Brand tone', type: 'text', required: true },
    ],
    tags: ['carousel', 'instagram', 'linkedin', 'visual'],
    isBuiltIn: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    usageCount: 0,
    rating: 4.7,
  },
  {
    id: 'prompt_cta_generator',
    name: 'CTA Generator',
    description: 'Create compelling calls-to-action',
    category: 'copywriting',
    template: `Generate 10 compelling CTAs for: "{{goal}}"

Context:
- Platform: {{platform}}
- Audience: {{audience}}
- Tone: {{tone}}

CTA Types to include:
- Direct action (1-2)
- Question-based (1-2)
- Urgency-driven (1-2)
- Benefit-focused (1-2)
- Social proof (1-2)

Requirements:
- Keep under 10 words each
- Be specific and actionable
- Match brand tone`,
    variables: [
      { name: 'goal', description: 'What action you want users to take', type: 'text', required: true },
      { name: 'platform', description: 'Where this will be used', type: 'text', required: true },
      { name: 'audience', description: 'Target audience', type: 'text', required: true },
      { name: 'tone', description: 'Brand tone', type: 'select', options: ['professional', 'casual', 'urgent', 'friendly'], required: true },
    ],
    tags: ['cta', 'conversion', 'copywriting'],
    isBuiltIn: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    usageCount: 0,
    rating: 4.6,
  },
  {
    id: 'prompt_hashtag_strategy',
    name: 'Hashtag Strategy',
    description: 'Generate optimized hashtag sets for maximum reach',
    category: 'hashtags',
    template: `Create a hashtag strategy for: "{{topic}}"

Platform: {{platform}}
Niche: {{niche}}

Generate 3 sets:
1. High Competition (5 hashtags) - Popular, broad reach
2. Medium Competition (10 hashtags) - Balanced reach/discoverability  
3. Low Competition (5 hashtags) - Niche, high engagement potential

Also suggest:
- 3 branded hashtag ideas
- Best posting time for these hashtags

Format each set with the hashtags on one line, comma-separated.`,
    variables: [
      { name: 'topic', description: 'Content topic', type: 'text', required: true },
      { name: 'platform', description: 'Target platform', type: 'select', options: ['Instagram', 'Twitter', 'TikTok', 'LinkedIn'], required: true },
      { name: 'niche', description: 'Your niche', type: 'text', required: true },
    ],
    tags: ['hashtags', 'reach', 'discovery'],
    isBuiltIn: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    usageCount: 0,
    rating: 4.5,
  },
  {
    id: 'prompt_repurpose',
    name: 'Content Repurposer',
    description: 'Transform content from one format to another',
    category: 'repurposing',
    template: `Repurpose this content from {{sourceFormat}} to {{targetFormat}}:

Original Content:
"""
{{content}}
"""

Brand Guidelines:
- Tone: {{tone}}
- Key message to preserve: {{keyMessage}}

Requirements:
- Maintain the core message
- Adapt to {{targetFormat}} best practices
- Optimize for {{targetPlatform}}
- Keep brand voice consistent`,
    variables: [
      { name: 'content', description: 'Original content to repurpose', type: 'text', required: true },
      { name: 'sourceFormat', description: 'Original format', type: 'select', options: ['blog post', 'tweet', 'video script', 'podcast notes', 'newsletter'], required: true },
      { name: 'targetFormat', description: 'Target format', type: 'select', options: ['tweet thread', 'Instagram caption', 'LinkedIn post', 'carousel script', 'short video script'], required: true },
      { name: 'targetPlatform', description: 'Target platform', type: 'text', required: true },
      { name: 'tone', description: 'Brand tone', type: 'text', required: true },
      { name: 'keyMessage', description: 'Core message to keep', type: 'text', required: true },
    ],
    tags: ['repurpose', 'transform', 'multi-platform'],
    isBuiltIn: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    usageCount: 0,
    rating: 4.8,
  },
  {
    id: 'prompt_engagement_reply',
    name: 'Engagement Reply Generator',
    description: 'Create thoughtful replies to comments and messages',
    category: 'engagement',
    template: `Generate a reply to this comment/message:

Comment: "{{comment}}"
Context: {{context}}
Sentiment: {{sentiment}}

Brand Voice:
- Tone: {{tone}}
- Personality: {{personality}}

Requirements:
- Be {{responseStyle}}
- Address their point directly
- Add value when possible
- Stay on-brand
- Keep it concise (under 100 words)

Generate 3 reply options from most to least formal.`,
    variables: [
      { name: 'comment', description: 'The comment to reply to', type: 'text', required: true },
      { name: 'context', description: 'What post this is on', type: 'text', required: true },
      { name: 'sentiment', description: 'Comment sentiment', type: 'select', options: ['positive', 'neutral', 'negative', 'question'], required: true },
      { name: 'tone', description: 'Brand tone', type: 'text', required: true },
      { name: 'personality', description: 'Brand personality traits', type: 'text', required: false },
      { name: 'responseStyle', description: 'How to respond', type: 'select', options: ['helpful', 'witty', 'appreciative', 'professional'], required: true },
    ],
    tags: ['engagement', 'replies', 'community'],
    isBuiltIn: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    usageCount: 0,
    rating: 4.4,
  },
];

// Built-in skills
const BUILT_IN_SKILLS: Skill[] = [
  {
    id: 'skill_viral_content',
    name: 'Viral Content Creator',
    description: 'Generate viral-ready content with hooks, body, and CTAs',
    icon: '🚀',
    prompts: ['prompt_viral_hook', 'prompt_cta_generator'],
    workflow: [
      { id: 'step1', name: 'Generate Hooks', type: 'prompt', promptId: 'prompt_viral_hook' },
      { id: 'step2', name: 'Select Best Hook', type: 'transform', config: { action: 'select_best' } },
      { id: 'step3', name: 'Generate CTA', type: 'prompt', promptId: 'prompt_cta_generator' },
      { id: 'step4', name: 'Combine Output', type: 'output' },
    ],
    isBuiltIn: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'skill_content_multiplier',
    name: 'Content Multiplier',
    description: 'Turn one piece of content into multiple platform-specific versions',
    icon: '✨',
    prompts: ['prompt_repurpose', 'prompt_hashtag_strategy'],
    workflow: [
      { id: 'step1', name: 'Repurpose for Twitter', type: 'prompt', promptId: 'prompt_repurpose', config: { targetFormat: 'tweet thread' } },
      { id: 'step2', name: 'Repurpose for Instagram', type: 'prompt', promptId: 'prompt_repurpose', config: { targetFormat: 'carousel script' } },
      { id: 'step3', name: 'Generate Hashtags', type: 'prompt', promptId: 'prompt_hashtag_strategy' },
      { id: 'step4', name: 'Package Output', type: 'output' },
    ],
    isBuiltIn: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

const PROMPTS_PATH = `${PATHS.templates}/prompts.json`;
const SKILLS_PATH = `${PATHS.skills}/skills.json`;

// Load all prompts (built-in + custom)
export async function loadPromptLibrary(): Promise<PromptTemplate[]> {
  try {
    const customPrompts = await readFile<PromptTemplate[]>(PROMPTS_PATH) || [];
    return [...BUILT_IN_PROMPTS, ...customPrompts.filter(p => !p.isBuiltIn)];
  } catch {
    return [...BUILT_IN_PROMPTS];
  }
}

// Load prompts by category
export async function loadPromptsByCategory(category: PromptCategory): Promise<PromptTemplate[]> {
  const all = await loadPromptLibrary();
  return all.filter(p => p.category === category);
}

// Get a single prompt
export async function getPrompt(id: string): Promise<PromptTemplate | null> {
  const all = await loadPromptLibrary();
  return all.find(p => p.id === id) || null;
}

// Create a custom prompt
export async function createPrompt(prompt: Omit<PromptTemplate, 'id' | 'isBuiltIn' | 'createdAt' | 'updatedAt' | 'usageCount' | 'rating'>): Promise<PromptTemplate> {
  const newPrompt: PromptTemplate = {
    ...prompt,
    id: `prompt_${generateId()}`,
    isBuiltIn: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 0,
    rating: 0,
  };

  const customPrompts = await readFile<PromptTemplate[]>(PROMPTS_PATH) || [];
  customPrompts.push(newPrompt);
  await writeFile(PROMPTS_PATH, customPrompts);

  return newPrompt;
}

// Update a prompt
export async function updatePrompt(id: string, updates: Partial<PromptTemplate>): Promise<PromptTemplate | null> {
  const customPrompts = await readFile<PromptTemplate[]>(PROMPTS_PATH) || [];
  const index = customPrompts.findIndex(p => p.id === id);
  
  if (index === -1) return null;

  customPrompts[index] = {
    ...customPrompts[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await writeFile(PROMPTS_PATH, customPrompts);
  return customPrompts[index];
}

// Delete a prompt
export async function deletePrompt(id: string): Promise<boolean> {
  const customPrompts = await readFile<PromptTemplate[]>(PROMPTS_PATH) || [];
  const filtered = customPrompts.filter(p => p.id !== id);
  
  if (filtered.length === customPrompts.length) return false;

  await writeFile(PROMPTS_PATH, filtered);
  return true;
}

// Fill prompt template with variables
export function fillPromptTemplate(
  template: string,
  variables: Record<string, string>,
  brandKit?: BrandKit | null
): string {
  let filled = template;

  // Fill brand kit variables if available
  if (brandKit) {
    filled = filled.replace(/\{\{niche\}\}/g, brandKit.niche || '');
    filled = filled.replace(/\{\{tone\}\}/g, brandKit.tone || '');
    filled = filled.replace(/\{\{brandName\}\}/g, brandKit.brandName || '');
  }

  // Fill provided variables
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    filled = filled.replace(regex, value);
  }

  // Clean up any remaining unfilled template variables
  filled = filled.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '');

  // Calculate middle slides for carousel template
  if (filled.includes('{{middleSlides}}')) {
    const slides = parseInt(variables.slides || '7', 10);
    filled = filled.replace(/\{\{middleSlides\}\}/g, String(slides - 1));
  }

  return filled;
}

// Increment usage count
export async function incrementPromptUsage(id: string): Promise<void> {
  const builtIn = BUILT_IN_PROMPTS.find(p => p.id === id);
  if (builtIn) {
    // Can't update built-in, but we could track separately
    return;
  }

  const customPrompts = await readFile<PromptTemplate[]>(PROMPTS_PATH) || [];
  const index = customPrompts.findIndex(p => p.id === id);
  
  if (index !== -1) {
    customPrompts[index].usageCount++;
    await writeFile(PROMPTS_PATH, customPrompts);
  }
}

// Load all skills
export async function loadSkillLibrary(): Promise<Skill[]> {
  try {
    const customSkills = await readFile<Skill[]>(SKILLS_PATH) || [];
    return [...BUILT_IN_SKILLS, ...customSkills.filter(s => !s.isBuiltIn)];
  } catch {
    return [...BUILT_IN_SKILLS];
  }
}

// Get a single skill
export async function getSkill(id: string): Promise<Skill | null> {
  const all = await loadSkillLibrary();
  return all.find(s => s.id === id) || null;
}

// Search prompts
export async function searchPrompts(query: string): Promise<PromptTemplate[]> {
  const all = await loadPromptLibrary();
  const lowerQuery = query.toLowerCase();
  
  return all.filter(p => 
    p.name.toLowerCase().includes(lowerQuery) ||
    p.description.toLowerCase().includes(lowerQuery) ||
    p.tags.some(t => t.toLowerCase().includes(lowerQuery))
  );
}

// Get popular prompts
export async function getPopularPrompts(limit = 5): Promise<PromptTemplate[]> {
  const all = await loadPromptLibrary();
  return all
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, limit);
}
