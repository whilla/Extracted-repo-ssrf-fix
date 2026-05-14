import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

export async function GET(req: NextRequest) {
  return withApiMiddleware(req, async (context) => {
    try {
      const { searchParams } = new URL(req.url);
      const draftId = searchParams.get('id');

      if (!draftId) {
        return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 });
      }

      const supabase = (await createClient()) as any;
      if (!supabase) {
        return NextResponse.json({ error: 'Database client unavailable' }, { status: 503 });
      }

      const { data, error } = await supabase
        .from('drafts')
        .select('*')
        .eq('id', draftId)
        .eq('user_id', context.userId || '')
        .single();

      if (error) {
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
      }

      return NextResponse.json({ success: true, data });
    } catch {
      return NextResponse.json(
        { error: 'Failed to fetch draft' },
        { status: 500 }
      );
    }
  });
}

export async function POST(req: NextRequest) {
  return withApiMiddleware(req, async (context) => {
    try {
      const body = await req.json();
      const { title, content, id } = body;
      const userId = context.userId;
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const workspaceId = `workspace_${userId}`;

      if (!title || !content) {
        return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
      }

      const supabase = (await createClient()) as any;
      if (!supabase) {
        return NextResponse.json({ error: 'Database client unavailable' }, { status: 503 });
      }

      let result;
      if (id) {
        const { data, error } = await supabase
          .from('drafts')
          .update({
            content,
            name: title,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', context.userId || '')
          .eq('id', id)
          .select();

        if (error) throw error;
        if (!data || data.length === 0) {
          return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
        }
        result = data;
      } else {
        const { data, error } = await supabase
          .from('drafts')
          .insert({
            workspace_id: workspaceId,
            user_id: userId,
            name: title,
            content,
          })
          .select();

        if (error) throw error;
        result = data;
      }

      return NextResponse.json({ success: true, data: result?.[0] });
    } catch {
      return NextResponse.json(
        { error: 'Failed to save draft' },
        { status: 500 }
      );
    }
  });
}
