import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, type RateLimitConfig } from './rateLimit';
import { createAuthError, createRateLimitError, formatErrorResponse } from './errors';
import { logger } from './logger';

export interface ApiHandlerContext {
  userId?: string;
  isAuthenticated: boolean;
}

export interface AuthResult {
  userId?: string;
  error?: NextResponse;
}

/**
 * Enhanced authentication with structured error handling
 */
export async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    logger.error('[Auth] Supabase not configured');
    return {};
  }

  try {
    const { createServerClient } = await import('@supabase/ssr');
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: any[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }: any) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    });

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      const authError = createAuthError('Unauthorized');
      logger.warn('[Auth] Authentication failed', {
        error: error?.message,
        path: request.nextUrl.pathname,
      });
      return { error: NextResponse.json(formatErrorResponse(authError), { status: authError.status }) };
    }
    return { userId: user.id };
  } catch (error) {
    const authError = createAuthError('Authentication service unavailable');
    logger.error('[Auth] Authentication service error', {
      error: error instanceof Error ? error.message : String(error),
      path: request.nextUrl.pathname,
    });
    return { error: NextResponse.json(formatErrorResponse(authError), { status: 503 }) };
  }
}

/**
 * Enhanced rate limiting with structured error handling
 */
export function checkRateLimit(request: NextRequest, config?: Partial<RateLimitConfig>): NextResponse | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const key = `api:${forwarded}:${request.nextUrl.pathname}`;

  const result = rateLimit({
    maxRequests: config?.maxRequests ?? 60,
    windowMs: config?.windowMs ?? 60000,
    key,
  });

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    const rateLimitError = createRateLimitError('Rate limit exceeded', retryAfter);
    logger.warn('[RateLimit] Exceeded', {
      key,
      retryAfter,
      path: request.nextUrl.pathname,
    });
    return NextResponse.json(formatErrorResponse(rateLimitError), {
      status: rateLimitError.status,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(config?.maxRequests ?? 60),
        'X-RateLimit-Remaining': '0',
      },
    });
  }

  return null;
}

/**
 * CSRF protection middleware
 */
export function verifyCSRF(request: NextRequest): NextResponse | null {
  const csrfToken = request.headers.get('x-csrf-token');
  const expectedToken = request.cookies.get('csrf_token')?.value;

  // Allow GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return null;
  }

  if (!csrfToken || !expectedToken || csrfToken !== expectedToken) {
    logger.warn('[CSRF] Invalid CSRF token', {
      method: request.method,
      path: request.nextUrl.pathname,
    });
    return NextResponse.json(
      { error: 'Invalid CSRF token' },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Enhanced API middleware with error handling and CSRF protection
 */
export async function withApiMiddleware(
  request: NextRequest,
  handler: (context: ApiHandlerContext) => Promise<NextResponse>,
  options?: { 
    requireAuth?: boolean; 
    rateLimitConfig?: Partial<RateLimitConfig>;
    requireCSRF?: boolean;
  }
): Promise<NextResponse> {
  // CSRF protection
  if (options?.requireCSRF !== false) {
    const csrfResponse = verifyCSRF(request);
    if (csrfResponse) return csrfResponse;
  }

  // Rate limiting
  const rateLimitResponse = checkRateLimit(request, options?.rateLimitConfig);
  if (rateLimitResponse) return rateLimitResponse;

  // Authentication
  if (options?.requireAuth !== false) {
    const auth = await authenticateRequest(request);
    if (auth.error) return auth.error;
    return handler({ userId: auth.userId, isAuthenticated: true });
  }

  return handler({ isAuthenticated: false });
}

/**
 * Error handling middleware wrapper
 */
export function withErrorHandling(
  handler: (request: NextRequest) => Promise<NextResponse>
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      return await handler(request);
    } catch (error) {
      logger.error('[API] Handler error', {
        error: error instanceof Error ? error.message : String(error),
        path: request.nextUrl.pathname,
        method: request.method,
      });
      
      if (error instanceof Error) {
        return NextResponse.json(
          formatErrorResponse(error),
          { status: error instanceof Error ? 500 : 400 }
        );
      }
      
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}
