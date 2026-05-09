export const dynamic = "force-dynamic";
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key);
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { post_id, status, live_url, error_message, secret } = body;

    if (secret !== process.env.N8N_BRIDGE_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!post_id || !status) {
      return NextResponse.json({ error: 'Missing post_id or status' }, { status: 400 });
    }

    if (!supabase) {
      console.error('[api/social/update-status] Supabase credentials missing');
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
    }

    const { error } = await supabase
      .from('social_posts')
      .update({ 
        status, 
        live_url, 
        error_message, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', post_id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[api/social/update-status] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
