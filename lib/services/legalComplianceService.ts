import { logger } from '@/lib/utils/logger';

export interface CopyrightMatch {
  source: string;
  url?: string;
  similarity: number;
  matchedText?: string;
  risk: 'low' | 'medium' | 'high';
}

export interface ComplianceResult {
  success: boolean;
  isCompliant: boolean;
  issues: {
    type: 'copyright' | 'trademark' | 'legal' | 'safety';
    severity: 'low' | 'medium' | 'high';
    description: string;
    matchedContent?: string;
    recommendation: string;
  }[];
  copyrightMatches?: CopyrightMatch[];
  score: number;
  error?: string;
}

export class LegalComplianceService {
  private static blockedPhrases = [
    'copyrighted',
    'all rights reserved',
    'trademark',
  ];

  private static protectedBrands = [
    'apple', 'microsoft', 'google', 'amazon', 'meta', 'nike', 'coca-cola',
  ];

  static async scanContent(content: string): Promise<ComplianceResult> {
    try {
      logger.info('[LegalComplianceService] Scanning content for compliance', {});

      const issues: ComplianceResult['issues'] = [];
      const contentLower = content.toLowerCase();

      if (contentLower.includes('©') || contentLower.includes('copyright')) {
        issues.push({
          type: 'copyright',
          severity: 'medium',
          description: 'Potential copyrighted content detected',
          recommendation: 'Ensure you have permission to use this content',
        });
      }

      for (const brand of this.protectedBrands) {
        if (contentLower.includes(brand)) {
          issues.push({
            type: 'trademark',
            severity: 'medium',
            description: `Protected trademark detected: ${brand}`,
            matchedContent: brand,
            recommendation: `Ensure proper trademark usage or consider using generic alternatives`,
          });
        }
      }

      const riskWords = ['guarantee', 'promise', 'cure', 'instant', 'free money'];
      riskWords.forEach(word => {
        if (contentLower.includes(word)) {
          issues.push({
            type: 'legal',
            severity: 'low',
            description: `Potentially misleading term: ${word}`,
            matchedContent: word,
            recommendation: 'Review for compliance with advertising regulations',
          });
        }
      });

      const score = Math.max(0, 100 - issues.length * 15);
      const isCompliant = issues.length === 0;

      return {
        success: true,
        isCompliant,
        issues,
        score,
      };
    } catch (error) {
      return {
        success: false,
        isCompliant: false,
        issues: [],
        score: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async checkCopyright(content: string): Promise<ComplianceResult> {
    try {
      logger.info('[LegalComplianceService] Checking for copyright violations', {});

      const matches: CopyrightMatch[] = [];
      const issues: ComplianceResult['issues'] = [];

      // Copyright detection without a real API is limited to:
      // - Detecting © symbols and copyright declarations
      // - Flagging very long verbatim quotes
      // - Checking for common copyrighted phrases
      const contentLower = content.toLowerCase();

      if (contentLower.includes('©') || contentLower.includes('copyright')) {
        issues.push({
          type: 'copyright',
          severity: 'medium',
          description: 'Content contains copyright symbols or declarations',
          recommendation: 'Verify you own or have licensed this content',
        });
      }

      const quotePattern = /["\u201C\u201D][^"\u201C\u201D]{50,}["\u201C\u201D]/g;
      const quotes = content.match(quotePattern);
      if (quotes) {
        quotes.forEach(quote => {
          matches.push({
            source: 'Unknown source (long verbatim quote)',
            similarity: Math.min(100, Math.round((quote.length / content.length) * 100)),
            matchedText: quote.substring(0, 80) + '...',
            risk: 'low',
          });
        });
        issues.push({
          type: 'copyright',
          severity: 'low',
          description: 'Long verbatim quotes detected — ensure proper attribution',
          recommendation: 'Add proper citation or paraphrase where possible',
        });
      }

      const score = matches.length > 0 ? 70 : 100;
      const isCompliant = issues.length === 0;

      return {
        success: true,
        isCompliant,
        issues,
        copyrightMatches: matches,
        score,
      };
    } catch (error) {
      return {
        success: false,
        isCompliant: false,
        issues: [],
        score: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async checkTrademark(content: string): Promise<ComplianceResult> {
    try {
      logger.info('[LegalComplianceService] Checking for trademark violations', {});

      const issues: ComplianceResult['issues'] = [];
      const contentLower = content.toLowerCase();

      for (const brand of this.protectedBrands) {
        if (contentLower.includes(brand)) {
          issues.push({
            type: 'trademark',
            severity: 'medium',
            description: `Trademark detected: ${brand}`,
            recommendation: 'Ensure fair use or obtain permission',
          });
        }
      }

      return {
        success: true,
        isCompliant: issues.filter(i => i.severity === 'high').length === 0,
        issues,
        score: Math.max(0, 100 - issues.length * 20),
      };
    } catch (error) {
      return {
        success: false,
        isCompliant: false,
        issues: [],
        score: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async generateComplianceReport(content: string): Promise<{
    success: boolean;
    report: {
      overallScore: number;
      passed: boolean;
      categories: Record<string, { score: number; issues: number }>;
      summary: string;
    };
  }> {
    const copyrightResult = await this.checkCopyright(content);
    const trademarkResult = await this.checkTrademark(content);
    const generalResult = await this.scanContent(content);

    const categories = {
      copyright: { score: copyrightResult.score, issues: copyrightResult.issues.length },
      trademark: { score: trademarkResult.score, issues: trademarkResult.issues.length },
      general: { score: generalResult.score, issues: generalResult.issues.length },
    };

    const overallScore = Math.floor(
      (categories.copyright.score + categories.trademark.score + categories.general.score) / 3
    );

    return {
      success: true,
      report: {
        overallScore,
        passed: overallScore >= 70,
        categories,
        summary: overallScore >= 70 ? 'Content passes compliance checks' : 'Content requires review',
      },
    };
  }
}