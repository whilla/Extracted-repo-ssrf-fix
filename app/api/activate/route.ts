export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
import { activateFullSystem } from '@/lib/services/systemActivation';

// Lazy-load supabase to avoid build-time errors when env vars are missing
let createServerClientFn: any = null;
let supabaseInitialized = false;

async function getSupabaseModule() {
  if (supabaseInitialized) return createServerClientFn;
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabaseModule = await import('@supabase/ssr');
      createServerClientFn = supabaseModule.createServerClient;
    } catch {
      // Module not available, continue without supabase
    }
  }
  
  supabaseInitialized = true;
  return createServerClientFn;
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    let user = null;
    
    // Try to authenticate if Supabase is configured
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
    }

    try {
      const createServerClient = await getSupabaseModule();
      if (!createServerClient) {
        return NextResponse.json({ error: 'Supabase client unavailable' }, { status: 503 });
      }
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
      if (result.error) {
        console.error('Activation auth error:', result.error.message);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      user = result.data.user;
    } catch (error) {
      console.error('Activation auth error:', error);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { goal } = body;

    if (!goal) {
      return NextResponse.json({ error: 'A North Star goal is required for activation.' }, { status: 400 });
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await activateFullSystem(goal);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Activation error:', error);
    return NextResponse.json({ error: 'Activation failed' }, { status: 500 });
  }
}
