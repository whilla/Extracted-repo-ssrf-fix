export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { runSandboxedCode } from '@/lib/services/sandboxRunner';

export async function POST(request: Request) {
  try {
    // Check if Supabase is configured before trying to use it
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    let user = null;
    
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
        const { cookies } = await import('next/headers');
        const supabase = createRouteHandlerClient({ cookies });
        const result = await supabase.auth.getUser();
        user = result.data.user;
      } catch {
        // Continue without auth
      }
    }

    // In demo mode, allow usage without auth when supabase not configured
    const body = await request.json();
    const { code, input, timeoutMs } = body;

    if (!code) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    // If supabase is configured, require auth
    if (supabaseUrl && supabaseAnonKey && !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runSandboxedCode(code, input, timeoutMs);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Worker Execution Error' }, { status: 500 });
  }
}
