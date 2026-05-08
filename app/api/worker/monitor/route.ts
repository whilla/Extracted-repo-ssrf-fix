export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  // Lazy-load supabase to avoid build-time errors when env vars are missing
  const { createClient } = require('@supabase/supabase-js');
  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
    }
    
    // Define a "stalled" post as one that has been in 'uploading' or 'pending' 
    // for more than 30 minutes without an update.
    const STALL_THRESHOLD_MINUTES = 30;
    const thresholdDate = new Date(Date.now() - STALL_THRESHOLD_MINUTES * 60 * 1000).toISOString();

    const { data: stalledPosts, error } = await supabase
      .from('social_posts')
      .select('id, status, updated_at')
      .in('status', ['pending', 'uploading'])
      .lt('updated_at', thresholdDate);

    if (error) throw error;

    if (!stalledPosts || stalledPosts.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No stalled posts found.' 
      });
    }

    const postIds = stalledPosts.map(p => p.id);
    
    // Mark stalled posts as 'failed' with a specific error message
    const { error: updateError } = await supabase
      .from('social_posts')
      .update({ 
        status: 'failed', 
        error_message: `Post stalled: No update received for over ${STALL_THRESHOLD_MINUTES} minutes.`,
        updated_at: new Date().toISOString() 
      })
      .in('id', postIds);

    if (updateError) throw updateError;

    return NextResponse.json({ 
      success: true, 
      stalled_count: postIds.length,
      affected_ids: postIds
    });

  } catch (error: any) {
    console.error('[api/worker/monitor] Heartbeat error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
