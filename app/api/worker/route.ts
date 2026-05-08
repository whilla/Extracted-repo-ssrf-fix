export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { runSandboxedCode } from '@/lib/services/sandboxRunner';

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
    }
    
    let user = null;
    
    try {
      const { createServerClient } = await import('@supabase/ssr');
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookiesToSet: any[]) {
              try {
                cookiesToSet.forEach(({ name, value, options }: any) =>
                  cookieStore.set(name, value, options)
                );
              } catch {
                // Ignore cookie set errors
              }
            },
          },
        }
      );
      const result = await supabase.auth.getUser();
      if (result.error || !result.data.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      user = result.data.user;
    } catch (error) {
      console.error(
        '[api/worker] Authentication error:',
        error instanceof Error ? error.message : 'Unknown authentication error'
      );
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { code?: string; input?: unknown; timeoutMs?: number };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { code, input, timeoutMs } = body;

    if (!code) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runSandboxedCode(code, input, timeoutMs);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Worker Execution Error' }, { status: 500 });
  }
}
