import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Skip middleware if Supabase is not configured - allow public access
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  try {
    const { supabase, supabaseResponse } = await updateSession(request);
    
    if (!supabase) {
      return NextResponse.next();
    }
    
    const { data: { session } } = await supabase.auth.getSession();

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
    // Fail open: allow access when Supabase is unreachable to prevent app lockout
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest.json).*)'],
};
