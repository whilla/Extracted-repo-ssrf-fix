import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    try {
      const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
      const { cookies } = await import('next/headers');
      const cookieStore = cookies();
      const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
      
      await supabase.auth.exchangeCodeForSession(code);
    } catch (error) {
      console.error('Auth callback error:', error);
      return NextResponse.redirect(new URL('/login?error=auth', request.url));
    }
  }

  return NextResponse.redirect(new URL('/dashboard', request.url));
}
