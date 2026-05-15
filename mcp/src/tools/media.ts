import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerMediaTools(server: McpServer) {
  server.tool(
    'generate_image',
    {
      prompt: z.string().describe('Image description/prompt'),
      style: z.enum(['photorealistic', 'illustration', 'digital-art', 'anime', '3d-render', 'oil-painting', 'watercolor']).optional().default('photorealistic').describe('Visual style'),
      size: z.enum(['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792']).optional().default('1024x1024').describe('Image dimensions'),
      provider: z.enum(['openai', 'stability', 'leonardo', 'ideogram', 'replicate']).optional().describe('Preferred image generation provider'),
    },
    async ({ prompt, style, size, provider }) => {
      const response = await fetchNexusAI('/api/ai/chat', {
        body: { messages: [{ role: 'user', content: `Generate an image with prompt: "${prompt}", style: ${style}, size: ${size}${provider ? `, provider: ${provider}` : ''}` }] },
      });
      return response;
    }
  );

  server.tool(
    'generate_video',
    {
      prompt: z.string().describe('Video description or script'),
      duration: z.number().optional().default(5).describe('Duration in seconds'),
      style: z.enum(['cinematic', 'animation', 'realistic', 'abstract']).optional().default('cinematic').describe('Video style'),
      resolution: z.enum(['480p', '720p', '1080p']).optional().default('720p').describe('Output resolution'),
    },
    async ({ prompt, duration, style, resolution }) => {
      const response = await fetchNexusAI('/api/video', {
        body: { prompt, duration, style, resolution },
      });
      return response;
    }
  );

  server.tool(
    'generate_voice',
    {
      text: z.string().describe('Text to convert to speech'),
      voice: z.string().optional().describe('Voice ID or name'),
      language: z.string().optional().default('en').describe('Language code'),
      speed: z.number().optional().default(1.0).describe('Speech speed multiplier (0.5-2.0)'),
    },
    async ({ text, voice, language, speed }) => {
      const response = await fetchNexusAI('/api/ai/chat', {
        body: { messages: [{ role: 'user', content: `Generate voice audio for text: "${text}", language: ${language}, speed: ${speed}${voice ? `, voice: ${voice}` : ''}` }] },
      });
      return response;
    }
  );

  server.tool(
    'generate_music',
    {
      description: z.string().describe('Music description (genre, mood, tempo, instruments)'),
      duration: z.number().optional().default(30).describe('Duration in seconds'),
      genre: z.enum(['pop', 'rock', 'electronic', 'classical', 'jazz', 'ambient', 'hip-hop', 'lofi']).optional().describe('Music genre'),
      mood: z.enum(['happy', 'sad', 'energetic', 'calm', 'dramatic', 'uplifting', 'dark']).optional().describe('Music mood'),
    },
    async ({ description, duration, genre, mood }) => {
      const response = await fetchNexusAI('/api/ai/chat', {
        body: { messages: [{ role: 'user', content: `Generate music: ${description}, duration: ${duration}s${genre ? `, genre: ${genre}` : ''}${mood ? `, mood: ${mood}` : ''}` }] },
      });
      return response;
    }
  );

  server.tool(
    'edit_video',
    {
      timeline: z.object({
        clips: z.array(z.object({ source: z.string(), startTime: z.number(), endTime: z.number() })),
        transitions: z.array(z.object({ type: z.enum(['fade', 'dissolve', 'wipe', 'slide', 'zoom']), duration: z.number() })).optional(),
        overlays: z.array(z.object({ type: z.enum(['text', 'image', 'logo']), content: z.string(), position: z.object({ x: z.number(), y: z.number() }), startTime: z.number(), endTime: z.number() })).optional(),
      }).describe('Video editing timeline'),
    },
    async ({ timeline }) => {
      const response = await fetchNexusAI('/api/video/edit', { body: { timeline } });
      return response;
    }
  );

  server.tool(
    'generate_3d_model',
    {
      prompt: z.string().describe('3D model description'),
      style: z.enum(['realistic', 'cartoon', 'abstract', 'low_poly']).optional().default('realistic').describe('3D style'),
      outputFormat: z.enum(['glb', 'gltf']).optional().default('glb').describe('Output format'),
    },
    async ({ prompt, style, outputFormat }) => {
      const response = await fetchNexusAI('/api/spatial/models', { body: { prompt, style, outputFormat } });
      return response;
    }
  );

  server.tool(
    'generate_ar_filter',
    {
      effectName: z.string().describe('Name of the AR effect'),
      trigger: z.enum(['face', 'hand', 'body', 'world']).optional().default('face').describe('AR trigger type'),
      intensity: z.number().optional().default(1).describe('Effect intensity (0-1)'),
    },
    async ({ effectName, trigger, intensity }) => {
      const response = await fetchNexusAI('/api/spatial/ar-filters', { body: { effectName, trigger, intensity } });
      return response;
    }
  );
}

async function fetchNexusAI(path: string, options?: { method?: string; body?: Record<string, unknown> }) {
  const baseUrl = process.env.NEXUSAI_API_URL || 'http://localhost:3000';
  const apiKey = process.env.NEXUSAI_API_KEY;

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: options?.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await res.json();

    if (!res.ok) {
      return { content: [{ type: 'text' as const, text: `Error: ${data.error || data.message || `HTTP ${res.status}`}` }], isError: true };
    }

    return { content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text' as const, text: `Connection error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
  }
}
