

import { publishPost, schedulePost } from './publishService';
import { loadQueuedPostJobs, updateQueuedPostJob, type QueuedPostJob } from './postQueueService';
import { trackGenerationPosted, trackGenerationPostFailure } from './generationTrackerService';
import { recordWorkerCompletion, recordWorkerStart } from './workerHeartbeatService';
import { adaptContentForPlatform, type PlatformAdaptedContent } from './platformAdapterService';
import { analyticsService } from './analyticsService';
import type { Platform } from '@/lib/types';

const MAX_UPLOAD_ATTEMPTS = 3;
const SUPPORTED_PLATFORMS = new Set<Platform>([
  'twitter',
  'instagram',
  'tiktok',
  'linkedin',
  'facebook',
  'threads',
  'youtube',
  'pinterest',
]);
const TERMINAL_UPLOAD_ERROR_PATTERNS = [
  /Ayrshare API key not configured/i,
  /Workflow blocked:/i,
  /not publicly reachable/i,
  /Invalid queued post job/i,
];

export interface UploadWorkerReport {
  processed: number;
  posted: number;
  failed: number;
  errors: Array<{ jobId: string; error: string }>;
}

export interface UploadValidationResult {
  valid: boolean;
  errors: string[];
  terminal: boolean;
}

export interface RoutedUploadAdapter extends PlatformAdaptedContent {
  mediaUrl?: string;
  scheduledAt?: string;
}

function isTerminalUploadError(error: string | undefined): boolean {
  if (!error) return false;
  return TERMINAL_UPLOAD_ERROR_PATTERNS.some((pattern) => pattern.test(error));
}

function isPlatform(value: string): value is Platform {
  return SUPPORTED_PLATFORMS.has(value as Platform);
}

function extractHashtags(text: string): string[] {
  return Array.from(new Set((text.match(/#[\p{L}\p{N}_]+/gu) || []).map((tag) => tag.slice(1).toLowerCase())));
}

function removeInlineHashtags(text: string): string {
  return text
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatAdaptedUploadText(adapter: RoutedUploadAdapter): string {
  const hashtags = (adapter as any).hashtags as string[] | undefined;
  const hashtagLine = (hashtags || [])
    .map((tag: string) => (tag.startsWith('#') ? tag : `#${tag}`))
    .join(' ')
    .trim();
  return [(adapter as any).text?.trim() || '', hashtagLine].filter(Boolean).join('\n\n');
}

export function selectNextQueuedPostJob(queue: QueuedPostJob[]): QueuedPostJob | null {
  return [...queue]
    .filter((job) => job.status === 'queued' || (job.status === 'failed' && job.attempts < MAX_UPLOAD_ATTEMPTS))
    .sort((a, b) => {
      const aSchedule = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
      const bSchedule = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
      if (aSchedule !== bSchedule) return aSchedule - bSchedule;
      return a.createdAt.localeCompare(b.createdAt);
    })[0] || null;
}

export function validateQueuedPostJob(job: QueuedPostJob): UploadValidationResult {
  const errors: string[] = [];

  if (!job.text || !job.text.trim()) {
    errors.push('Post text is empty.');
  }

  if (!Array.isArray(job.platforms) || job.platforms.length === 0) {
    errors.push('No target platforms were provided.');
  } else {
    const invalidPlatforms = job.platforms.filter((platform) => !isPlatform(platform));
    if (invalidPlatforms.length > 0) {
      errors.push(`Unsupported platforms: ${invalidPlatforms.join(', ')}.`);
    }
  }

  if (job.attempts >= MAX_UPLOAD_ATTEMPTS) {
    errors.push('Maximum upload attempts reached.');
  }

  if (job.scheduledAt && Number.isNaN(new Date(job.scheduledAt).getTime())) {
    errors.push('Scheduled time is invalid.');
  }

  if (job.mediaUrl && /^(blob:|data:)|^browser-generated$/i.test(job.mediaUrl)) {
    errors.push('Media URL is not publicly reachable. Persist the asset to a hosted URL before uploading.');
  }

  return {
    valid: errors.length === 0,
    errors,
    terminal: errors.some((error) => /platform|attempts|publicly reachable|empty/i.test(error)),
  };
}

export function routeQueuedJobToAdapters(job: QueuedPostJob): RoutedUploadAdapter[] {
  const hashtags = extractHashtags(job.text);
  const cleanText = removeInlineHashtags(job.text) || job.text.trim();

  return job.platforms.map((platform: Platform) => ({
    ...adaptContentForPlatform(cleanText, hashtags, platform),
    mediaUrl: job.mediaUrl,
    scheduledAt: job.scheduledAt,
  }));
}

export async function uploadAdaptedJob(
  job: QueuedPostJob,
  adapters: RoutedUploadAdapter[]
): Promise<{ ok: boolean; postIds?: Record<string, string>; error?: string }> {
  const postIds: Record<string, string> = {};
  const errors: Record<string, string> = {};

  for (const adapter of adapters) {
    const text = formatAdaptedUploadText(adapter);
    if (job.scheduledAt) {
      const scheduled = await schedulePost({
        text,
        platforms: [adapter.platform],
        scheduledDate: job.scheduledAt,
        mediaUrl: adapter.mediaUrl,
        source: 'agent',
        generationId: job.generationId,
      });

      if (scheduled.success) {
        if (scheduled.postId) {
          postIds[adapter.platform] = scheduled.postId;
        }
      } else {
        errors[adapter.platform] = scheduled.error || 'Scheduling failed';
      }
      continue;
    }

    const posted = await publishPost({
      text,
      platforms: [adapter.platform],
      mediaUrl: adapter.mediaUrl,
      source: 'agent',
      generationId: job.generationId,
    });

    if (posted.success) {
      Object.assign(postIds, posted.postIds || {});
    } else {
      errors[adapter.platform] = posted.errors?.general || JSON.stringify(posted.errors || { general: 'Publish failed' });
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, postIds: Object.keys(postIds).length > 0 ? postIds : undefined, error: JSON.stringify(errors) };
  }

  return { ok: true, postIds: Object.keys(postIds).length > 0 ? postIds : undefined };
}

export async function storeUploadResult(
  job: QueuedPostJob,
  result: { ok: boolean; postIds?: Record<string, string>; error?: string }
): Promise<void> {
  if (result.ok) {
    await updateQueuedPostJob(job.id, { status: 'posted', lastError: undefined });
    const { data: analyticsData } = await (analyticsService.updateAnalytics as any)({
      text: job.text,
      platforms: job.platforms,
      scheduledAt: job.scheduledAt,
      publishedAt: new Date().toISOString(),
    });
    if (job.generationId) {
      await trackGenerationPosted(job.generationId, result.postIds);
    }
    return;
  }

  const terminal = isTerminalUploadError(result.error);
  await updateQueuedPostJob(job.id, {
    status: 'failed',
    attempts: terminal ? MAX_UPLOAD_ATTEMPTS : job.attempts + 1,
    lastError: result.error,
  });
  if (job.generationId) {
    await trackGenerationPostFailure(job.generationId, result.error || 'Upload worker failed');
  }
}

async function processJob(
  job: QueuedPostJob
): Promise<{ ok: boolean; postIds?: Record<string, string>; error?: string }> {
  try {
    const validation = validateQueuedPostJob(job);
    if (!validation.valid) {
      return {
        ok: false,
        error: `Invalid queued post job: ${validation.errors.join(' ')}`,
      };
    }

    const adapters = routeQueuedJobToAdapters(job);
    return await uploadAdaptedJob(job, adapters);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown upload worker error' };
  }
}

export async function runUploadWorker(limit = 5): Promise<UploadWorkerReport> {
  const start = Date.now();
  await recordWorkerStart('upload_worker', { limit });
  try {
    const report: UploadWorkerReport = {
      processed: 0,
      posted: 0,
      failed: 0,
      errors: [],
    };

    for (let index = 0; index < limit; index++) {
      const queue = await loadQueuedPostJobs();
      const job = selectNextQueuedPostJob(queue);
      if (!job) break;

      report.processed++;
      await updateQueuedPostJob(job.id, { status: 'processing' });

      const result = await processJob(job);
      if (result.ok) {
        report.posted++;
        await storeUploadResult(job, result);
        continue;
      }

      report.failed++;
      report.errors.push({ jobId: job.id, error: result.error || 'Unknown error' });
      await storeUploadResult(job, result);
    }

    await recordWorkerCompletion('upload_worker', {
      success: report.failed === 0,
      durationMs: Date.now() - start,
      details: {
        processed: report.processed,
        posted: report.posted,
        failed: report.failed,
      },
      error: report.errors[0]?.error,
    });

    return report;
  } catch (error) {
    await recordWorkerCompletion('upload_worker', {
      success: false,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Upload worker crashed',
    });
    throw error;
  }
}
