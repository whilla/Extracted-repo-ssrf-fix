import { logger } from '@/lib/utils/logger';

export type Region = 
  | 'us' | 'eu' | 'uk' | 'ca' | 'au' 
  | 'jp' | 'cn' | 'in' | 'br' | 'de' | 'fr' | 'es';

export interface RegionalRule {
  region: Region;
  restrictions: {
    blockedTopics?: string[];
    blockedWords?: string[];
    requiredWarnings?: string[];
    maxContentLength?: number;
    ageRestrictions?: boolean;
  };
}

export interface FilteringResult {
  success: boolean;
  isAllowed: boolean;
  modifications: {
    type: 'removed' | 'warning' | 'modified' | 'blocked';
    original?: string;
    modified?: string;
    reason: string;
  }[];
  regions: Region[];
  contentWarnings?: string[];
  error?: string;
}

export class RegionalContentFilterService {
  private static rules: Map<Region, RegionalRule> = new Map([
    ['us', {
      region: 'us',
      restrictions: {
        blockedTopics: [],
        blockedWords: ['injunction', 'litigation'],
        requiredWarnings: [],
        ageRestrictions: false,
      },
    }],
    ['eu', {
      region: 'eu',
      restrictions: {
        blockedTopics: [],
        blockedWords: [],
        requiredWarnings: ['GDPR Notice'],
        ageRestrictions: true,
      },
    }],
    ['de', {
      region: 'de',
      restrictions: {
        blockedTopics: ['extremism'],
        blockedWords: ['Nazi', 'Holocaust references'],
        requiredWarnings: [],
      },
    }],
    ['cn', {
      region: 'cn',
      restrictions: {
        blockedTopics: ['political dissent', 'Tiananmen', 'Falun Gong'],
        blockedWords: ['democracy', 'protest'],
        requiredWarnings: [],
        maxContentLength: 1000,
      },
    }],
    ['in', {
      region: 'in',
      restrictions: {
        blockedTopics: ['religious tension'],
        blockedWords: [],
        requiredWarnings: [],
      },
    }],
  ]);

  static async filterContent(
    content: string,
    targetRegions: Region[]
  ): Promise<FilteringResult> {
    try {
      logger.info('[RegionalContentFilter] Filtering content', { regions: targetRegions });

      const modifications: FilteringResult['modifications'] = [];
      const warnings: string[] = [];

      for (const region of targetRegions) {
        const rule = this.rules.get(region);
        if (!rule) continue;

        const { restrictions } = rule;

        if (restrictions.blockedWords?.length) {
          restrictions.blockedWords.forEach(word => {
            const regex = new RegExp(word, 'gi');
            if (regex.test(content)) {
              modifications.push({
                type: 'removed',
                original: word,
                reason: `Blocked word in ${region.toUpperCase()}: ${word}`,
              });
              content = content.replace(regex, '[REMOVED]');
            }
          });
        }

        if (restrictions.blockedTopics?.length) {
          restrictions.blockedTopics.forEach(topic => {
            if (content.toLowerCase().includes(topic.toLowerCase())) {
              modifications.push({
                type: 'blocked',
                modified: topic,
                reason: `Blocked topic in ${region.toUpperCase()}: ${topic}`,
              });
            }
          });
        }

        if (restrictions.requiredWarnings?.length) {
          warnings.push(...restrictions.requiredWarnings);
        }

        if (restrictions.maxContentLength && content.length > restrictions.maxContentLength) {
          content = content.substring(0, restrictions.maxContentLength);
          modifications.push({
            type: 'modified',
            reason: `Content truncated for ${region.toUpperCase()} (max ${restrictions.maxContentLength} chars)`,
          });
        }

        if (restrictions.ageRestrictions) {
          warnings.push('Age-restricted content notice may be required');
        }
      }

      const isAllowed = !modifications.some(m => m.type === 'blocked');

      return {
        success: true,
        isAllowed,
        modifications,
        regions: targetRegions,
        contentWarnings: warnings,
      };
    } catch (error) {
      return {
        success: false,
        isAllowed: false,
        modifications: [],
        regions: targetRegions,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async checkRegion(region: Region): Promise<{ allowed: boolean; restrictions: string[] }> {
    const rule = this.rules.get(region);
    if (!rule) {
      return { allowed: true, restrictions: [] };
    }

    const restrictions: string[] = [];
    if (rule.restrictions.blockedTopics?.length) {
      restrictions.push(`Blocked topics: ${rule.restrictions.blockedTopics.join(', ')}`);
    }
    if (rule.restrictions.blockedWords?.length) {
      restrictions.push(`Blocked words: ${rule.restrictions.blockedWords.join(', ')}`);
    }
    if (rule.restrictions.requiredWarnings?.length) {
      restrictions.push(`Required warnings: ${rule.restrictions.requiredWarnings.join(', ')}`);
    }
    if (rule.restrictions.ageRestrictions) {
      restrictions.push('Age verification required');
    }

    return { allowed: true, restrictions };
  }

  static async addRegionRule(rule: RegionalRule): Promise<void> {
    this.rules.set(rule.region, rule);
    logger.info('[RegionalContentFilter] Added rule for region', { region: rule.region });
  }

  static async getSupportedRegions(): Promise<Region[]> {
    return Array.from(this.rules.keys());
  }

  static async recommendRegions(content: string): Promise<{ recommended: Region[]; blocked: Region[] }> {
    const recommended: Region[] = [];
    const blocked: Region[] = [];

    for (const [region, rule] of this.rules.entries()) {
      const { restrictions } = rule;
      
      let isBlocked = false;
      if (restrictions.blockedTopics?.length) {
        for (const topic of restrictions.blockedTopics) {
          if (content.toLowerCase().includes(topic.toLowerCase())) {
            isBlocked = true;
            break;
          }
        }
      }

      if (!isBlocked) {
        recommended.push(region);
      } else {
        blocked.push(region);
      }
    }

    return { recommended, blocked };
  }
}