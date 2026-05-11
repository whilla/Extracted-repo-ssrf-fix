/**
 * Publish Safety Service
 * Enforces safety checks and approval gates before any content is published
 */

import { kvGet, kvSet, readFile, writeFile, PATHS } from './puterService';
import { loadBrandKit } from './memoryService';
import { universalChat } from './aiService';
import { loadAgentMemory } from './agentMemoryService';
import type { BrandKit, Platform } from '@/lib/types';
import { publishPost, schedulePost } from './publishService';
import { validateContent, makeGovernorDecision } from './governorService';

export interface PublishSafetyConfig {
  requireApproval: boolean;
  requireReview: boolean;
  maxDailyPosts: number;
  blockedWords: string[];
  requiredHashtags: string[];
  sensitiveTopics: string[];
  minQualityScore: number;
  allowAutoPublish: boolean;
  safeModeEnabled: boolean;
}

export interface SafetyCheckResult {
  passed: boolean;
  score: number;
  checks: {
    name: string;
    passed: boolean;
    message: string;
    severity: 'error' | 'warning' | 'info';
  }[];
  requiresHumanReview: boolean;
  blockedReasons: string[];
}

export interface ApprovalRequest {
  id: string;
  contentId: string;
  content: string;
  platforms: Platform[];
  mediaUrl?: string;
  scheduledTime?: string;
  safetyCheck: SafetyCheckResult;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  notes?: string;
  profileSnapshot?: {
    niche?: string;
    targetAudience?: string;
    targetPlatforms?: string[];
    monetizationGoals?: string[];
    contentPillars?: string[];
    contentIdea?: string;
  };
  publishResult?: {
    success: boolean;
    message?: string;
  };
}

const DEFAULT_CONFIG: PublishSafetyConfig = {
  requireApproval: true,
  requireReview: true,
  maxDailyPosts: 10,
  blockedWords: [],
  requiredHashtags: [],
  sensitiveTopics: ['politics', 'religion', 'controversy'],
  minQualityScore: 0.6,
  allowAutoPublish: false,
  safeModeEnabled: true,
};

const PLATFORM_POLICY_PATTERNS = [
  { pattern: /\bguaranteed?\s+(income|earnings|results|followers|views|sales)\b/i, message: 'Contains guaranteed outcome claims.' },
  { pattern: /\bget rich quick\b/i, message: 'Contains get-rich-quick language.' },
  { pattern: /\b(before|after)\b.*\b(cure|healed|fixed)\b/i, message: 'Contains risky before/after or miracle-claim framing.' },
  { pattern: /\b(no risk|risk[- ]free|effortless|instant results?)\b/i, message: 'Contains misleading low-risk or instant-result claims.' },
  { pattern: /\b(comment|tag|share).*\b(comment|tag|share)\b/i, message: 'Contains engagement-bait phrasing.' },
];

const MONETIZATION_RISK_PATTERNS = [
  { pattern: /\b(shocking|you won.t believe|secret trick|hack)\b/i, message: 'Uses low-trust clickbait language.' },
  { pattern: /\bmedical advice\b|\bdiagnose\b|\bcure\b/i, message: 'Contains potentially sensitive medical-style claims.' },
  { pattern: /\bbetting\b|\bgambling\b|\bcasino\b/i, message: 'Contains restricted monetization topic language.' },
  { pattern: /\bpolitical\s+endorsement\b|\bvote for\b/i, message: 'Contains politically sensitive monetization risk.' },
];

// Load safety configuration
export async function loadSafetyConfig(): Promise<PublishSafetyConfig> {
  try {
    const config = await readFile<PublishSafetyConfig>(`${PATHS.settings}/safety-config.json`);
    return { ...DEFAULT_CONFIG, ...config };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// Save safety configuration
export async function saveSafetyConfig(config: Partial<PublishSafetyConfig>): Promise<boolean> {
  const current = await loadSafetyConfig();
  return writeFile(`${PATHS.settings}/safety-config.json`, { ...current, ...config });
}

// Run comprehensive safety checks on content
export async function runSafetyChecks(
  content: string,
  platforms: string[],
  brandKit?: BrandKit | null
): Promise<SafetyCheckResult> {
  const config = await loadSafetyConfig();
  const checks: SafetyCheckResult['checks'] = [];
  let totalScore = 100;
  const blockedReasons: string[] = [];

  // 1. Check for blocked words
  const blockedWordsFound = config.blockedWords.filter(word => 
    content.toLowerCase().includes(word.toLowerCase())
  );
  if (blockedWordsFound.length > 0) {
    checks.push({
      name: 'Blocked Words',
      passed: false,
      message: `Contains blocked words: ${blockedWordsFound.join(', ')}`,
      severity: 'error',
    });
    totalScore -= 50;
    blockedReasons.push('Contains blocked words');
  } else {
    checks.push({
      name: 'Blocked Words',
      passed: true,
      message: 'No blocked words detected',
      severity: 'info',
    });
  }

  // 2. Check content length per platform
  const lengthChecks = platforms.map(platform => {
    const limits: Record<string, number> = {
      twitter: 280,
      instagram: 2200,
      linkedin: 3000,
      facebook: 63206,
      tiktok: 2200,
      youtube: 5000,
    };
    const limit = limits[platform] || 2000;
    const passed = content.length <= limit;
    return { platform, passed, limit, actual: content.length };
  });

  const failedLengthChecks = lengthChecks.filter(c => !c.passed);
  if (failedLengthChecks.length > 0) {
    checks.push({
      name: 'Content Length',
      passed: false,
      message: `Exceeds limit for: ${failedLengthChecks.map(c => `${c.platform} (${c.actual}/${c.limit})`).join(', ')}`,
      severity: 'error',
    });
    totalScore -= 30;
  } else {
    checks.push({
      name: 'Content Length',
      passed: true,
      message: 'Content length within limits for all platforms',
      severity: 'info',
    });
  }

  // 3. Check for sensitive topics
  const sensitiveFound = config.sensitiveTopics.filter(topic =>
    content.toLowerCase().includes(topic.toLowerCase())
  );
  if (sensitiveFound.length > 0) {
    checks.push({
      name: 'Sensitive Topics',
      passed: false,
      message: `May contain sensitive topics: ${sensitiveFound.join(', ')}`,
      severity: 'warning',
    });
    totalScore -= 15;
  } else {
    checks.push({
      name: 'Sensitive Topics',
      passed: true,
      message: 'No sensitive topics detected',
      severity: 'info',
    });
  }

  // 4. Check required hashtags
  if (config.requiredHashtags.length > 0) {
    const missingHashtags = config.requiredHashtags.filter(tag =>
      !content.includes(tag)
    );
    if (missingHashtags.length > 0) {
      checks.push({
        name: 'Required Hashtags',
        passed: false,
        message: `Missing required hashtags: ${missingHashtags.join(', ')}`,
        severity: 'warning',
      });
      totalScore -= 10;
    } else {
      checks.push({
        name: 'Required Hashtags',
        passed: true,
        message: 'All required hashtags present',
        severity: 'info',
      });
    }
  }

  // 5. AI-powered brand alignment check
  if (brandKit) {
    try {
      const alignmentPrompt = `
Analyze this social media content for brand alignment:

Content: "${content}"

Brand Guidelines:
- Niche: ${brandKit.niche}
- Tone: ${brandKit.tone}
- Content Pillars: ${brandKit.contentPillars?.join(', ')}

Rate the alignment from 0-100 and identify any issues.
Respond in JSON format: { "score": number, "issues": string[], "suggestions": string[] }
`;
      const response = await universalChat(alignmentPrompt);
      const result = JSON.parse(response);
      
      if (result.score < 70) {
        checks.push({
          name: 'Brand Alignment',
          passed: false,
          message: `Low brand alignment (${result.score}%): ${result.issues?.join(', ') || 'Review recommended'}`,
          severity: 'warning',
        });
        totalScore -= (100 - result.score) / 4;
      } else {
        checks.push({
          name: 'Brand Alignment',
          passed: true,
          message: `Good brand alignment (${result.score}%)`,
          severity: 'info',
        });
      }
    } catch {
      checks.push({
        name: 'Brand Alignment',
        passed: true,
        message: 'Could not verify brand alignment',
        severity: 'warning',
      });
    }
  }

  // 6. Check daily post limit
  const todayPosts = await getTodayPostCount();
  if (todayPosts >= config.maxDailyPosts) {
    checks.push({
      name: 'Daily Limit',
      passed: false,
      message: `Daily post limit reached (${todayPosts}/${config.maxDailyPosts})`,
      severity: 'error',
    });
    blockedReasons.push('Daily post limit reached');
  } else {
    checks.push({
      name: 'Daily Limit',
      passed: true,
      message: `Within daily limit (${todayPosts}/${config.maxDailyPosts})`,
      severity: 'info',
    });
  }

  // 7. Check for spam patterns
  const spamPatterns = [
    /(.)\1{4,}/,  // Repeated characters
    /(https?:\/\/[^\s]+\s*){3,}/,  // Multiple links
    /[A-Z\s]{20,}/,  // Excessive caps
  ];
  const spamFound = spamPatterns.some(pattern => pattern.test(content));
  if (spamFound) {
    checks.push({
      name: 'Spam Detection',
      passed: false,
      message: 'Content may appear spammy',
      severity: 'warning',
    });
    totalScore -= 20;
  } else {
    checks.push({
      name: 'Spam Detection',
      passed: true,
      message: 'No spam patterns detected',
      severity: 'info',
    });
  }

  // 8. Platform policy patterns
  const platformPolicyHits = PLATFORM_POLICY_PATTERNS
    .filter(rule => rule.pattern.test(content))
    .map(rule => rule.message);

  if (platformPolicyHits.length > 0) {
    checks.push({
      name: 'Platform Policy',
      passed: false,
      message: platformPolicyHits.join(' '),
      severity: 'error',
    });
    totalScore -= 35;
    blockedReasons.push('Likely platform policy violation');
  } else {
    checks.push({
      name: 'Platform Policy',
      passed: true,
      message: 'No obvious platform policy violations detected',
      severity: 'info',
    });
  }

  // 9. Monetization safety
  const monetizationHits = MONETIZATION_RISK_PATTERNS
    .filter(rule => rule.pattern.test(content))
    .map(rule => rule.message);

  if (monetizationHits.length > 0) {
    checks.push({
      name: 'Monetization Safety',
      passed: false,
      message: monetizationHits.join(' '),
      severity: 'warning',
    });
    totalScore -= 20;
  } else {
    checks.push({
      name: 'Monetization Safety',
      passed: true,
      message: 'No obvious advertiser-safety risks detected',
      severity: 'info',
    });
  }

  // 10. AI moderation pass for nuanced risks
  try {
    const moderationPrompt = `Review this social content for platform compliance and advertiser safety.

Content:
"""${content}"""

Platforms: ${platforms.join(', ')}

Return strict JSON:
{
  "platformSafe": true,
  "monetizationSafe": true,
  "riskLevel": "low|medium|high",
  "flags": ["..."]
}`;

    const response = await universalChat(moderationPrompt, { model: 'gpt-4o-mini', brandKit });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const moderation = JSON.parse(jsonMatch[0]);
      const flags = Array.isArray(moderation.flags) ? moderation.flags : [];

      if (moderation.platformSafe === false) {
        checks.push({
          name: 'AI Policy Review',
          passed: false,
          message: flags.join(', ') || 'AI review flagged platform policy risk',
          severity: 'error',
        });
        totalScore -= 25;
        blockedReasons.push('AI review flagged platform policy risk');
      } else if (moderation.monetizationSafe === false || moderation.riskLevel === 'high') {
        checks.push({
          name: 'AI Policy Review',
          passed: false,
          message: flags.join(', ') || 'AI review flagged monetization risk',
          severity: 'warning',
        });
        totalScore -= 15;
      } else {
        checks.push({
          name: 'AI Policy Review',
          passed: true,
          message: 'AI review found low policy risk',
          severity: 'info',
        });
      }
    }
  } catch {
    checks.push({
      name: 'AI Policy Review',
      passed: true,
      message: 'AI policy review unavailable',
      severity: 'warning',
    });
  }

  // 11. Governor-aligned validation so publish safety and chat quality use the same base gate
  try {
    const governorValidation = await validateContent(content, {
      platform: platforms[0],
      isRegeneration: false,
    });

    const govValidation = governorValidation as { governorApproved?: boolean; rejectionReason?: string };
    if (!govValidation.governorApproved) {
      checks.push({
        name: 'Governor Validation',
        passed: false,
        message: govValidation.rejectionReason || 'Governor rejected this content',
        severity: 'error',
      });
      totalScore -= Math.max(10, 100 - governorValidation.score);
      blockedReasons.push('Governor validation failed');
    } else {
      checks.push({
        name: 'Governor Validation',
        passed: true,
        message: `Governor approved with score ${governorValidation.score}`,
        severity: 'info',
      });
    }
  } catch {
    checks.push({
      name: 'Governor Validation',
      passed: true,
      message: 'Governor validation unavailable',
      severity: 'warning',
    });
  }

  const finalScore = Math.max(0, Math.min(100, totalScore)) / 100;
  const hasErrors = checks.some(c => c.severity === 'error' && !c.passed);
  const hasWarnings = checks.some(c => c.severity === 'warning' && !c.passed);

  return {
    passed: !hasErrors && finalScore >= config.minQualityScore,
    score: finalScore,
    checks,
    requiresHumanReview: config.requireApproval || hasWarnings || finalScore < 0.8,
    blockedReasons,
  };
}

// Get today's post count
async function getTodayPostCount(): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const count = await kvGet(`posts_count_${today}`);
  return parseInt(count || '0', 10);
}

// Increment today's post count
export async function incrementPostCount(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const current = await getTodayPostCount();
  await kvSet(`posts_count_${today}`, String(current + 1));
}

// Create approval request
export async function createApprovalRequest(
  contentId: string,
  content: string,
  platforms: Platform[],
  scheduledTime?: string,
  mediaUrl?: string,
  contentIdea?: string
): Promise<ApprovalRequest> {
  const brandKit = await loadBrandKit();
  const agentMemory = await loadAgentMemory();
  const safetyCheck = await runSafetyChecks(content, platforms, brandKit);
  
  const request: ApprovalRequest = {
    id: `apr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    contentId,
    content,
    platforms,
    mediaUrl,
    scheduledTime,
    safetyCheck,
    status: 'pending',
    createdAt: new Date().toISOString(),
    profileSnapshot: {
      niche: agentMemory.niche || brandKit?.niche || undefined,
      targetAudience: agentMemory.targetAudience || brandKit?.targetAudience || undefined,
      targetPlatforms: agentMemory.targetPlatforms.length > 0 ? agentMemory.targetPlatforms : platforms,
      monetizationGoals: agentMemory.monetizationGoals,
      contentPillars: agentMemory.contentPillars,
      contentIdea: contentIdea || agentMemory.contentIdeas.find(idea => idea.status === 'new')?.idea,
    },
  };

  // Save to pending approvals
  const pending = await loadPendingApprovals();
  pending.push(request);
  await writeFile(`${PATHS.settings}/pending-approvals.json`, pending);

  return request;
}

// Load pending approvals
export async function loadPendingApprovals(): Promise<ApprovalRequest[]> {
  try {
    const approvals = await readFile<ApprovalRequest[]>(`${PATHS.settings}/pending-approvals.json`);
    return approvals || [];
  } catch {
    return [];
  }
}

// Approve content
export async function approveContent(
  requestId: string,
  reviewedBy: string,
  notes?: string
): Promise<ApprovalRequest | null> {
  const pending = await loadPendingApprovals();
  const index = pending.findIndex(r => r.id === requestId);
  
  if (index === -1) return null;

  const request: ApprovalRequest = {
    ...pending[index],
    status: 'pending',
    reviewedAt: new Date().toISOString(),
    reviewedBy,
    notes,
  };
  
  let publishResult: ApprovalRequest['publishResult'] = {
    success: false,
    message: 'Publishing was not attempted',
  };

  if (!request.safetyCheck.passed) {
    publishResult = {
      success: false,
      message: `Blocked by safety checks: ${request.safetyCheck.blockedReasons.join(', ') || 'manual review required'}`,
    };
    request.status = 'rejected';
  } else {
    try {
      const governorValidation = await validateContent(request.content, {
        platform: request.platforms[0],
      });
      const governorDecision = await makeGovernorDecision(governorValidation, {});

      if (!governorDecision.approved) {
        publishResult = {
          success: false,
          message: `Blocked by governor: ${governorDecision.reason}`,
        };
        request.status = 'rejected';
      } else {
        request.status = 'approved';
        if (request.scheduledTime) {
          const result = await schedulePost({
            text: request.content,
            platforms: request.platforms,
            scheduledDate: request.scheduledTime,
            mediaUrl: request.mediaUrl,
          });
          publishResult = {
            success: result.success,
            message: result.success ? 'Scheduled successfully' : result.error || 'Scheduling failed',
          };
        } else {
          const result = await publishPost({
            text: request.content,
            platforms: request.platforms,
            mediaUrl: request.mediaUrl,
          });
          publishResult = {
            success: result.success,
            message: result.success ? 'Published successfully' : Object.values(result.errors || {}).join(', '),
          };
        }
      }
    } catch (error) {
      publishResult = {
        success: false,
        message: (error as Error).message,
      };
      request.status = 'rejected';
    }
  }

  request.publishResult = publishResult;

  if (publishResult.success) {
    await incrementPostCount();
  }

  pending.splice(index, 1);
  await writeFile(`${PATHS.settings}/pending-approvals.json`, pending);

  // Move to approved history
  const history = await loadApprovalHistory();
  history.push(request);
  await writeFile(`${PATHS.settings}/approval-history.json`, history);

  return request;
}

// Reject content
export async function rejectContent(
  requestId: string,
  reviewedBy: string,
  notes: string
): Promise<ApprovalRequest | null> {
  const pending = await loadPendingApprovals();
  const index = pending.findIndex(r => r.id === requestId);
  
  if (index === -1) return null;

  const rejectedRequest: ApprovalRequest = {
    ...pending[index],
    status: 'rejected',
    reviewedAt: new Date().toISOString(),
    reviewedBy,
    notes,
  };
  pending[index] = rejectedRequest;

  await writeFile(`${PATHS.settings}/pending-approvals.json`, pending);
  
  // Move to history
  const history = await loadApprovalHistory();
  history.push(rejectedRequest);
  await writeFile(`${PATHS.settings}/approval-history.json`, history);

  // Remove from pending
  pending.splice(index, 1);
  await writeFile(`${PATHS.settings}/pending-approvals.json`, pending);

  return rejectedRequest;
}

// Load approval history
export async function loadApprovalHistory(): Promise<ApprovalRequest[]> {
  try {
    const history = await readFile<ApprovalRequest[]>(`${PATHS.settings}/approval-history.json`);
    return history || [];
  } catch {
    return [];
  }
}

// Check if content can be auto-published (no human review needed)
export async function canAutoPublish(content: string, platforms: string[]): Promise<boolean> {
  const config = await loadSafetyConfig();
  
  if (!config.allowAutoPublish || config.safeModeEnabled) {
    return false;
  }

  const brandKit = await loadBrandKit();
  const safetyCheck = await runSafetyChecks(content, platforms, brandKit);
  
  return safetyCheck.passed && !safetyCheck.requiresHumanReview && safetyCheck.score >= 0.9;
}

// Enable/disable safe mode
export async function setSafeMode(enabled: boolean): Promise<void> {
  await saveSafetyConfig({ safeModeEnabled: enabled });
}

// Check if safe mode is enabled
export async function isSafeModeEnabled(): Promise<boolean> {
  const config = await loadSafetyConfig();
  return config.safeModeEnabled;
}
