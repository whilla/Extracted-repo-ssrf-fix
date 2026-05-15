import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Skip middleware if Supabase is not configured - allow public access
  if (!supabaseUrl || !supabaseKey) {
    // Allow access to public paths and API routes
    if (request.nextUrl.pathname.startsWith('/api/') || 
        request.nextUrl.pathname.startsWith('/_next/') ||
        request.nextUrl.pathname.startsWith('/login') ||
        request.nextUrl.pathname.startsWith('/auth') ||
        request.nextUrl.pathname === '/') {
      return NextResponse.next();
    }
    // For other paths, continue without auth requirement
    return NextResponse.next();
  }

  try {
    const { supabase, supabaseResponse } = await updateSession(request);
    
    // SECURITY FIX: Handle case where supabase is null (not configured)
    if (!supabase) {
      if (request.nextUrl.pathname === '/' || 
          request.nextUrl.pathname.startsWith('/login') || 
          request.nextUrl.pathname.startsWith('/auth')) {
        return NextResponse.next();
      }
      return NextResponse.next();
    }
    
    const { data: { session } } = await supabase.auth.getSession();

    // SECURITY FIX: Allow public access to landing page
    if (request.nextUrl.pathname === '/') {
      return supabaseResponse;
    }

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

    return supabaseResponse;
  } catch (error) {
    console.error('Middleware error:', error);
    // On error, allow access rather than blocking
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest.json).*)'],
};
