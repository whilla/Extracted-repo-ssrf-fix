import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const draftId = searchParams.get('id');

  if (!draftId) {
    return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('drafts')
    .select('*')
    .eq('id', draftId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, content, owner_id, id } = body;

    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
    }

    let result;
    if (id) {
      // Update existing draft
      const { data, error } = await supabase
        .from('drafts')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select();
      
      if (error) throw error;
      result = data;
    } else {
      // Create new draft
      const { data, error } = await supabase
        .from('drafts')
        .insert({ title, content, owner_id })
        .select();
      
      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ success: true, data: result[0] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
