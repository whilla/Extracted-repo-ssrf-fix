export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { adaptContentForPlatform } from '@/lib/services/platformAdapterService';
import { sanitizeApiKey } from '@/lib/services/providerCredentialUtils';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Professional Server-Side Worker for NexusAI

async function getAyrshareKeyForUser(supabase: any, userId: string): Promise<string | null> {
  // In a production app, this would be an encrypted column in a 'user_secrets' table
  const { data, error } = await supabase
    .from('user_secrets')
    .select('value')
    .eq('user_id', userId)
    .eq('key_name', 'ayrshare_key')
    .single();

  if (error || !data) return null;
  return sanitizeApiKey(data.value);
}

async function processJob(supabase: any, job: any) {
  const userId = job.user_id;
  const apiKey = await getAyrshareKeyForUser(supabase, userId);

  if (!apiKey) {
    return { ok: false, error: 'Ayrshare API key not configured in database' };
  }

  const platforms = job.platforms as string[];
  const text = job.text as string;
  const mediaUrl = job.mediaUrl as string | undefined;
  const hashtags: string[] = [];

  const postIds: Record<string, string> = {};
  const errors: Record<string, string> = {};

  for (const platform of platforms) {
    const adapted = adaptContentForPlatform(text, hashtags, platform as any);
    const finalText = `${adapted.text}\\n\\n${adapted.hashtags.join(' ')}`;

    try {
      const response = await fetch('https://api.ayrshare.com/api/post', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post: finalText,
          platforms: [platform],
          mediaUrls: mediaUrl ? [mediaUrl] : undefined,
        }),
      });

      const data = await response.json();
      if (response.ok && data.id) {
        postIds[platform] = data.id;
      } else {
        errors[platform] = data.error || 'Publish failed';
      }
    } catch (e) {
      errors[platform] = e instanceof Error ? e.message : 'Network error';
    }
  }

  const success = Object.keys(errors).length === 0;
  return { 
    ok: success, 
    postIds, 
    error: success ? undefined : JSON.stringify(errors) 
  };
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.WORKER_SECRET;

  if (process.env.NODE_ENV === 'production') {
    if (!expectedToken) {
      console.error('[api/worker/process] WORKER_SECRET not configured in production');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    if (
      token.length !== expectedToken.length ||
      !timingSafeEqual(token, expectedToken)
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (expectedToken) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    if (
      token.length !== expectedToken.length ||
      !timingSafeEqual(token, expectedToken)
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    console.warn('[api/worker/process] WORKER_SECRET not set - running without authentication');
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({
      status: 'error',
      error: 'Supabase not configured',
    }, { status: 503 });
  }
  const now = new Date().toISOString();

  try {
    // 1. Find the next batch of jobs to process
    const { data: jobs, error: fetchError } = await supabase
      .from('posts_queue')
      .select('*')
      .eq('status', 'queued')
      .lte('scheduledAt', now)
      .limit(10);

    if (fetchError) throw fetchError;
    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ status: 'idle', message: 'No jobs to process' });
    }

    const results = {
      processed: 0,
      posted: 0,
      failed: 0,
      errors: [] as { jobId: string; error: string }[],
    };

    for (const job of jobs as any[]) {
      const jobRecord = job as { id: string; user_id: string; platforms: string[]; text: string; mediaUrl?: string; attempts?: number };
      await (supabase.from('posts_queue') as any).update({ status: 'processing' }).eq('id', jobRecord.id);
      
      const result = await processJob(supabase, jobRecord);
      
      if (result.ok) {
        await (supabase.from('posts_queue') as any).update({ 
          status: 'posted', 
          updated_at: new Date().toISOString() 
        }).eq('id', jobRecord.id);
        results.posted++;
      } else {
        await (supabase.from('posts_queue') as any).update({ 
          status: 'failed', 
          last_error: result.error ?? '', 
          attempts: (jobRecord.attempts || 0) + 1,
          updated_at: new Date().toISOString() 
        }).eq('id', jobRecord.id);
        results.failed++;
        results.errors.push({ jobId: jobRecord.id, error: result.error ?? '' });
      }
      results.processed++;
    }

    return NextResponse.json({
      status: 'success',
      ...results,
    });
  } catch (error) {
    return NextResponse.json({ 
      status: 'error', 
      error: error instanceof Error ? error.message : 'Worker crashed' 
    }, { status: 500 });
  }
}
