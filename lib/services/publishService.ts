// Publishing Service - Ayrshare API integration
import type { Platform, ContentDraft } from '@/lib/types';
import { kvGet } from './puterService';
import { validateContent, makeGovernorDecision, evaluateMoodApproval } from './governorService';
import { logPostingEvent, type GenerationSource } from './generationTrackerService';
import { sanitizeApiKey } from './providerCredentialUtils';
import { DirectPublishService } from './directPublishService';
import { publishOrchestrator } from './publishOrchestrator';

const AYRSHARE_API_BASE = 'https://api.ayrshare.com/api';

// Get Ayrshare API key from storage
async function getAyrshareKey(): Promise<string | null> {
  const raw = await kvGet('ayrshare_key');
  const sanitized = sanitizeApiKey(raw);
  return sanitized || null;
}

// Check if Ayrshare is configured
export async function isAyrshareConfigured(): Promise<boolean> {
  const key = await getAyrshareKey();
  return !!key && key.length > 10;
}

// Fetch helper with auth
async function ayrshareRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const key = await getAyrshareKey();
  if (!key) {
    throw new Error('Ayrshare API key not configured');
  }

  const response = await fetch(`${AYRSHARE_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.message || 'Ayrshare API error');
  }

  return response.json();
}

// Platform mapping for Ayrshare
const PLATFORM_MAP: Record<Platform, string> = {
  twitter: 'twitter',
  instagram: 'instagram',
  tiktok: 'tiktok',
  linkedin: 'linkedin',
  facebook: 'facebook',
  threads: 'threads',
  youtube: 'youtube',
  pinterest: 'pinterest',
  discord: 'discord',
  reddit: 'reddit',
  whatsapp: 'whatsapp',
  telegram: 'telegram',
  snapchat: 'snapchat',
  wordpress: 'wordpress',
  medium: 'medium',
  ghost: 'ghost',
  substack: 'substack',
  mailchimp: 'mailchimp',
  klaviyo: 'klaviyo',
  convertkit: 'convertkit',
  general: 'general',
};

interface AyrshareUserDisplayName {
  platform?: string;
  username?: string;
  displayName?: string;
  pageName?: string;
}

interface AyrshareUserResponse {
  activeSocialAccounts?: string[];
  displayNames?: AyrshareUserDisplayName[];
  user?: Record<string, { username?: string }>;
  profiles?: Array<{
    activeSocialAccounts?: string[];
    displayNames?: AyrshareUserDisplayName[];
    user?: Record<string, { username?: string }>;
  }>;
}

function normalizeAyrsharePlatform(platform: string | undefined): string | null {
  if (!platform) return null;

  const normalized = platform.toLowerCase().trim();
  if (normalized === 'x') return 'twitter';
  if (normalized === 'googlebusinessprofile') return 'gmb';
  if (normalized === 'google-business-profile') return 'gmb';
  return normalized;
}

function createEmptyPlatformDetails(): Record<Platform, { connected: boolean; username?: string }> {
  return {
    twitter: { connected: false },
    instagram: { connected: false },
    tiktok: { connected: false },
    linkedin: { connected: false },
    facebook: { connected: false },
    threads: { connected: false },
    youtube: { connected: false },
    pinterest: { connected: false },
    discord: { connected: false },
    reddit: { connected: false },
    whatsapp: { connected: false },
    telegram: { connected: false },
    snapchat: { connected: false },
    wordpress: { connected: false },
    medium: { connected: false },
    ghost: { connected: false },
    substack: { connected: false },
    mailchimp: { connected: false },
    klaviyo: { connected: false },
    convertkit: { connected: false },
    general: { connected: false },
  };
}

function markConnectedPlatform(
  details: Record<Platform, { connected: boolean; username?: string }>,
  connectedPlatforms: Set<Platform>,
  platformId: string | undefined,
  username?: string
): void {
  const normalized = normalizeAyrsharePlatform(platformId);
  if (!normalized) return;

  const match = Object.entries(PLATFORM_MAP).find(([, ayrshareId]) => ayrshareId === normalized);
  if (!match) return;

  const platform = match[0] as Platform;
  connectedPlatforms.add(platform);
  details[platform] = {
    connected: true,
    username: username || details[platform].username,
  };
}

function extractConnectedPlatforms(result: AyrshareUserResponse): {
  platforms: Platform[];
  details: Record<Platform, { connected: boolean; username?: string }>;
} {
  const details = createEmptyPlatformDetails();
  const connectedPlatforms = new Set<Platform>();

  for (const active of result.activeSocialAccounts || []) {
    markConnectedPlatform(details, connectedPlatforms, active, result.user?.[active]?.username);
  }

  for (const entry of result.displayNames || []) {
    markConnectedPlatform(
      details,
      connectedPlatforms,
      entry.platform,
      entry.username || entry.displayName || entry.pageName
    );
  }

  for (const profile of result.profiles || []) {
    for (const active of profile.activeSocialAccounts || []) {
      markConnectedPlatform(details, connectedPlatforms, active, profile.user?.[active]?.username);
    }

    for (const entry of profile.displayNames || []) {
      markConnectedPlatform(
        details,
        connectedPlatforms,
        entry.platform,
        entry.username || entry.displayName || entry.pageName
      );
    }
  }

  return {
    platforms: Array.from(connectedPlatforms),
    details,
  };
}

// Publish a post immediately
export async function publishPost(params: {
  text: string;
  platforms: Platform[];
  mediaUrl?: string;
  mediaUrls?: string[];
  source?: GenerationSource | 'manual';
  generationId?: string;
  automationOutputId?: string;
}): Promise<{
  success: boolean;
  postIds?: Record<string, string>;
  errors?: Record<string, string>;
}> {
  const {
    text,
    platforms,
    mediaUrl,
    mediaUrls,
    source = 'manual',
    generationId,
    automationOutputId,
  } = params;

  const media = mediaUrls || (mediaUrl ? [mediaUrl] : undefined);
  const postIds: Record<string, string> = {};
  const errors: Record<string, string> = {};
  let totalSuccess = false;
  let completeSuccess = true;

  // Process each platform using the Strategic Orchestrator
  await Promise.all(platforms.map(async (platform) => {
    try {
      const result = await publishOrchestrator.routePublish(platform, text, media || []);
      
      if (result.success && result.postId) {
        postIds[platform] = result.postId;
        totalSuccess = true;
      } else {
        errors[platform] = result.error || 'Publishing failed';
        completeSuccess = false;
      }
    } catch (err) {
      errors[platform] = err instanceof Error ? err.message : 'Unknown error';
      completeSuccess = false;
    }
  }));

  const publishResult = {
    success: totalSuccess,
    partialSuccess: totalSuccess && !completeSuccess,
    completeSuccess,
    postIds,
    errors,
  };

  await logPostingEvent({
    source,
    generationId,
    automationOutputId,
    platforms,
    status: publishResult.success ? 'published' : 'failed',
    textPreview: text,
    postIds: publishResult.postIds,
    error: Object.values(publishResult.errors)[0],
  });
  return publishResult;
}

// Schedule a post for later
export async function schedulePost(params: {
  text: string;
  platforms: Platform[];
  scheduledDate: string; // ISO 8601
  mediaUrl?: string;
  mediaUrls?: string[];
  source?: GenerationSource | 'manual';
  generationId?: string;
  automationOutputId?: string;
}): Promise<{
  success: boolean;
  postId?: string;
  error?: string;
}> {
  const {
    text,
    platforms,
    scheduledDate,
    mediaUrl,
    mediaUrls,
    source = 'manual',
    generationId,
    automationOutputId,
  } = params;
  const scheduleTime = new Date(scheduledDate);

  if (Number.isNaN(scheduleTime.getTime())) {
    return {
      success: false,
      error: 'Invalid schedule date provided.',
    };
  }

  if (scheduleTime.getTime() <= Date.now()) {
    return {
      success: false,
      error: 'Scheduled time must be in the future.',
    };
  }

  const moodApproval = await evaluateMoodApproval(text);
  if (!moodApproval.approved) {
    return {
      success: false,
      error: `Mood approval blocked scheduling: ${moodApproval.reasons.join('; ')}`,
    };
  }

  const ayrshareplatforms = platforms.map(p => PLATFORM_MAP[p]);
  const media = mediaUrls || (mediaUrl ? [mediaUrl] : undefined);

  try {
    const result = await ayrshareRequest<{
      id?: string;
      error?: string;
    }>('/post', {
      method: 'POST',
      body: JSON.stringify({
        post: text,
        platforms: ayrshareplatforms,
        mediaUrls: media,
        scheduleDate: scheduledDate,
      }),
    });

    const publishResult = {
      success: !!result.id,
      postId: result.id,
      error: result.error,
    };
    await logPostingEvent({
      source,
      generationId,
      automationOutputId,
      platforms,
      status: publishResult.success ? 'scheduled' : 'failed',
      textPreview: text,
      postIds: publishResult.postId ? { scheduled: publishResult.postId } : undefined,
      error: publishResult.error,
    });
    return publishResult;
  } catch (error) {
    await logPostingEvent({
      source,
      generationId,
      automationOutputId,
      platforms,
      status: 'failed',
      textPreview: text,
      error: (error as Error).message,
    });
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

// Delete a scheduled post
export async function deleteScheduledPost(postId: string): Promise<boolean> {
  try {
    await ayrshareRequest(`/post/${postId}`, { method: 'DELETE' });
    return true;
  } catch {
    return false;
  }
}

// Get connected platforms
export async function getConnectedPlatforms(): Promise<{
  platforms: Platform[];
  details: Record<Platform, { connected: boolean; username?: string }>;
}> {
  const key = await getAyrshareKey();
  if (!key) {
    return {
      platforms: [],
      details: createEmptyPlatformDetails(),
    };
  }

  try {
    const result = await ayrshareRequest<AyrshareUserResponse>('/user');
    const extracted = extractConnectedPlatforms(result);

    if (extracted.platforms.length > 0) {
      return extracted;
    }

    const profilesResult = await ayrshareRequest<AyrshareUserResponse>('/profiles');
    return extractConnectedPlatforms(profilesResult);
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error('Unable to verify connected social platforms.');
  }
}

// Get post history
export async function getPostHistory(limit = 50): Promise<{
  posts: Array<{
    id: string;
    platforms: string[];
    post: string;
    created: string;
    status: string;
  }>;
}> {
  try {
    const result = await ayrshareRequest<{
      posts?: Array<{
        id: string;
        platforms: string[];
        post: string;
        created: string;
        status: string;
      }>;
    }>(`/history?limit=${limit}`);

    return { posts: result.posts || [] };
  } catch {
    return { posts: [] };
  }
}

// Get analytics for a post
export async function getPostAnalytics(postId: string): Promise<{
  analytics?: Record<string, {
    impressions?: number;
    engagements?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  }>;
}> {
  try {
    const result = await ayrshareRequest<{
      analytics?: Record<string, {
        impressions?: number;
        engagements?: number;
        likes?: number;
        comments?: number;
        shares?: number;
      }>;
    }>(`/analytics/post?id=${postId}`);

    return result;
  } catch {
    return {};
  }
}

// Publish draft (helper function)
export async function publishDraft(
  draft: ContentDraft,
  immediate = true
): Promise<{
  success: boolean;
  postIds?: Record<string, string>;
  errors?: Record<string, string>;
}> {
  const latestVersion = draft.versions[draft.versions.length - 1];
  if (!latestVersion) {
    return { success: false, errors: { general: 'No content version found' } };
  }

  if (draft.status !== 'approved' && draft.status !== 'scheduled') {
    return {
      success: false,
      errors: {
        general: `Workflow blocked: draft status "${draft.status}" cannot be published. Move through review -> approved first.`,
      },
    };
  }

  const governorValidation = await validateContent(latestVersion.text, {
    platform: draft.platforms[0],
  });
  const governorDecision = await makeGovernorDecision(governorValidation, {});
  if (!governorDecision.approved) {
    return {
      success: false,
      errors: {
        general: `Governor blocked publish: ${governorDecision.reason}`,
      },
    };
  }

  const moodApproval = await evaluateMoodApproval(latestVersion.text);
  if (!moodApproval.approved) {
    return {
      success: false,
      errors: {
        general: `Mood approval blocked publish: ${moodApproval.reasons.join('; ')}`,
      },
    };
  }

  if (immediate) {
    return publishPost({
      text: latestVersion.text,
      platforms: draft.platforms,
      mediaUrl: latestVersion.imageUrl,
    });
  } else if (draft.scheduledAt) {
    const result = await schedulePost({
      text: latestVersion.text,
      platforms: draft.platforms,
      scheduledDate: draft.scheduledAt,
      mediaUrl: latestVersion.imageUrl,
    });
    
    return {
      success: result.success,
      postIds: result.postId ? { scheduled: result.postId } : undefined,
      errors: result.error ? { general: result.error } : undefined,
    };
  }

  return { success: false, errors: { general: 'No schedule date provided' } };
}
