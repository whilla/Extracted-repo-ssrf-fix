import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { activateFullSystem } from '@/lib/services/systemActivation';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware handling cookie set.
            }
          },
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { goal } = body;

    if (!goal) {
      return NextResponse.json({ error: 'A North Star goal is required for activation.' }, { status: 400 });
    }

    const result = await activateFullSystem(goal);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Activation failed' }, { status: 500 });
  }
}
