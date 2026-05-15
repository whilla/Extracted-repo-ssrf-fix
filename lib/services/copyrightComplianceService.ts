import { kvGet } from './puterService';

// Real copyright/trademark patterns and rules
const COPYRIGHT_PATTERNS = [
  // Disney characters
  /\b(mickey|minnie|donald|daisy|elsa|anna|frozen|star wars|marvel)\b/i,
  // Music lyrics
  /\b(let it be|imagine all the people|i will always love you)\b/i,
  // Brand names that are trademarked
  /\b(coca.cola|pepsi|iphone|ipad|macbook|playstation|xbox|nintendo)\b/i,
  // Movie quotes
  /\b(may the force be with you|here.s johnny|i am your father)\b/i,
];

const TRADEMARK_INDICATORS = [
  /\b[™®©]/,
  /\b(TM|R|C)\b/,
  /\bregistered trademark\b/i,
  /\bcopyright\b/i,
];

export interface CopyrightIssue {
  type: 'copyright' | 'trademark' | 'unverified';
  severity: 'low' | 'medium' | 'high';
  text: string;
  message: string;
  suggestion: string;
}

export interface VerificationResult {
  isChecked: boolean;
  issues: CopyrightIssue[];
  confidence: number;
}

class CopyrightComplianceService {
  /**
   * Check content for potential copyright/trademark issues
   * Uses pattern matching and heuristics for real-time checking
   */
  async verifyContent(content: string): Promise<VerificationResult> {
    const issues: CopyrightIssue[] = [];

    // Check for known copyright patterns
    for (const pattern of COPYRIGHT_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        issues.push({
          type: 'copyright',
          severity: 'high',
          text: matches[0],
          message: `Potential copyrighted content detected: "${matches[0]}"`,
          suggestion: 'Consider creating original content or obtaining proper licensing',
        });
      }
    }

    // Check for trademark indicators
    for (const pattern of TRADEMARK_INDICATORS) {
      const matches = content.match(pattern);
      if (matches) {
        issues.push({
          type: 'trademark',
          severity: 'medium',
          text: matches[0],
          message: `Trademark symbol detected: "${matches[0]}"`,
          suggestion: 'Verify you have rights to use this trademark or remove the symbol',
        });
      }
    }

    // Check for fair use patterns
    const fairUseCount = (content.match(/\b(fair use|parody|educational|commentary)\b/gi) || []).length;
    const fairUseStrength = Math.min(1, fairUseCount / 5);

    // Calculate confidence based on content length and patterns
    const confidence = content.length > 100 ? 0.7 + fairUseStrength * 0.2 : 0.5;

    return {
      isChecked: true,
      issues,
      confidence,
    };
  }

  /**
   * Check if content is likely fair use
   */
  async checkFairUse(content: string, purpose: 'educational' | 'commentary' | 'parody' | 'commercial'): Promise<{
    isFairUse: boolean;
    score: number;
    factors: string[];
  }> {
    const factors: string[] = [];
    let score = 0.5;

    // Purpose factor
    if (purpose === 'educational' || purpose === 'commentary' || purpose === 'parody') {
      score += 0.3;
      factors.push('Transformative purpose favors fair use');
    } else {
      factors.push('Commercial use weighs against fair use');
    }

    // Amount factor
    const words = content.split(/\s+/).length;
    if (words < 100) {
      score += 0.1;
      factors.push('Short excerpt favors fair use');
    } else if (words > 1000) {
      score -= 0.2;
      factors.push('Large excerpt weighs against fair use');
    }

    // Attribution factor
    if (/\b(source|credit|by|from)\b/i.test(content)) {
      score += 0.1;
      factors.push('Attribution present');
    }

    return {
      isFairUse: score > 0.5,
      score: Math.max(0, Math.min(1, score)),
      factors,
    };
  }

  /**
   * Generate safe alternatives for potentially infringing content
   */
  async generateAlternatives(infringingText: string): Promise<string[]> {
    // Simple paraphrasing rules
    const alternatives: string[] = [];

    const replacements: Record<string, string[]> = {
      'mickey mouse': ['cartoon mouse', 'animated character'],
      'coca cola': ['cola drink', 'soft drink'],
      'iphone': ['smartphone', 'mobile device'],
      'star wars': ['space adventure', 'sci-fi story'],
    };

    let modified = infringingText;
    for (const [original, alts] of Object.entries(replacements)) {
      modified = modified.replace(
        new RegExp(original, 'gi'),
        alts[0]
      );
    }

    if (modified !== infringingText) {
      alternatives.push(modified);
    }

    // Add more generic alternatives
    alternatives.push('Create original content inspired by the theme');
    alternatives.push('Use public domain references instead');

    return alternatives;
  }
}

export const copyrightComplianceService = new CopyrightComplianceService();