import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

const PUBLIC_ROUTES = ['/', '/onboarding', '/login', '/signup'];
const PUBLIC_PREFIXES = ['/auth', '/api'];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Allow public access to landing and auth routes even when Supabase is unconfigured
  if (isPublicRoute(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Skip middleware if Supabase is not configured - redirect to landing for protected routes
  if (!supabaseUrl || !supabaseKey) {
    const landingUrl = new URL('/?auth=unconfigured', request.url);
    return NextResponse.redirect(landingUrl);
  }

  try {
    // Check session with a timeout to prevent hanging on slow/unreachable Supabase
    const sessionPromise = (async () => {
      const { supabase, supabaseResponse } = await updateSession(request);
      if (!supabase) return { session: null, supabaseResponse };
      const { data: { session } } = await supabase.auth.getSession();
      return { session, supabaseResponse };
    })();

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 3000);
    });

    const result = await Promise.race([sessionPromise, timeoutPromise]);

    // If session check timed out, allow request through (don't block on slow Supabase)
    if (result === null) {
      console.warn('[Middleware] Supabase session check timed out, allowing request');
      return NextResponse.next();
    }

    const { session, supabaseResponse } = result;

    // Allow public access to landing page and auth routes
    if (request.nextUrl.pathname === '/' || 
        request.nextUrl.pathname.startsWith('/login') || 
        request.nextUrl.pathname.startsWith('/auth')) {
      if (session && request.nextUrl.pathname.startsWith('/login')) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
      return supabaseResponse;
    }

    if (!session) {
      const redirectResponse = NextResponse.redirect(new URL('/login', request.url));
      supabaseResponse.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
          redirectResponse.headers.append('Set-Cookie', value);
        }
      });
      return redirectResponse;
    }

    return supabaseResponse;
  } catch (error) {
    console.error('Middleware error:', error);
    if (isPublicRoute(request.nextUrl.pathname)) {
      return NextResponse.next();
    }
    const landingUrl = new URL('/?auth=unavailable', request.url);
    return NextResponse.redirect(landingUrl);
  }
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest.json).*)'],
};
