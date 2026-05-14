import { z } from 'zod';
import { BrandKitSchema as FullBrandKitSchema, type BrandKit as FullBrandKit } from '@/lib/validators';

/**
 * Re-export the canonical BrandKit schema from lib/validators.ts
 * so all consumers use the same validated type.
 */
export const BrandKitSchema = FullBrandKitSchema;
export type BrandKit = FullBrandKit;

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
    // Handle legacy key mappings — map old field names to new schema
    const normalized = {
      brandName: data.brandName || data.name || data.brand || 'My Brand',
      userName: data.userName || '',
      agentName: data.agentName || '',
      niche: data.niche || data.brandNiche || 'General',
      targetAudience: data.targetAudience || data.audience || data.audiences || '',
      primaryColor: data.primaryColor || '#3B82F6',
      secondaryColor: data.secondaryColor || '#1E293B',
      tone: data.tone || 'professional',
      avoidTopics: data.avoidTopics || data.bannedTopics || [],
      contentPillars: data.contentPillars || data.pillars || [],
      uniqueSellingPoint: data.uniqueSellingPoint || data.usp || '',
      language: data.language || 'en',
      hashtagStrategy: data.hashtagStrategy || [],
      contentPreferences: data.contentPreferences || [],
    };
    
    return BrandKitSchema.parse(normalized);
  },

  async normalizeDraft(data: any): Promise<Draft> {
    return DraftSchema.parse(data);
  }
};
