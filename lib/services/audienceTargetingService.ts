import { logger } from '@/lib/utils/logger';
import { RegionalContentFilterService, type Region } from './regionalContentFilterService';
import { kvGet, kvSet } from './puterService';

export type AudienceScope = 'global' | 'local' | 'regional';

export interface AudienceTargetingConfig {
  scope: AudienceScope;
  primaryRegion?: Region;
  secondaryRegions?: Region[];
  language?: string;
  culturalReferences?: 'include' | 'avoid' | 'adapt';
  localTrends?: boolean;
}

const AUDIENCE_CONFIG_KEY = 'audience_targeting_config';

const DEFAULT_CONFIG: AudienceTargetingConfig = {
  scope: 'global',
  primaryRegion: undefined,
  secondaryRegions: [],
  language: 'en',
  culturalReferences: 'include',
  localTrends: true,
};

class AudienceTargetingService {
  async getConfig(): Promise<AudienceTargetingConfig> {
    try {
      const stored = await kvGet(AUDIENCE_CONFIG_KEY);
      if (stored) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
      }
    } catch {
      // fall through to default
    }
    return { ...DEFAULT_CONFIG };
  }

  async setConfig(config: Partial<AudienceTargetingConfig>): Promise<AudienceTargetingConfig> {
    const current = await this.getConfig();
    const updated = { ...current, ...config };
    await kvSet(AUDIENCE_CONFIG_KEY, JSON.stringify(updated));
    logger.info('[AudienceTargeting] Config updated', updated);
    return updated;
  }

  async setScope(scope: AudienceScope): Promise<AudienceTargetingConfig> {
    return this.setConfig({ scope });
  }

  async setPrimaryRegion(region: Region): Promise<AudienceTargetingConfig> {
    return this.setConfig({ primaryRegion: region });
  }

  async getContentAdaptationInstructions(): Promise<{
    instructions: string;
    regions: Region[];
    warnings: string[];
  }> {
    const config = await this.getConfig();
    const instructions: string[] = [];
    const regions: Region[] = [];
    const warnings: string[] = [];

    switch (config.scope) {
      case 'global':
        instructions.push(
          'This content is for a GLOBAL audience.',
          'Use universally understood themes, references, and examples.',
          'Avoid region-specific idioms, holidays, or cultural references.',
          'Use neutral English that is easily translatable.',
          'Avoid slang, jargon, or culturally-specific humor.',
        );
        break;

      case 'local':
        instructions.push(
          `This content is for a LOCAL audience in ${(config.primaryRegion || DEFAULT_CONFIG.primaryRegion || 'us').toUpperCase()}.`,
          'Use local cultural references, idioms, and examples.',
          'Reference local events, holidays, and trends.',
          'Use language and tone appropriate for the local market.',
          'Consider local sensitivity and cultural norms.',
        );
        if (config.primaryRegion) regions.push(config.primaryRegion);
        break;

      case 'regional':
        const allRegions = [config.primaryRegion!, ...(config.secondaryRegions || [])].filter(Boolean);
        instructions.push(
          `This content targets specific regions: ${allRegions.map(r => r.toUpperCase()).join(', ')}.`,
          'Adapt cultural references for each target region.',
          'Consider regional regulations and sensitivities.',
          'Use region-appropriate language variants where applicable.',
        );
        allRegions.forEach(r => regions.push(r));
        break;
    }

    if (config.culturalReferences === 'avoid') {
      instructions.push('Avoid all cultural references. Keep content culture-neutral.');
    } else if (config.culturalReferences === 'adapt') {
      instructions.push('Adapt cultural references to be appropriate for each target region.');
    }

    if (config.language && config.language !== 'en') {
      instructions.push(`Preferred language: ${config.language}.`);
    }

    // Check regional compliance for the target regions
    if (regions.length > 0 && config.scope !== 'global') {
      try {
        const regionResults = await Promise.all(
          regions.map(async (region) => {
            const result = await RegionalContentFilterService.checkRegion(region);
            return { region, restrictions: result.restrictions };
          }),
        );
        for (const r of regionResults) {
          if (r.restrictions.length > 0) {
            warnings.push(`${r.region.toUpperCase()}: ${r.restrictions.join('; ')}`);
          }
        }
      } catch {
        // regional checks are advisory
      }
    }

    return {
      instructions: instructions.join('\n'),
      regions,
      warnings,
    };
  }
}

export const audienceTargetingService = new AudienceTargetingService();
