import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, type RateLimitConfig } from './rateLimit';
import { RateLimiter } from '@/lib/services/rateLimiter';
import { createAuthError, createRateLimitError, formatErrorResponse } from './errors';
import { logger } from './logger';
import { circuitBreakers, CircuitBreakerOpenError } from '@/lib/services/circuitBreaker';

export interface ApiHandlerContext {
  userId?: string;
  isAuthenticated: boolean;
}

export interface AuthResult {
  userId?: string;
  error?: NextResponse;
}

const RATE_LIMIT_ROUTES: Record<string, { windowMs: number; limit: number }> = {
  '/api/ai/chat': { windowMs: 60_000, limit: 20 },
  '/api/orchestrator': { windowMs: 60_000, limit: 5 },
  '/api/posts/generate': { windowMs: 60_000, limit: 10 },
  '/api/video': { windowMs: 60_000, limit: 3 },
  '/api/agent/chat': { windowMs: 60_000, limit: 30 },
  '/api/ecommerce': { windowMs: 60_000, limit: 10 },
  '/api/crm': { windowMs: 60_000, limit: 30 },
  '/api/publish': { windowMs: 60_000, limit: 15 },
  '/api/training': { windowMs: 60_000, limit: 2 },
  '/api/worker': { windowMs: 60_000, limit: 5 },
  '/api/health': { windowMs: 10_000, limit: 30 },
  default: { windowMs: 60_000, limit: 60 },
};

function getRouteRateConfig(pathname: string): { windowMs: number; limit: number } {
  for (const [prefix, config] of Object.entries(RATE_LIMIT_ROUTES)) {
    if (prefix !== 'default' && pathname.startsWith(prefix)) {
      return config;
    }
  }
  return RATE_LIMIT_ROUTES.default;
}

export async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
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
      return { error: NextResponse.json(formatErrorResponse(authError), { status: authError.status }) };
    }
    return { userId: user.id };
  } catch (error) {
    const authError = createAuthError('Authentication service unavailable');
    return { error: NextResponse.json(formatErrorResponse(authError), { status: 503 }) };
  }
}

export async function checkRateLimitDb(
  userId: string,
  pathname: string
): Promise<{ allowed: boolean; remaining: number; response?: NextResponse }> {
  const routeConfig = getRouteRateConfig(pathname);

  try {
    const result = await RateLimiter.checkLimit(userId, {
      windowMs: routeConfig.windowMs,
      limit: routeConfig.limit,
    }, pathname);

    if (!result.allowed) {
      const retryAfter = Math.ceil(routeConfig.windowMs / 1000);
      const rateLimitError = createRateLimitError('Rate limit exceeded', retryAfter);
      return {
        allowed: false,
        remaining: 0,
        response: NextResponse.json(formatErrorResponse(rateLimitError), {
          status: rateLimitError.status,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(routeConfig.limit),
            'X-RateLimit-Remaining': '0',
          },
        }),
      };
    }

    return { allowed: true, remaining: result.remaining };
  } catch (error) {
    return { allowed: true, remaining: -1 };
  }
}

export function checkRateLimitMemory(request: NextRequest, config?: Partial<RateLimitConfig>): NextResponse | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const key = `api:${forwarded}:${request.nextUrl.pathname}`;

  const routeConfig = getRouteRateConfig(request.nextUrl.pathname);
  const result = rateLimit({
    maxRequests: config?.maxRequests ?? routeConfig.limit,
    windowMs: config?.windowMs ?? routeConfig.windowMs,
    key,
  });

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    const rateLimitError = createRateLimitError('Rate limit exceeded', retryAfter);
    return NextResponse.json(formatErrorResponse(rateLimitError), {
      status: rateLimitError.status,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(config?.maxRequests ?? routeConfig.limit),
        'X-RateLimit-Remaining': '0',
      },
    });
  }

  return null;
}

export async function withApiMiddleware(
  request: NextRequest,
  handler: (context: ApiHandlerContext) => Promise<NextResponse>,
  options?: { 
    requireAuth?: boolean; 
    rateLimitConfig?: Partial<RateLimitConfig>;
    skipRateLimit?: boolean;
  }
): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  if (!options?.skipRateLimit) {
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const memoryResult = checkRateLimitMemory(request, options?.rateLimitConfig);
    if (memoryResult) return memoryResult;
  }

  if (options?.requireAuth !== false) {
    const auth = await authenticateRequest(request);
    if (auth.error) return auth.error;

    if (!options?.skipRateLimit && auth.userId) {
      const dbRateLimit = await checkRateLimitDb(auth.userId, pathname);
      if (!dbRateLimit.allowed && dbRateLimit.response) {
        return dbRateLimit.response;
      }
    }

    return handler({ userId: auth.userId, isAuthenticated: true });
  }

  return handler({ isAuthenticated: false });
}

export function withErrorHandling(
  handler: (request: NextRequest) => Promise<NextResponse>
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        const retryAfter = error.nextRetryAt ? Math.ceil((error.nextRetryAt.getTime() - Date.now()) / 1000) : 60;
        return NextResponse.json(
          { error: `Service '${error.circuitName}' is temporarily unavailable. Please retry later.`, retryAfter },
          { status: 503, headers: { 'Retry-After': String(retryAfter) } }
        );
      }

      logger.error('API', '[API] Handler error', {
        error: error instanceof Error ? error.message : String(error),
        path: request.nextUrl.pathname,
        method: request.method,
      });
      
      if (error instanceof Error) {
        return NextResponse.json(
          formatErrorResponse(error),
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}
