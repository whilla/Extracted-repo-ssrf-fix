// Bulk Scheduling Service
import { readFile, writeFile, PATHS } from './puterService';
import { universalChat } from './aiService';
import type { Platform, BrandKit } from '@/lib/types';
import { schedulePost } from './publishService';
import {
  formatPostWithHashtags,
  getPublisherMediaBlockReason,
} from './publishingReadinessService';

export interface BulkPost {
  id: string;
  content: string;
  platforms: Platform[];
  scheduledAt?: string;
  imageUrl?: string;
  hashtags?: string[];
  status: 'pending' | 'scheduled' | 'published' | 'failed';
  error?: string;
  providerPostId?: string;
}

export interface CSVRow {
  content: string;
  platforms: string;
  date?: string;
  time?: string;
  imageUrl?: string;
  hashtags?: string;
}

export interface BulkImportResult {
  success: number;
  failed: number;
  posts: BulkPost[];
  errors: string[];
}

export interface BulkScheduleInput {
  id?: string;
  content?: string;
  text?: string;
  platforms: Platform[];
  scheduledAt?: string;
  imageUrl?: string;
  hashtags?: string[];
  status?: BulkPost['status'];
  error?: string;
}

// Parse CSV content
export function parseCSV(csvContent: string): CSVRow[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const rows: CSVRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: CSVRow = {
      content: '',
      platforms: '',
    };
    
    headers.forEach((header, index) => {
      const value = values[index]?.trim() || '';
      switch (header) {
        case 'content':
        case 'post':
        case 'text':
          row.content = value;
          break;
        case 'platforms':
        case 'platform':
        case 'network':
          row.platforms = value;
          break;
        case 'date':
        case 'schedule_date':
        case 'scheduled_date':
          row.date = value;
          break;
        case 'time':
        case 'scheduled_time':
          row.time = value;
          break;
        case 'image':
        case 'image_url':
        case 'imageurl':
          row.imageUrl = value;
          break;
        case 'hashtags':
        case 'tags':
          row.hashtags = value;
          break;
      }
    });
    
    if (row.content) {
      rows.push(row);
    }
  }
  
  return rows;
}

export async function parseBulkCSV(csvContent: string): Promise<{
  posts: Array<BulkScheduleInput & { schedule_date?: string }>;
  validationErrors: string[];
}> {
  const rows = parseCSV(csvContent);
  const validationErrors: string[] = [];

  const posts = rows.map((row, index) => {
    const parsedPlatforms = row.platforms
      .split(/[,;|]/)
      .map(p => p.trim().toLowerCase())
      .filter(p => ['twitter', 'instagram', 'linkedin', 'facebook', 'tiktok', 'threads', 'youtube', 'pinterest'].includes(p)) as Platform[];

    if (parsedPlatforms.length === 0) {
      validationErrors.push(`Row ${index + 2}: No valid platforms found, defaulting to Twitter`);
    }

    const scheduledAtInput = row.date ? `${row.date}${row.time ? ` ${row.time}` : ''}` : '';
    const scheduledAtDate = scheduledAtInput ? new Date(scheduledAtInput) : null;
    if (row.date && (!scheduledAtDate || Number.isNaN(scheduledAtDate.getTime()))) {
      validationErrors.push(`Row ${index + 2}: Invalid schedule date/time`);
    }

    return {
      id: `bulk_${Date.now()}_${index}`,
      content: row.content,
      text: row.content,
      platforms: parsedPlatforms.length > 0 ? parsedPlatforms : ['twitter' as Platform],
      schedule_date: row.date ? `${row.date}${row.time ? `T${row.time}` : ''}` : undefined,
      scheduledAt: scheduledAtDate && !Number.isNaN(scheduledAtDate.getTime()) ? scheduledAtDate.toISOString() : undefined,
      imageUrl: row.imageUrl || undefined,
      hashtags: row.hashtags ? row.hashtags.split(/[,;|#]/).map(h => h.trim()).filter(Boolean) : undefined,
      status: 'pending' as const,
    };
  });

  return { posts, validationErrors };
}

// Parse a single CSV line (handles quoted values)
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values;
}

// Import posts from CSV
export async function importFromCSV(csvContent: string): Promise<BulkImportResult> {
  const rows = parseCSV(csvContent);
  const posts: BulkPost[] = [];
  const errors: string[] = [];
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    try {
      // Parse platforms
      const platforms = row.platforms
        .split(/[,;|]/)
        .map(p => p.trim().toLowerCase())
        .filter(p => ['twitter', 'instagram', 'linkedin', 'facebook', 'tiktok', 'threads', 'youtube', 'pinterest'].includes(p)) as Platform[];
      
      if (platforms.length === 0) {
        platforms.push('twitter'); // Default
      }
      
      // Parse date/time
      let scheduledAt: string | undefined;
      if (row.date) {
        const dateStr = row.date + (row.time ? ` ${row.time}` : '');
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          scheduledAt = date.toISOString();
        }
      }
      
      // Parse hashtags
      const hashtags = row.hashtags
        ? row.hashtags.split(/[,;|#]/).map(h => h.trim()).filter(Boolean)
        : undefined;
      
      const post: BulkPost = {
        id: `bulk_${Date.now()}_${i}`,
        content: row.content,
        platforms,
        scheduledAt,
        imageUrl: row.imageUrl || undefined,
        hashtags,
        status: 'pending',
      };
      
      posts.push(post);
      success++;
    } catch (error) {
      errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failed++;
    }
  }
  
  return { success, failed, posts, errors };
}

// Generate CSV template
export function generateCSVTemplate(): string {
  const dayOffset = (offset: number) => {
    const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  };

  return `content,platforms,date,time,hashtags,image_url
"This is my first post! 🎉","twitter,instagram","${dayOffset(1)}","10:00","marketing,socialmedia",""
"Another great post","linkedin","${dayOffset(2)}","14:00","business,networking",""
"Video content caption","tiktok,instagram","${dayOffset(3)}","18:00","viral,trending",""`;
}

// Save bulk posts
export async function saveBulkPosts(posts: BulkPost[]): Promise<void> {
  const existing = await getBulkPosts();
  const updated = [...existing, ...posts];
  await writeFile(`${PATHS.drafts}/bulk_posts.json`, updated);
}

export async function scheduleBulkPosts(posts: BulkPost[] | Array<BulkPost & { text?: string }>): Promise<{
  successful: number;
  failed: number;
  total: number;
  errors: string[];
}> {
  const normalized = await Promise.all(posts.map(async (post, index) => {
    const content = post.content || ('text' in post ? post.text : '') || '';
    const scheduledAt = post.scheduledAt;
    const mediaBlockReason = getPublisherMediaBlockReason(post.imageUrl);

    if (!scheduledAt) {
      return {
        id: post.id,
        content,
        platforms: post.platforms,
        scheduledAt,
        imageUrl: post.imageUrl,
        hashtags: post.hashtags,
        status: 'failed' as const,
        error: `Row ${index + 1}: Missing schedule date/time.`,
      };
    }

    if (mediaBlockReason) {
      return {
        id: post.id,
        content,
        platforms: post.platforms,
        scheduledAt,
        imageUrl: post.imageUrl,
        hashtags: post.hashtags,
        status: 'failed' as const,
        error: `Row ${index + 1}: ${mediaBlockReason}`,
      };
    }

    const providerResult = await schedulePost({
      text: formatPostWithHashtags(content, post.hashtags),
      platforms: post.platforms,
      scheduledDate: scheduledAt,
      mediaUrl: post.imageUrl,
      source: 'manual',
    });

    return {
      id: post.id,
      content,
      platforms: post.platforms,
      scheduledAt,
      imageUrl: post.imageUrl,
      hashtags: post.hashtags,
      status: providerResult.success ? 'scheduled' as const : 'failed' as const,
      error: providerResult.success ? undefined : `Row ${index + 1}: ${providerResult.error || 'Publishing provider did not accept the schedule.'}`,
      providerPostId: providerResult.postId,
    };
  }));

  await saveBulkPosts(normalized);
  const errors = normalized
    .map(post => post.error)
    .filter((error): error is string => Boolean(error));
  const successful = normalized.filter(post => post.status === 'scheduled').length;

  return {
    successful,
    failed: normalized.length - successful,
    total: posts.length,
    errors,
  };
}

export function normalizeBulkScheduleInput(post: BulkScheduleInput & { text?: string }): BulkPost {
  return {
    id: post.id || `bulk_${Date.now()}`,
    content: post.content || ('text' in post ? post.text : '') || '',
    platforms: post.platforms,
    scheduledAt: post.scheduledAt,
    imageUrl: post.imageUrl,
    hashtags: post.hashtags,
    status: post.status || 'pending',
    error: post.error,
  };
}

// Get bulk posts
export async function getBulkPosts(): Promise<BulkPost[]> {
  const data = await readFile<BulkPost[]>(`${PATHS.drafts}/bulk_posts.json`, true);
  return data || [];
}

// Update bulk post status
export async function updateBulkPostStatus(
  id: string,
  status: BulkPost['status'],
  error?: string
): Promise<void> {
  const posts = await getBulkPosts();
  const index = posts.findIndex(p => p.id === id);
  
  if (index >= 0) {
    posts[index].status = status;
    if (error) {
      posts[index].error = error;
    }
    await writeFile(`${PATHS.drafts}/bulk_posts.json`, posts);
  }
}

// Delete bulk post
export async function deleteBulkPost(id: string): Promise<void> {
  const posts = await getBulkPosts();
  const filtered = posts.filter(p => p.id !== id);
  await writeFile(`${PATHS.drafts}/bulk_posts.json`, filtered);
}

// Clear all bulk posts
export async function clearBulkPosts(): Promise<void> {
  await writeFile(`${PATHS.drafts}/bulk_posts.json`, []);
}

// Generate posts with AI from topic list
export async function generateBulkPosts(
  topics: string[],
  platforms: Platform[],
  brandKit: BrandKit | null,
  options: {
    tone?: string;
    includeHashtags?: boolean;
    scheduleDays?: number;
  } = {}
): Promise<BulkPost[]> {
  const { tone = brandKit?.tone || 'professional', includeHashtags = true, scheduleDays = 7 } = options;
  
  const prompt = `Generate ${topics.length} social media posts for these topics:

${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

For platforms: ${platforms.join(', ')}
Tone: ${tone}
Brand: ${brandKit?.niche || 'general'}

Return JSON:
{
  "posts": [
    {
      "content": "The post content",
      "hashtags": ${includeHashtags ? '["relevant", "hashtags"]' : '[]'}
    }
  ]
}

Create engaging, platform-appropriate content for each topic.
Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt, { brandKit });
    const parsed = JSON.parse(response);
    
    // Create posts with scheduled times spread over the days
    const now = new Date();
    const hoursPerPost = (scheduleDays * 24) / topics.length;
    
    return parsed.posts.map((p: { content: string; hashtags?: string[] }, i: number) => {
      const scheduledDate = new Date(now.getTime() + (i * hoursPerPost * 60 * 60 * 1000));
      
      return {
        id: `bulk_${Date.now()}_${i}`,
        content: p.content,
        platforms,
        scheduledAt: scheduledDate.toISOString(),
        hashtags: p.hashtags,
        status: 'pending' as const,
      };
    });
  } catch {
    return [];
  }
}

// Validate bulk posts before scheduling
export function validateBulkPosts(posts: BulkPost[]): {
  valid: BulkPost[];
  invalid: Array<{ post: BulkPost; reason: string }>;
} {
  const valid: BulkPost[] = [];
  const invalid: Array<{ post: BulkPost; reason: string }> = [];
  
  for (const post of posts) {
    if (!post.content || post.content.trim().length === 0) {
      invalid.push({ post, reason: 'Content is empty' });
      continue;
    }
    
    if (post.content.length > 5000) {
      invalid.push({ post, reason: 'Content exceeds 5000 characters' });
      continue;
    }
    
    if (post.platforms.length === 0) {
      invalid.push({ post, reason: 'No platforms selected' });
      continue;
    }
    
    if (post.scheduledAt) {
      const scheduledDate = new Date(post.scheduledAt);
      if (scheduledDate < new Date()) {
        invalid.push({ post, reason: 'Scheduled time is in the past' });
        continue;
      }
    }
    
    // Check platform-specific limits
    for (const platform of post.platforms) {
      const limit = getPlatformCharLimit(platform);
      if (post.content.length > limit) {
        invalid.push({ post, reason: `Content exceeds ${platform} limit of ${limit} characters` });
        continue;
      }
    }
    
    valid.push(post);
  }
  
  return { valid, invalid };
}

function getPlatformCharLimit(platform: Platform): number {
  const limits: Record<Platform, number> = {
    twitter: 280,
    instagram: 2200,
    linkedin: 3000,
    facebook: 63206,
    tiktok: 2200,
    threads: 500,
    youtube: 5000,
    pinterest: 500,
    discord: 2000,
    reddit: 40000,
    whatsapp: 65536,
    telegram: 4096,
    snapchat: 1000,
    wordpress: 50000,
    medium: 100000,
    ghost: 50000,
    substack: 100000,
    mailchimp: 10000,
    klaviyo: 10000,
    convertkit: 10000,
    general: 10000,
  };
  
  return limits[platform] || 5000;
}
