import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, type RateLimitConfig } from './rateLimit';

export interface ApiHandlerContext {
  userId?: string;
  isAuthenticated: boolean;
}

export interface AuthResult {
  userId?: string;
  error?: NextResponse;
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
      return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
    return { userId: user.id };
  } catch {
    return { error: NextResponse.json({ error: 'Authentication service unavailable' }, { status: 503 }) };
  }
}

export function checkRateLimit(request: NextRequest, config?: Partial<RateLimitConfig>): NextResponse | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const key = `api:${forwarded}:${request.nextUrl.pathname}`;

  const result = rateLimit({
    maxRequests: config?.maxRequests ?? 60,
    windowMs: config?.windowMs ?? 60000,
    key,
  });

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: `Too many requests. Try again in ${Math.ceil((result.resetAt - Date.now()) / 1000)}s`,
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
          'X-RateLimit-Limit': String(config?.maxRequests ?? 60),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  return null;
}

export async function withApiMiddleware(
  request: NextRequest,
  handler: (context: ApiHandlerContext) => Promise<NextResponse>,
  options?: { requireAuth?: boolean; rateLimitConfig?: Partial<RateLimitConfig> }
): Promise<NextResponse> {
  const rateLimitResponse = checkRateLimit(request, options?.rateLimitConfig);
  if (rateLimitResponse) return rateLimitResponse;

  if (options?.requireAuth !== false) {
    const auth = await authenticateRequest(request);
    if (auth.error) return auth.error;
    return handler({ userId: auth.userId, isAuthenticated: true });
  }

  return handler({ isAuthenticated: false });
}
