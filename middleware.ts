import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Check if Supabase is configured before importing
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Middleware error: Supabase authentication is not configured');
    return new Response('Authentication service unavailable', { status: 503 });
  }
  
  try {
    const { createMiddlewareClient } = await import('@supabase/auth-helpers-nextjs');
    const supabase = createMiddlewareClient({ req: request, res: response });
    const { data: { session } } = await supabase.auth.getSession();

    // Redirect to login if no session and not on public routes
    if (!session && !request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.pathname.startsWith('/auth')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Redirect to dashboard if session exists and user is on login page
    if (session && request.nextUrl.pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  } catch (error) {
    console.error('Middleware error:', error);
    if (!request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.pathname.startsWith('/auth')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest.json).*)'],
};
