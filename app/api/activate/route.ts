export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
import { activateFullSystem } from '@/lib/services/systemActivation';

// Lazy-load supabase to avoid build-time errors when env vars are missing
let supabaseClient: any = null;
let supabaseInitialized = false;

function getSupabaseClient() {
  if (supabaseInitialized) return supabaseClient;
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (supabaseUrl && supabaseAnonKey) {
    try {
      // Use dynamic import to avoid build failures
      const { createServerClient } = require('@supabase/ssr');
      supabaseClient = createServerClient;
    } catch {
      // Module not available, continue without supabase
    }
  }
  
  supabaseInitialized = true;
  return supabaseClient;
}

export async function POST(request: NextRequest) {
  try {
    const createServerClient = getSupabaseClient();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    let user = null;
    
    // Try to authenticate if Supabase is configured
    if (createServerClient && supabaseUrl && supabaseAnonKey) {
      try {
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
                cookiesToSet.forEach(({ name, value, options }: any) =>
                  cookieStore.set(name, value, options)
                );
              },
            },
          }
        );
        const result = await supabase.auth.getUser();
        user = result.data.user;
      } catch {
        // Auth failed, proceed without user
      }
    }

    // In demo mode, allow activation without auth when supabase not configured
    const body = await request.json();
    const { goal } = body;

    if (!goal) {
      return NextResponse.json({ error: 'A North Star goal is required for activation.' }, { status: 400 });
    }

    // If we have user auth, require it. Otherwise allow demo mode.
    if (supabaseUrl && supabaseAnonKey && !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await activateFullSystem(goal);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Activation error:', error);
    return NextResponse.json({ error: 'Activation failed' }, { status: 500 });
  }
}
