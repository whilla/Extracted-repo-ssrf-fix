// God Mode AI Engine - Advanced multi-perspective thinking system
import type { AIMessage, BrandKit } from '@/lib/types';
import { kvGet } from './puterService';
import { universalChat } from './aiService';
import { hasConfiguredSecret, sanitizeApiKey } from './providerCredentialUtils';
import { GROQ_URL, NVIDIA_URL, TOGETHER_URL, FIREWORKS_URL, OLLAMA_URL, OPENROUTER_URL } from '@/lib/constants/api';

// ============================================
// CUSTOM AI PROVIDERS
// ============================================

export interface AIProvider {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  requiresKey: boolean;
  keyName: string;
  headers?: (apiKey: string) => Record<string, string>;
  formatRequest?: (messages: AIMessage[], model: string) => unknown;
  parseResponse?: (response: unknown) => string;
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: 'puter',
    name: 'Puter (Native)',
    baseUrl: '',
    models: ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-5', 'claude-opus-4'],
    requiresKey: false,
    keyName: '',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: `${OPENROUTER_URL}/api/v1/chat/completions`,
    models: [
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4-turbo',
      'google/gemini-pro-1.5',
      'meta-llama/llama-3.1-405b-instruct',
      'mistralai/mistral-large',
      'deepseek/deepseek-r1',
      'qwen/qwen-2.5-72b-instruct',
    ],
    requiresKey: true,
    keyName: 'openrouter_key',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
      'X-Title': 'NexusAI',
    }),
  },
  {
    id: 'groq',
    name: 'Groq (Ultra Fast)',
    baseUrl: `${GROQ_URL}/openai/v1/chat/completions`,
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-70b-versatile',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
    ],
    requiresKey: true,
    keyName: 'groq_key',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    baseUrl: `${NVIDIA_URL}/v1/chat/completions`,
    models: [
      'nvidia/llama-3.1-nemotron-70b-instruct',
      'nvidia/nemotron-4-340b-instruct',
      'meta/llama-3.1-405b-instruct',
    ],
    requiresKey: true,
    keyName: 'nvidia_key',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    baseUrl: `${OLLAMA_URL}/api/chat`,
    models: [
      'llama3.2:latest',
      'mistral:latest',
      'codellama:latest',
      'deepseek-r1:latest',
      'qwen2.5:latest',
    ],
    requiresKey: false,
    keyName: '',
    headers: () => ({ 'Content-Type': 'application/json' }),
    formatRequest: (messages, model) => ({
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
      stream: false,
    }),
    parseResponse: (response: unknown) => {
      const r = response as { message?: { content?: string } };
      return r.message?.content || '';
    },
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: `${TOGETHER_URL}/v1/chat/completions`,
    models: [
      'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      'Qwen/Qwen2.5-72B-Instruct-Turbo',
      'mistralai/Mixtral-8x22B-Instruct-v0.1',
      'deepseek-ai/DeepSeek-R1-Distill-Llama-70B',
    ],
    requiresKey: true,
    keyName: 'together_key',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    baseUrl: `${FIREWORKS_URL}/inference/v1/chat/completions`,
    models: [
      'accounts/fireworks/models/llama-v3p3-70b-instruct',
      'accounts/fireworks/models/mixtral-8x22b-instruct',
      'accounts/fireworks/models/qwen2p5-72b-instruct',
    ],
    requiresKey: true,
    keyName: 'fireworks_key',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-exp'],
    requiresKey: true,
    keyName: 'gemini_key',
  },
];

// Get provider by ID
export function getProvider(providerId: string): AIProvider | undefined {
  return AI_PROVIDERS.find(p => p.id === providerId);
}

// Call custom provider
export async function callCustomProvider(
  providerId: string,
  model: string,
  messages: AIMessage[]
): Promise<string> {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);

  // Puter native - use window.puter
  if (providerId === 'puter') {
    return universalChat(messages, { model });
  }

  // Gemini has a special API format
  if (providerId === 'gemini') {
    const apiKey = sanitizeApiKey(await kvGet(provider.keyName));
    if (!apiKey) throw new Error(`${provider.name} API key not configured. Add it in Settings or configure the ${provider.keyName} environment variable.`);

    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
      }));

    // Add system prompt to first message
    const systemMsg = messages.find(m => m.role === 'system');
    if (systemMsg && contents.length > 0) {
      const systemContent = typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content);
      contents[0].parts[0].text = systemContent + '\n\n' + contents[0].parts[0].text;
    }

    const response = await fetch(`${provider.baseUrl}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({ contents }),
    });

    if (!response.ok) throw new Error(`Gemini error: ${await response.text()}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // Get API key if required
  let apiKey = '';
  if (provider.requiresKey) {
    apiKey = sanitizeApiKey(await kvGet(provider.keyName));
    if (!apiKey) throw new Error(`${provider.name} API key not configured. Add it in Settings or configure the ${provider.keyName} environment variable.`);
  }

  // Build request
  const headers = provider.headers ? provider.headers(apiKey) : { 'Content-Type': 'application/json' };
  
  const body = provider.formatRequest
    ? provider.formatRequest(messages, model)
    : {
        model,
        messages: messages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })),
      };

  const response = await fetch(provider.baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${provider.name} error: ${error}`);
  }

  const data = await response.json();
  
  if (provider.parseResponse) {
    return provider.parseResponse(data);
  }
  
  return data.choices?.[0]?.message?.content || '';
}

// ============================================
// GOD MODE THINKING SYSTEM
// ============================================

export interface ThoughtProcess {
  perspective: string;
  thought: string;
  confidence: number;
  innovations: string[];
}

export interface GodModeResult {
  thoughts: ThoughtProcess[];
  synthesis: string;
  finalIdea: string;
  contentSuggestions: string[];
  visualConcepts: string[];
  audioConcepts: string[];
  estimatedViralScore: number;
}

// God Mode system prompts for different perspectives
const GOD_MODE_PERSPECTIVES = [
  {
    id: 'viral_architect',
    name: 'Viral Architect',
    prompt: `You are the VIRAL ARCHITECT - master of algorithmic psychology.
Analyze this idea through the lens of:
- Hook mechanics (first 3 seconds)
- Pattern interrupts that stop the scroll
- Emotional triggers (FOMO, curiosity, controversy, relatability)
- Shareability factors (makes viewer look smart/funny/informed)
- Trend alignment and trend-jacking opportunities
- Platform-specific viral patterns`,
  },
  {
    id: 'story_weaver',
    name: 'Story Weaver',
    prompt: `You are the STORY WEAVER - master of narrative psychology.
Analyze this idea through the lens of:
- Hero's journey micro-arcs (even in 60 seconds)
- Tension and release cycles
- Character relatability and transformation
- Universal themes that transcend culture
- Cliffhangers and open loops
- Emotional peaks and valleys`,
  },
  {
    id: 'visual_prophet',
    name: 'Visual Prophet',
    prompt: `You are the VISUAL PROPHET - master of aesthetic impact.
Analyze this idea through the lens of:
- Thumb-stopping first frame composition
- Color psychology and mood
- Movement and kinetic energy
- Contrast and visual hierarchy
- Cinematic techniques for vertical video
- Iconic imagery that becomes memorable`,
  },
  {
    id: 'growth_hacker',
    name: 'Growth Hacker',
    prompt: `You are the GROWTH HACKER - master of engagement mechanics.
Analyze this idea through the lens of:
- Comment bait strategies (questions, debates, challenges)
- Share triggers (tag a friend who...)
- Save-worthy value (reference material)
- Follow hooks (series, personality attachment)
- Call-to-action optimization
- Algorithm gaming (watch time, replay value)`,
  },
  {
    id: 'zeitgeist_reader',
    name: 'Zeitgeist Reader',
    prompt: `You are the ZEITGEIST READER - master of cultural currents.
Analyze this idea through the lens of:
- Current cultural conversations and tensions
- Emerging memes and formats to ride
- Counter-culture opportunities (zigging when others zag)
- Seasonal and event-based relevance
- Cross-platform trend migration
- Subculture movements going mainstream`,
  },
];

// Run God Mode analysis with multi-model parallel thinking
export async function runGodModeAnalysis(
  idea: string,
  brandKit: BrandKit | null,
  options: {
    useMultipleModels?: boolean;
    providersToUse?: string[];
    modelsToUse?: { provider: string; model: string }[];
  } = {}
): Promise<GodModeResult> {
  const { useMultipleModels = true, modelsToUse = [] } = options;

  // Determine which models to use
  const defaultModels = [
    { provider: 'router', model: 'gpt-4o' },
    { provider: 'router', model: 'gpt-4o-mini' },
  ];
  
  const models = modelsToUse.length > 0 ? modelsToUse : defaultModels;
  const thoughts: ThoughtProcess[] = [];

  // Run each perspective through different models in parallel
  const perspectivePromises = GOD_MODE_PERSPECTIVES.map(async (perspective, index) => {
    const modelConfig = useMultipleModels 
      ? models[index % models.length] 
      : models[0];

    const prompt = `${perspective.prompt}

BRAND CONTEXT:
${brandKit ? `
- Niche: ${brandKit.niche}
- Audience: ${brandKit.targetAudience}
- Tone: ${brandKit.tone}
- Content Pillars: ${brandKit.contentPillars?.join(', ') || 'General content'}
- USP: ${brandKit.uniqueSellingPoint || 'Not specified'}
` : 'No brand context available'}

IDEA TO ANALYZE:
"${idea}"

Provide your analysis as the ${perspective.name}. Include:
1. Your unique perspective analysis (2-3 paragraphs)
2. 3 innovative spins on this idea
3. Confidence score (0-100) on this idea's potential
4. One killer execution tip

Format as JSON:
{
  "analysis": "...",
  "innovations": ["...", "...", "..."],
  "confidence": 85,
  "killerTip": "..."
}`;

    try {
      const messages: AIMessage[] = [
        { role: 'system', content: 'You are an elite content strategist. Always respond with valid JSON.' },
        { role: 'user', content: prompt },
      ];

      const response = modelConfig.provider === 'router'
        ? await universalChat(messages, { model: modelConfig.model, brandKit, avoidPuter: true })
        : await callCustomProvider(modelConfig.provider, modelConfig.model, messages);
      
      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          perspective: perspective.name,
          thought: parsed.analysis + '\n\nKiller Tip: ' + parsed.killerTip,
          confidence: parsed.confidence || 75,
          innovations: parsed.innovations || [],
        };
      }
    } catch (error) {
      console.warn(`Perspective ${perspective.name} failed:`, error);
    }

    return {
      perspective: perspective.name,
      thought: 'Analysis unavailable',
      confidence: 0,
      innovations: [],
    };
  });

  // Wait for all perspectives
  const perspectiveResults = await Promise.all(perspectivePromises);
  thoughts.push(...perspectiveResults.filter(t => t.confidence > 0));

  // Synthesize all thoughts into final output
  const synthesisPrompt = `You are the NEXUS ORACLE - the synthesis of all creative minds.

You have received analyses from multiple expert perspectives on this content idea:
"${idea}"

EXPERT ANALYSES:
${thoughts.map(t => `
### ${t.perspective} (Confidence: ${t.confidence}%)
${t.thought}
Innovations: ${t.innovations.join('; ')}
`).join('\n')}

BRAND CONTEXT:
${brandKit ? `Niche: ${brandKit.niche}, Tone: ${brandKit.tone}` : 'General audience'}

Now SYNTHESIZE these perspectives into:

1. A unified synthesis (what's the common thread?)
2. THE final killer idea (one sentence, punchy)
3. 3 specific content suggestions ready to create
4. 3 visual concepts for images/video
5. 3 audio/music concepts (mood, tempo, style)
6. Viral score prediction (0-100)

Format as JSON:
{
  "synthesis": "...",
  "finalIdea": "...",
  "contentSuggestions": ["...", "...", "..."],
  "visualConcepts": ["...", "...", "..."],
  "audioConcepts": ["...", "...", "..."],
  "viralScore": 85
}`;

  try {
    const synthesisResponse = await universalChat([
      { role: 'system', content: 'You are the ultimate creative synthesizer. Respond with valid JSON only.' },
      { role: 'user', content: synthesisPrompt },
    ], { model: 'gpt-4o', brandKit, avoidPuter: true });

    const jsonMatch = synthesisResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        thoughts,
        synthesis: parsed.synthesis || '',
        finalIdea: parsed.finalIdea || '',
        contentSuggestions: parsed.contentSuggestions || [],
        visualConcepts: parsed.visualConcepts || [],
        audioConcepts: parsed.audioConcepts || [],
        estimatedViralScore: parsed.viralScore || 70,
      };
    }
  } catch (error) {
    console.error('Synthesis failed:', error);
  }

  // Return partial results if synthesis fails
  return {
    thoughts,
    synthesis: 'Unable to synthesize - review individual perspectives above.',
    finalIdea: idea,
    contentSuggestions: thoughts.flatMap(t => t.innovations).slice(0, 3),
    visualConcepts: [],
    audioConcepts: [],
    estimatedViralScore: Math.round(thoughts.reduce((sum, t) => sum + t.confidence, 0) / thoughts.length),
  };
}

// Quick ideation with single model
export async function quickIdeate(
  topic: string,
  brandKit: BrandKit | null,
  count = 5
): Promise<string[]> {
  const prompt = `Generate ${count} unique, creative content ideas for this topic.
Topic: "${topic}"
${brandKit ? `Brand: ${brandKit.niche}, Tone: ${brandKit.tone}` : ''}

Each idea should be:
- Scroll-stopping
- Shareable
- Aligned with current trends
- Specific and actionable

Return ONLY a numbered list of ideas. No explanations.`;

  let response = '';
  try {
    response = await universalChat([
      { role: 'user', content: prompt },
    ], { model: 'gpt-4o', brandKit, avoidPuter: true });
  } catch (error) {
    console.warn('Quick ideation router failed, using deterministic ideas:', error);
    return Array.from({ length: count }, (_, index) => `${topic} angle ${index + 1}: turn the core idea into a specific, audience-first post with a strong hook and one clear takeaway.`);
  }

  const ideas: string[] = [];
  const lines = response.split('\n');
  for (const line of lines) {
    const match = line.match(/^\d+[\.\)]\s*(.+)/);
    if (match) {
      ideas.push(match[1].trim());
    }
  }

  return ideas.slice(0, count);
}

// Get available provider configurations
export async function getAvailableProviders(): Promise<{ provider: AIProvider; hasKey: boolean; models: string[] }[]> {
  const result: { provider: AIProvider; hasKey: boolean; models: string[] }[] = [];

  for (const provider of AI_PROVIDERS) {
    if (provider.requiresKey) {
      const key = sanitizeApiKey(await kvGet(provider.keyName));
      result.push({
        provider,
        hasKey: hasConfiguredSecret(key),
        models: provider.models,
      });
    } else {
      result.push({
        provider,
        hasKey: true,
        models: provider.models,
      });
    }
  }

  return result;
}
