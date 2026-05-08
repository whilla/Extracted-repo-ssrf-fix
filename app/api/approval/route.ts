export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
import { getPendingApprovals, updateApprovalStatus, getApprovalQueue } from '@/lib/services/approvalQueueService';

async function getAuthenticatedUser(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  
  try {
    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const { cookies } = await import('next/headers');
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

async function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }
  
  try {
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(supabaseUrl, supabaseKey);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // In demo mode without supabase, allow access with a mock user
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    let user = await getAuthenticatedUser(request);
    
    // Demo mode: create a mock admin user if Supabase not configured
    if (!user && (!supabaseUrl || !supabaseAnonKey)) {
      user = { id: 'demo-user', email: 'demo@example.com' };
    }
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getSupabaseClient();
    
    // Demo mode: skip role check if Supabase not configured
    let userData = null;
    if (supabase) {
      const { data, error: roleError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
      
      if (roleError) {
        console.error('Role check failed:', roleError);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
      userData = data;
    } else {
      // Demo mode: treat as admin
      userData = { role: 'admin' };
    }

    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view');

    if (view === 'all') {
      const queue = await getApprovalQueue();
      return NextResponse.json(queue);
    }

    const pending = await getPendingApprovals();
    return NextResponse.json(pending);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    let user = await getAuthenticatedUser(request);
    
    // Demo mode: create a mock admin user if Supabase not configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!user && (!supabaseUrl || !supabaseAnonKey)) {
      user = { id: 'demo-user', email: 'demo@example.com' };
    }
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getSupabaseClient();
    
    // Demo mode: skip role check if Supabase not configured
    let userData = null;
    if (supabase) {
      const { data, error: roleError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();
      
      if (roleError) {
        console.error('Role check failed:', roleError);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
      userData = data;
    } else {
      // Demo mode: treat as admin
      userData = { role: 'admin' };
    }

    const body = await request.json();
    const { id, status, feedback } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const success = await updateApprovalStatus(id, status, feedback);
    if (!success) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
