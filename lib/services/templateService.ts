import type { BrandKit } from '@/lib/types';
import { universalChat } from '@/lib/services/aiService';
import { saveFile, readFile } from '@/lib/services/puterService';

export interface ContentTemplate {
  id: string;
  name: string;
  category: 'product' | 'testimonial' | 'educational' | 'promotional' | 'engagement' | 'behind-the-scenes' | 'tips' | 'announcement';
  description: string;
  structure: string;
  placeholders: string[];
  platforms: string[];
  averageEngagement?: number;
  createdAt: string;
}

const DEFAULT_TEMPLATES: ContentTemplate[] = [
  {
    id: 'product-launch',
    name: 'Product Launch',
    category: 'product',
    description: 'Announce a new product with excitement and key features',
    structure: '🎉 [PRODUCT_NAME] is here!\n\n[KEY_BENEFIT]\n\n✨ Features:\n• [FEATURE_1]\n• [FEATURE_2]\n• [FEATURE_3]\n\n🔗 [CALL_TO_ACTION]\n\n#[HASHTAGS]',
    placeholders: ['PRODUCT_NAME', 'KEY_BENEFIT', 'FEATURE_1', 'FEATURE_2', 'FEATURE_3', 'CALL_TO_ACTION', 'HASHTAGS'],
    platforms: ['instagram', 'twitter', 'linkedin', 'facebook'],
    averageEngagement: 8.5,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'testimonial',
    name: 'Customer Testimonial',
    category: 'testimonial',
    description: 'Share a customer success story',
    structure: '"[QUOTE]"\n\n— [CUSTOMER_NAME], [CUSTOMER_TITLE]\n\n[CONTEXT]\n\n[CALL_TO_ACTION]\n\n#[HASHTAGS]',
    placeholders: ['QUOTE', 'CUSTOMER_NAME', 'CUSTOMER_TITLE', 'CONTEXT', 'CALL_TO_ACTION', 'HASHTAGS'],
    platforms: ['instagram', 'linkedin', 'twitter'],
    averageEngagement: 7.2,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'tip-of-day',
    name: 'Daily Tip',
    category: 'tips',
    description: 'Share actionable tips and insights',
    structure: '💡 [TIP_TITLE]\n\n[STEP_1]\n[STEP_2]\n[STEP_3]\n\n✅ Result: [BENEFIT]\n\n[CALL_TO_ACTION]\n\n#[HASHTAGS]',
    placeholders: ['TIP_TITLE', 'STEP_1', 'STEP_2', 'STEP_3', 'BENEFIT', 'CALL_TO_ACTION', 'HASHTAGS'],
    platforms: ['instagram', 'tiktok', 'twitter', 'linkedin'],
    averageEngagement: 6.8,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'behind-scenes',
    name: 'Behind the Scenes',
    category: 'behind-the-scenes',
    description: 'Show your team/process/workspace',
    structure: 'Behind the scenes at [COMPANY]...\n\n[STORY]\n\n[TEAM_MESSAGE]\n\n#[HASHTAGS]',
    placeholders: ['COMPANY', 'STORY', 'TEAM_MESSAGE', 'HASHTAGS'],
    platforms: ['instagram', 'tiktok', 'facebook'],
    averageEngagement: 9.1,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'engagement-question',
    name: 'Engagement Question',
    category: 'engagement',
    description: 'Ask a question to boost engagement',
    structure: '[STATEMENT]\n\n❓ [QUESTION]\n\nA) [OPTION_1]\nB) [OPTION_2]\nC) [OPTION_3]\n\nComment below! 👇\n\n#[HASHTAGS]',
    placeholders: ['STATEMENT', 'QUESTION', 'OPTION_1', 'OPTION_2', 'OPTION_3', 'HASHTAGS'],
    platforms: ['instagram', 'twitter', 'facebook', 'tiktok'],
    averageEngagement: 10.2,
    createdAt: new Date().toISOString(),
  },
];

export async function getTemplates(): Promise<ContentTemplate[]> {
  try {
    const saved = await readFile<ContentTemplate[]>('/NexusAI/templates/list.json', true);
    return saved || DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

export async function saveTemplate(template: ContentTemplate): Promise<void> {
  const templates = await getTemplates();
  const index = templates.findIndex(t => t.id === template.id);
  if (index >= 0) {
    templates[index] = template;
  } else {
    templates.push(template);
  }
  await saveFile('/NexusAI/templates/list.json', templates);
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const templates = await getTemplates();
  const filtered = templates.filter(t => t.id !== templateId);
  await saveFile('/NexusAI/templates/list.json', filtered);
}

export async function createTemplateFromContent(content: string, brandKit: BrandKit | null): Promise<ContentTemplate> {
  const prompt = `Analyze this social media post and create a reusable template from it.
  
Post: "${content}"

Return a JSON object with:
{
  "name": "Template name (2-4 words)",
  "category": "product|testimonial|educational|promotional|engagement|behind-the-scenes|tips|announcement",
  "description": "Brief description",
  "structure": "Template structure with [PLACEHOLDERS]",
  "placeholders": ["list", "of", "placeholders"]
}`;

  const response = await universalChat(prompt, { brandKit });
  
  try {
    const parsed = JSON.parse(response);
    return {
      id: `template_${Date.now()}`,
      ...parsed,
      platforms: ['instagram', 'twitter'],
      createdAt: new Date().toISOString(),
    };
  } catch {
    return {
      id: `template_${Date.now()}`,
      name: 'Custom Template',
      category: 'engagement',
      description: 'Auto-generated template',
      structure: content,
      placeholders: [],
      platforms: ['instagram'],
      createdAt: new Date().toISOString(),
    };
  }
}

export async function fillTemplate(template: ContentTemplate, values: Record<string, string>): Promise<string> {
  let result = template.structure;
  for (const placeholder of template.placeholders) {
    const value = values[placeholder] || '';
    result = result.replace(`[${placeholder}]`, value);
  }
  return result;
}
