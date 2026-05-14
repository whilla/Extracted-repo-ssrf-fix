export const dynamic = "force-dynamic";
export const maxDuration = 120;
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { executeOrchestrationJob } from '@/lib/services/orchestrationEngine';
import { timingSafeEqual as cryptoTimingSafeEqual } from 'crypto';

interface JobHandler {
  (job: any, supabase: any): Promise<{ success: boolean; result?: any; error?: string; progress?: { percent: number; message: string } }>;
}

const handlers: Record<string, JobHandler> = {};

export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers[type] = handler;
}

// Register built-in job handlers
registerJobHandler('orchestration', async (job, supabase) => {
  const result = await executeOrchestrationJob(job, supabase);
  return result;
});

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    cryptoTimingSafeEqual(aBuf, aBuf);
    return false;
  }
  return cryptoTimingSafeEqual(aBuf, bBuf);
}

async function updateJobProgress(supabase: any, jobId: string, percent: number, message: string): Promise<void> {
  await supabase
    .from('system_jobs')
    .update({ progress: { percent, message }, updated_at: new Date().toISOString() })
    .eq('id', jobId);
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.WORKER_SECRET;

  if (process.env.NODE_ENV === 'production') {
    if (!expectedToken) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    if (token.length !== expectedToken.length || !timingSafeEqual(token, expectedToken)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = (await createClient()) as any;
  if (!supabase) {
    return NextResponse.json({ status: 'error', error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const { maxJobs: rawMaxJobs = 5 } = await request.json().catch(() => ({}));
    const maxJobsInt = parseInt(String(rawMaxJobs), 10);
    if (isNaN(maxJobsInt) || maxJobsInt < 1) {
      return NextResponse.json({ error: 'maxJobs must be an integer between 1 and 1000' }, { status: 400 });
    }
    const maxJobs = Math.min(1000, maxJobsInt);
    let processed = 0;

    while (processed < maxJobs) {
      const { data: job, error: claimError } = await supabase.rpc('claim_next_job');
      if (claimError) throw claimError;
      if (!job) break;

      const handler = handlers[job.job_type];
      if (!handler) {
        await supabase
          .from('system_jobs')
          .update({ status: 'failed', error_message: `No handler registered for job type: ${job.job_type}`, updated_at: new Date().toISOString() })
          .eq('id', job.id);
        processed++;
        continue;
      }

      try {
        const result = await handler(job, supabase);
        if (result.success) {
          await supabase
            .from('system_jobs')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              result: result.result || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id);
        } else {
          const attempts = (job.attempts || 0) + 1;
          const maxAttempts = job.max_attempts || 3;
          const nextStatus = attempts < maxAttempts ? 'pending' : 'failed';
          const update: any = {
            status: nextStatus,
            attempts,
            error_message: result.error || 'Handler returned failure',
            updated_at: new Date().toISOString(),
          };
          if (nextStatus === 'pending') {
            const delayMs = Math.min(30 * 60 * 1000, 60 * 1000 * Math.pow(2, Math.max(0, attempts - 1)));
            update.next_attempt_at = new Date(Date.now() + delayMs).toISOString();
          }
          await supabase.from('system_jobs').update(update).eq('id', job.id);
        }
      } catch (handlerError) {
        const errorMsg = handlerError instanceof Error ? handlerError.message : 'Handler crashed';
        const attempts = (job.attempts || 0) + 1;
        const maxAttempts = job.max_attempts || 3;
        const nextStatus = attempts < maxAttempts ? 'pending' : 'failed';
        const update: any = {
          status: nextStatus,
          attempts,
          error_message: errorMsg,
          updated_at: new Date().toISOString(),
        };
        if (nextStatus === 'pending') {
          const delayMs = Math.min(30 * 60 * 1000, 60 * 1000 * Math.pow(2, Math.max(0, attempts - 1)));
          update.next_attempt_at = new Date(Date.now() + delayMs).toISOString();
        }
        await supabase.from('system_jobs').update(update).eq('id', job.id);
      }

      processed++;
    }

    return NextResponse.json({ status: 'success', processed });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Worker crashed',
    }, { status: 500 });
  }
}
