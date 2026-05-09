import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  const supabaseResponse = createClient(request);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Middleware error: Supabase authentication is not configured');
    return new Response('Authentication service unavailable', { status: 503 });
  }

  try {
    const { data: { session } } = await supabaseResponse.auth.getSession();

    if (!session && !request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.pathname.startsWith('/auth')) {
      const redirectResponse = NextResponse.redirect(new URL('/login', request.url));
      supabaseResponse.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
          redirectResponse.headers.append('Set-Cookie', value);
        }
      });
      return redirectResponse;
    }

    if (session && request.nextUrl.pathname.startsWith('/login')) {
      const redirectResponse = NextResponse.redirect(new URL('/dashboard', request.url));
      supabaseResponse.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
          redirectResponse.headers.append('Set-Cookie', value);
        }
      });
      return redirectResponse;
    }
  } catch (error) {
    console.error('Middleware error:', error);
    if (!request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.pathname.startsWith('/auth')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return supabaseResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest.json).*)'],
};
