import { z } from 'zod';

// Platform Validation
export const PlatformSchema = z.enum([
  'twitter',
  'instagram',
  'tiktok',
  'linkedin',
  'facebook',
  'threads',
  'youtube',
  'pinterest',
]);

export type Platform = z.infer<typeof PlatformSchema>;

// Brand Kit Validation
export const BrandKitSchema = z.object({
  name: z.string().optional(),
  brandName: z.string().min(1, 'Brand name is required').max(100),
  userName: z.string().optional(),
  agentName: z.string().optional(),
  niche: z.string().min(1, 'Niche is required').max(100),
  targetAudience: z.string().min(1, 'Target audience is required').max(200),
  audience: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid hex color'),
  secondaryColor: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid hex color'),
  tone: z.enum(['professional', 'casual', 'humorous', 'inspirational', 'educational']),
  avoidTopics: z.array(z.string()).default([]),
  contentPillars: z.array(z.string()).min(1, 'At least one content pillar required'),
  uniqueSellingPoint: z.string().min(1, 'USP is required').max(300),
  language: z.string().default('en'),
  hashtagStrategy: z.union([z.string(), z.array(z.string())]).optional(),
  contentPreferences: z.array(z.object({
    type: z.string(),
    description: z.string(),
    frequency: z.enum(['always', 'often', 'rarely']),
    savedInstructions: z.string(),
  })).optional().default([]),
});

export type BrandKit = z.infer<typeof BrandKitSchema>;

// Content Draft Validation
export const ContentDraftInputSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less'),
  
  content: z.string()
    .min(1, 'Content is required')
    .max(5000, 'Content must be 5000 characters or less'),
  
  platforms: z.array(PlatformSchema)
    .min(1, 'Select at least one platform'),
  
  scheduledAt: z.date().optional().nullable(),
  
  brandKitId: z.string().uuid('Invalid brand kit ID').optional().nullable(),
  
  tags: z.array(z.string()).optional().default([]),
  
  mediaUrls: z.array(z.string().url('Invalid URL')).optional().default([]),
  
  contentType: z.enum(['text', 'image', 'video', 'mixed']).optional().default('text'),
});

export type ContentDraftInput = z.infer<typeof ContentDraftInputSchema>;

// AI Settings Validation
export const AISettingsSchema = z.object({
  provider: z.enum([
    'puter',
    'openrouter',
    'gemini',
    'groq',
    'deepseek',
    'nvidia',
    'together',
    'fireworks',
    'ollama',
    'poe',
    'bytez',
    'githubmodels',
  ]),
  model: z.string().min(1, 'Model is required').max(100),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).max(128000).default(2048),
  topP: z.number().min(0).max(1).default(0.9).optional(),
});

export type AISettings = z.infer<typeof AISettingsSchema>;

// Message Validation
export const AIMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1, 'Message content is required').max(10000),
});

export type AIMessage = z.infer<typeof AIMessageSchema>;

// Chat Request Validation
export const ChatRequestSchema = z.object({
  messages: z.array(AIMessageSchema).min(1, 'At least one message required'),
  settings: AISettingsSchema.optional(),
  brandKit: BrandKitSchema.optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// Media Generation Validation
export const ImageGenerationRequestSchema = z.object({
  prompt: z.string().min(10, 'Prompt must be at least 10 characters').max(1000),
  style: z.string().optional(),
  quality: z.enum(['low', 'medium', 'high']).default('medium'),
  size: z.enum(['small', 'medium', 'large']).default('medium'),
});

export type ImageGenerationRequest = z.infer<typeof ImageGenerationRequestSchema>;

export const VideoGenerationRequestSchema = z.object({
  prompt: z.string().min(10, 'Prompt must be at least 10 characters').max(1000),
  duration: z.number().min(5).max(60).default(15),
  style: z.string().optional(),
});

export type VideoGenerationRequest = z.infer<typeof VideoGenerationRequestSchema>;

// Publish Request Validation
export const PublishRequestSchema = z.object({
  contentId: z.string().uuid('Invalid content ID'),
  platforms: z.array(PlatformSchema).min(1, 'Select at least one platform'),
  scheduledFor: z.date().optional(),
});

export type PublishRequest = z.infer<typeof PublishRequestSchema>;

// Helper function to validate and throw on error
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(`Validation failed: ${errors}`);
  }
  return result.data;
}

// Helper function for safe validation (returns null on error)
export function safeValidate<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}
