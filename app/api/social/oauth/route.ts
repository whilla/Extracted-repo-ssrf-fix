import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { kvSet, kvGet } from '@/lib/services/puterService';
import { getSupabaseAdminClient } from '@/lib/supabase/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

const PLATFORM_OAUTH_CONFIG: Record<string, {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  tokenStorageKeys: string[];
}> = {
  twitter: {
    authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    clientId: process.env.TWITTER_API_KEY || '',
    clientSecret: process.env.TWITTER_API_SECRET || '',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    tokenStorageKeys: ['twitter_access_token', 'twitter_refresh_token', 'twitter_user_id'],
  },
  linkedin: {
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    clientId: process.env.LINKEDIN_API_KEY || '',
    clientSecret: process.env.LINKEDIN_SECRET || '',
    scopes: ['w_member_social', 'r_liteprofile', 'r_emailaddress'],
    tokenStorageKeys: ['linkedin_access_token', 'linkedin_person_id'],
  },
  facebook: {
    authorizeUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    clientId: process.env.FACEBOOK_API_KEY || '',
    clientSecret: process.env.FACEBOOK_SECRET || '',
    scopes: ['pages_manage_posts', 'pages_read_engagement', 'publish_to_groups'],
    tokenStorageKeys: ['facebook_access_token', 'facebook_page_id'],
  },
  instagram: {
    authorizeUrl: 'https://api.instagram.com/oauth/authorize',
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    clientId: process.env.INSTAGRAM_API_KEY || process.env.FACEBOOK_API_KEY || '',
    clientSecret: process.env.INSTAGRAM_SECRET || process.env.FACEBOOK_SECRET || '',
    scopes: ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_comments'],
    tokenStorageKeys: ['instagram_access_token', 'instagram_business_account_id'],
  },
  tiktok: {
    authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    clientId: process.env.TIKTOK_API_KEY || '',
    clientSecret: process.env.TIKTOK_SECRET || '',
    scopes: ['user.info.basic', 'video.upload', 'video.publish'],
    tokenStorageKeys: ['tiktok_access_token', 'tiktok_open_id'],
  },
};

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async ({ userId }) => {
    const searchParams = request.nextUrl.searchParams;
    const platform = searchParams.get('platform');
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(`${SITE_URL}/settings?oauth_error=${encodeURIComponent(error)}&platform=${platform}`);
    }

    if (!platform) {
      return NextResponse.json({ success: false, error: 'platform parameter required' }, { status: 400 });
    }

    const config = PLATFORM_OAUTH_CONFIG[platform];
    if (!config) {
      return NextResponse.json({ success: false, error: `Unsupported platform: ${platform}` }, { status: 400 });
    }

    if (!config.clientId || !config.clientSecret) {
      return NextResponse.json(
        { success: false, error: `${platform} OAuth not configured. Set API keys in Settings.` },
        { status: 500 }
      );
    }

    if (code && state) {
      return handleCallback(platform, config, code, state, userId || '');
    }

    const csrfState = `${userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    await kvSet(`oauth_state_${state || csrfState}`, csrfState);

    const redirectUri = `${SITE_URL}/api/social/oauth?platform=${platform}`;
    const authorizeUrl = new URL(config.authorizeUrl);
    authorizeUrl.searchParams.set('client_id', config.clientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', config.scopes.join(' '));
    authorizeUrl.searchParams.set('state', csrfState);

    if (platform === 'twitter') {
      authorizeUrl.searchParams.set('code_challenge', 'challenge');
      authorizeUrl.searchParams.set('code_challenge_method', 'plain');
    }

    return NextResponse.redirect(authorizeUrl.toString());
  }, { requireAuth: true });
}

async function handleCallback(
  platform: string,
  config: typeof PLATFORM_OAUTH_CONFIG[string],
  code: string,
  state: string,
  userId: string
): Promise<NextResponse> {
  try {
    const redirectUri = `${SITE_URL}/api/social/oauth?platform=${platform}`;

    let tokenResponse: Response;

    if (platform === 'linkedin') {
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });

      tokenResponse = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody,
      });
    } else if (platform === 'twitter') {
      const credentials = btoa(`${config.clientId}:${config.clientSecret}`);
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: 'challenge',
      });

      tokenResponse = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
        body: tokenBody,
      });
    } else {
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });

      tokenResponse = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody,
      });
    }

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error(`[OAuth ${platform}] Token error:`, errText);
      return NextResponse.redirect(`${SITE_URL}/settings?oauth_error=token_failed&platform=${platform}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return NextResponse.redirect(`${SITE_URL}/settings?oauth_error=no_token&platform=${platform}`);
    }

    await kvSet(config.tokenStorageKeys[0], accessToken);

    if (tokenData.refresh_token) {
      await kvSet(config.tokenStorageKeys[1] || `${platform}_refresh_token`, tokenData.refresh_token);
    }

    if (platform === 'linkedin' && tokenData.id_token) {
      const payload = JSON.parse(atob(tokenData.id_token.split('.')[1]));
      if (payload.sub) {
        await kvSet('linkedin_person_id', payload.sub);
      }
    }

    if (platform === 'facebook' || platform === 'instagram') {
      try {
        const pagesRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`);
        if (pagesRes.ok) {
          const pagesData = await pagesRes.json();
          if (pagesData.data?.length > 0) {
            const page = pagesData.data[0];
            await kvSet('facebook_page_id', page.id);
            await kvSet('facebook_access_token', page.access_token);
            if (platform === 'instagram') {
              const igRes = await fetch(`https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`);
              if (igRes.ok) {
                const igData = await igRes.json();
                if (igData.instagram_business_account) {
                  await kvSet('instagram_business_account_id', igData.instagram_business_account.id);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error(`[OAuth ${platform}] Failed to fetch page info:`, err);
      }
    }

    if (userId) {
      try {
        const supabase = await getSupabaseAdminClient();
        if (supabase) {
          await (supabase as any)
            .from('social_connections')
            .upsert({
              user_id: userId,
              platform,
              access_token: accessToken,
              refresh_token: tokenData.refresh_token || null,
              connected_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,platform',
            });
        }
      } catch (err) {
        console.error(`[OAuth ${platform}] Failed to save connection:`, err);
      }
    }

    return NextResponse.redirect(`${SITE_URL}/settings?oauth_success=${platform}`);
  } catch (error) {
    console.error(`[OAuth ${platform}] Callback error:`, error);
    return NextResponse.redirect(`${SITE_URL}/settings?oauth_error=callback_failed&platform=${platform}`);
  }
}

export async function DELETE(request: NextRequest) {
  return withApiMiddleware(request, async ({ userId }) => {
    const searchParams = request.nextUrl.searchParams;
    const platform = searchParams.get('platform');

    if (!platform) {
      return NextResponse.json({ success: false, error: 'platform parameter required' }, { status: 400 });
    }

    const config = PLATFORM_OAUTH_CONFIG[platform];
    if (!config) {
      return NextResponse.json({ success: false, error: `Unsupported platform: ${platform}` }, { status: 400 });
    }

    for (const key of config.tokenStorageKeys) {
      await kvSet(key, '');
    }

    if (userId) {
      try {
        const supabase = await getSupabaseAdminClient();
        if (supabase) {
          await (supabase as any)
            .from('social_connections')
            .delete()
            .eq('user_id', userId)
            .eq('platform', platform);
        }
      } catch (err) {
        console.error(`[OAuth ${platform}] Failed to delete connection:`, err);
      }
    }

    return NextResponse.json({ success: true, message: `${platform} disconnected` });
  }, { requireAuth: true });
}
