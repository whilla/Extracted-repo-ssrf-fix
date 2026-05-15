import { NextRequest, NextResponse } from 'next/server';
import { handleAmazonOAuthCallback, AmazonOAuthConfig } from '@/lib/services/amazonOAuthService';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    const errorDescription = searchParams.get('error_description') || 'Authorization failed';
    return NextResponse.redirect(
      new URL(`/settings?error=amazon_oauth&message=${encodeURIComponent(errorDescription)}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings?error=amazon_oauth&message=Missing authorization code', request.url)
    );
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/amazon/oauth/callback`;

  const config: AmazonOAuthConfig = {
    clientId: process.env.AMAZON_SP_API_CLIENT_ID || '',
    clientSecret: process.env.AMAZON_SP_API_CLIENT_SECRET || '',
    redirectUri: redirectUri,
    region: process.env.AWS_REGION || 'us-east-1',
  };

  // In production, retrieve expected state from session/storage
  // For now, we'll accept any state (less secure)
  const result = await handleAmazonOAuthCallback(code, state, config, state);

  if (!result.success) {
    return NextResponse.redirect(
      new URL(`/settings?error=amazon_oauth&message=${encodeURIComponent(result.error || 'Unknown error')}`, request.url)
    );
  }

  return NextResponse.redirect(new URL('/settings?success=amazon_connected', request.url));
}
