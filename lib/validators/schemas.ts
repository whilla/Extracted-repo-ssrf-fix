import { z } from 'zod';

/**
 * V1 -> V2 Migration for Brand Kits
 * Ensures that legacy JSON structures are normalized to the current standard.
 */
export const BrandKitSchema = z.object({
  niche: z.string().default('General'),
  audience: z.string().default('General Audience'),
  tone: z.string().default('Professional'),
  characterLock: z.string().default(''),
  styleRules: z.string().default(''),
  contentPillars: z.array(z.string()).default([]),
  bannedTopics: z.array(z.string()).default([]),
  platformPreferences: z.record(z.string()).default({}),
});

export type BrandKit = z.infer<typeof BrandKitSchema>;

export const DraftVersionSchema = z.object({
  v: z.number(),
  text: z.string(),
  imageUrl: z.string().optional(),
  imagePrompt: z.string().optional(),
  voiceUrl: z.string().optional(),
  score: z.number().optional(),
  createdAt: z.string(),
});

export const DraftSchema = z.object({
  id: z.string(),
  versions: z.array(DraftVersionSchema),
  currentVersion: z.number(),
  status: z.enum(['draft', 'approved', 'scheduled', 'published', 'failed']),
  platforms: z.array(z.string()),
  scheduledAt: z.string().optional(),
  publishedAt: z.string().optional(),
});

export type Draft = z.infer<typeof DraftSchema>;

/**
 * Virtual Schema Manager
 * Validates and migrates legacy JSON data on the fly.
 */
export const SchemaManager = {
  async normalizeBrandKit(data: any): Promise<BrandKit> {
    // Handle legacy key mappings
    const normalized = {
      niche: data.niche || data.brandNiche || 'General',
      audience: data.targetAudience || data.audience || 'General Audience',
      tone: data.tone || 'Professional',
      characterLock: data.characterLock || data.character || '',
      styleRules: data.styleRules || data.writingStyle || '',
      contentPillars: data.contentPillars || data.pillars || [],
      bannedTopics: data.bannedTopics || [],
      platformPreferences: data.platformPreferences || {},
    };
    
    return BrandKitSchema.parse(normalized);
  },

  async normalizeDraft(data: any): Promise<Draft> {
    return DraftSchema.parse(data);
  }
};
