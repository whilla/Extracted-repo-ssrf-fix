export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    
    // Demo mode: return empty result if Supabase not configured
    if (!supabase) {
      return NextResponse.json({ 
        success: true, 
        message: 'Supabase not configured - demo mode.',
        stalled_count: 0,
        affected_ids: []
      });
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
