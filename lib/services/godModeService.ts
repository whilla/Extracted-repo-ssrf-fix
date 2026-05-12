// God Mode AI Service - Multi-perspective thinking for viral content
import type { BrandKit, GodModeResult, ThoughtProcess, MusicMood } from '@/lib/types';
import { chat, universalChat } from './aiService';
import { kvGet } from './puterService';
import { GROQ_URL, NVIDIA_URL, TOGETHER_URL, FIREWORKS_URL, OLLAMA_URL } from '@/lib/constants/api';

// God Mode Perspectives - Brutally honest expert viewpoints
const GOD_MODE_PERSPECTIVES = [
  {
    name: 'Viral Strategist',
    prompt: `You are a viral content strategist with 100+ posts hitting 1M+ views. You've seen thousands of "great ideas" die.
Be BRUTALLY HONEST. Most ideas are trash - tell them if this is one.
Analyze: hooks, pattern interrupts, curiosity gaps, emotional triggers, shareability.
If the hook doesn't stop a thumb in 0.5 seconds, it's dead. Say so.`
  },
  {
    name: 'Psychology Expert',
    prompt: `You are a consumer psychology expert who knows why people ACTUALLY engage (not why creators THINK they do).
Call out naive assumptions. Most creators don't understand their audience - they project their own interests.
Analyze: cognitive biases, emotional triggers, social proof, FOMO, identity alignment.
If there's no psychological hook, say "This appeals to nobody. Here's why."`
  },
  {
    name: 'Creative Director',
    prompt: `You are a Creative Director who's rejected 10,000 mediocre concepts. You have zero patience for "good enough."
If the visual concept is generic, say it: "I've seen this a million times. It's forgettable."
Analyze: visual storytelling, brand distinctiveness, aesthetic innovation, cultural relevance.
Push for BOLD. Safe is invisible.`
  },
  {
    name: 'Data Scientist',
    prompt: `You are a data scientist who's analyzed millions of posts. You know what the numbers actually say, not what people wish they said.
Kill vanity metrics. Likes mean nothing without conversions.
Analyze: algorithm signals, engagement depth, share patterns, timing optimization.
If the data says this format underperforms, say it clearly.`
  },
  {
    name: 'Trend Forecaster',
    prompt: `You are a trend forecaster who spots waves BEFORE they peak. You've watched creators miss trends by days and become irrelevant.
If they're late to a trend, tell them: "This trend peaked 2 weeks ago. You're too late."
Analyze: emerging movements, cultural moments, meme potential, zeitgeist.
Timing is everything. Being early > being good.`
  },
  {
    name: 'Copywriting Legend',
    prompt: `You are a legendary copywriter. You've seen every cliche, every weak CTA, every "DM me for more" garbage.
If the copy is weak, say it: "This reads like a template. Nobody remembers templates."
Analyze: power words, rhythm, brevity, memorability.
Every word must earn its place. Cut the fat.`
  }
];

// Run God Mode thinking - consult multiple AI perspectives
export async function runGodMode(
  topic: string,
  brandKit: BrandKit | null,
  options: {
    depth?: 'quick' | 'deep' | 'exhaustive';
    focusAreas?: string[];
  } = {}
): Promise<GodModeResult> {
  const { depth = 'deep', focusAreas = [] } = options;
  
  const perspectives = depth === 'quick' 
    ? GOD_MODE_PERSPECTIVES.slice(0, 3)
    : depth === 'exhaustive'
    ? GOD_MODE_PERSPECTIVES
    : GOD_MODE_PERSPECTIVES.slice(0, 4);

  const thoughts: ThoughtProcess[] = [];
  
  // Get thoughts from each perspective (can be parallelized)
  const thoughtPromises = perspectives.map(async (perspective) => {
    const prompt = `${perspective.prompt}

Brand Context: ${brandKit ? `
- Brand: ${brandKit.brandName}
- Niche: ${brandKit.niche}
- Audience: ${brandKit.targetAudience}
- Tone: ${brandKit.tone}
- Content Pillars: ${brandKit.contentPillars.join(', ')}
` : 'No brand context provided'}

Topic/Idea: "${topic}"
${focusAreas.length > 0 ? `Focus Areas: ${focusAreas.join(', ')}` : ''}

As ${perspective.name}, provide your expert analysis:
1. Your unique perspective on this topic (2-3 sentences)
2. 3 innovative ideas that only you would think of
3. Confidence score (0-100) for viral potential
4. One contrarian insight others might miss

Format your response as JSON:
{
  "thought": "your analysis",
  "innovations": ["idea1", "idea2", "idea3"],
  "confidence": 85,
  "contrarian": "your unique insight"
}`;

    try {
      const response = await chat(prompt, { brandKit });
      const parsed = JSON.parse(response.replace(/```json\n?|\n?```/g, ''));
      
      return {
        perspective: perspective.name,
        thought: parsed.thought,
        confidence: parsed.confidence,
        innovations: parsed.innovations
      };
    } catch (error) {
      console.warn(`God Mode perspective ${perspective.name} failed:`, error);
      return {
        perspective: perspective.name,
        thought: 'Unable to analyze from this perspective',
        confidence: 50,
        innovations: []
      };
    }
  });

  const results = await Promise.all(thoughtPromises);
  thoughts.push(...results);

  // Synthesize all perspectives into a final result
  const synthesisPrompt = `You are the Nexus Oracle - the final judge. You synthesize expert opinions and deliver the VERDICT.

Expert analyses on: "${topic}"

${thoughts.map(t => `
## ${t.perspective} (Confidence: ${t.confidence}%)
${t.thought}
Innovations: ${t.innovations.join(', ')}
`).join('\n')}

DELIVER YOUR VERDICT:
1. Is this idea worth pursuing or should they kill it? Be direct.
2. If worth pursuing: the ONE killer execution (not 5 mediocre options)
3. If the experts disagreed, who's right and why
4. Viral score (0-100) - be harsh, most content is 30-50 at best
5. The uncomfortable truth they need to hear

Format as JSON:
{
  "synthesis": "Your direct verdict - is this good or not?",
  "finalIdea": "THE killer idea, or 'Kill this concept' if it's weak",
  "contentSuggestions": ["Only strong suggestions, not filler"],
  "visualConcepts": ["Specific, bold visual directions"],
  "audioConcepts": ["Music that matches the energy"],
  "viralScore": 45,
  "reasoning": "Honest assessment - most ideas are NOT viral-worthy"
}`;

  try {
    const synthesisResponse = await chat(synthesisPrompt, { brandKit });
    const synthesis = JSON.parse(synthesisResponse.replace(/```json\n?|\n?```/g, ''));

    return {
      thoughts,
      synthesis: synthesis.synthesis,
      finalIdea: synthesis.finalIdea,
      contentSuggestions: synthesis.contentSuggestions,
      visualConcepts: synthesis.visualConcepts,
      audioConcepts: synthesis.audioConcepts,
      estimatedViralScore: synthesis.viralScore
    };
  } catch (error) {
    console.error('God Mode synthesis failed:', error);
    
    // Return partial results
    return {
      thoughts,
      synthesis: 'Synthesis failed - review individual perspectives',
      finalIdea: thoughts[0]?.innovations[0] || topic,
      contentSuggestions: thoughts.flatMap(t => t.innovations).slice(0, 5),
      visualConcepts: ['Modern minimalist', 'Bold typography', 'Dynamic motion'],
      audioConcepts: ['Upbeat electronic', 'Ambient chill', 'Cinematic epic'],
      estimatedViralScore: Math.round(thoughts.reduce((sum, t) => sum + t.confidence, 0) / thoughts.length)
    };
  }
}

// Analyze content and suggest music mood
export async function analyzeMusicMood(
  content: string,
  contentType: 'post' | 'reel' | 'story' | 'video',
  brandKit: BrandKit | null
): Promise<MusicMood> {
  const prompt = `Analyze this social media content and suggest the perfect background music mood.

Content: "${content}"
Content Type: ${contentType}
Brand Tone: ${brandKit?.tone || 'not specified'}

Provide a detailed music recommendation as JSON:
{
  "primary": "one of: happy, sad, energetic, calm, dramatic, mysterious, inspiring, nostalgic",
  "secondary": "secondary mood descriptor",
  "tempo": "slow, medium, or fast",
  "energy": 0-100,
  "genre": "specific genre like 'lo-fi hip hop', 'cinematic orchestral', 'indie pop'",
  "instruments": ["list", "of", "ideal", "instruments"],
  "keywords": ["search", "terms", "for", "music", "library"]
}`;

  try {
    const response = await chat(prompt, { brandKit });
    const mood = JSON.parse(response.replace(/```json\n?|\n?```/g, ''));
    return mood;
  } catch (error) {
    console.error('Music mood analysis failed:', error);
    return {
      primary: 'energetic',
      secondary: 'uplifting',
      tempo: 'medium',
      energy: 70,
      genre: 'modern pop',
      instruments: ['synth', 'drums', 'bass'],
      keywords: ['upbeat', 'social media', 'background']
    };
  }
}

// Call any model from any provider
export async function callAnyModel(
  prompt: string,
  provider: string,
  model: string,
  options: { brandKit?: BrandKit | null } = {}
): Promise<string> {
  const { brandKit = null } = options;
  
  // Get API key for the provider
  const keyName = `${provider}_key`;
  const apiKey = await kvGet(keyName);
  
  switch (provider) {
    case 'puter':
      return chat(prompt, { model, brandKit });
    
    case 'gemini':
      return chatWithGemini(prompt, apiKey);
    
    case 'openrouter':
      return chatWithOpenRouter(prompt, model, apiKey);
    
    case 'groq':
      return chatWithGroq(prompt, model, apiKey);
    
    case 'nvidia':
      return chatWithNvidia(prompt, model, apiKey);
    
    case 'ollama':
      return chatWithOllama(prompt, model);
    
    case 'together':
      return chatWithTogether(prompt, model, apiKey);
    
    case 'fireworks':
      return chatWithFireworks(prompt, model, apiKey);
    
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// Provider-specific implementations
async function chatWithGemini(prompt: string, apiKey: string | null): Promise<string> {
  if (!apiKey) throw new Error('Gemini API key not configured');
  
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    }
  );
  
  if (!response.ok) throw new Error(`Gemini API error: ${response.statusText}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function chatWithOpenRouter(prompt: string, model: string, apiKey: string | null): Promise<string> {
  if (!apiKey) throw new Error('OpenRouter API key not configured');
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://nexusai.app'
    },
    body: JSON.stringify({
      model: model || 'openai/gpt-4o',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  if (!response.ok) throw new Error(`OpenRouter API error: ${response.statusText}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function chatWithGroq(prompt: string, model: string, apiKey: string | null): Promise<string> {
  if (!apiKey) throw new Error('Groq API key not configured');
  
  const response = await fetch(`${GROQ_URL}/openai/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'llama-3.1-70b-versatile',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  if (!response.ok) throw new Error(`Groq API error: ${response.statusText}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function chatWithNvidia(prompt: string, model: string, apiKey: string | null): Promise<string> {
  if (!apiKey) throw new Error('NVIDIA API key not configured');
  
  const response = await fetch(`${NVIDIA_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'meta/llama-3.1-405b-instruct',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  if (!response.ok) throw new Error(`NVIDIA API error: ${response.statusText}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function chatWithOllama(prompt: string, model: string): Promise<string> {
  // Ollama runs locally - get base URL from settings
  const baseUrl = await kvGet('ollama_url') || OLLAMA_URL;
  
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'llama3',
      prompt,
      stream: false
    })
  });
  
  if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
  const data = await response.json();
  return data.response || '';
}

async function chatWithTogether(prompt: string, model: string, apiKey: string | null): Promise<string> {
  if (!apiKey) throw new Error('Together API key not configured');
  
  const response = await fetch(`${TOGETHER_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'meta-llama/Llama-3-70b-chat-hf',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  if (!response.ok) throw new Error(`Together API error: ${response.statusText}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function chatWithFireworks(prompt: string, model: string, apiKey: string | null): Promise<string> {
  if (!apiKey) throw new Error('Fireworks API key not configured');
  
  const response = await fetch(`${FIREWORKS_URL}/inference/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'accounts/fireworks/models/llama-v3p1-70b-instruct',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  if (!response.ok) throw new Error(`Fireworks API error: ${response.statusText}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Export convenience object
export const godModeService = {
  runGodMode,
  analyzeMusicMood,
  callAnyModel,
  GOD_MODE_PERSPECTIVES
};
