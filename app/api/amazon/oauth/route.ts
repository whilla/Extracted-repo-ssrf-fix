import { NextRequest, NextResponse } from 'next/server';
import { getAmazonAuthUrl, generateOAuthState, AmazonOAuthConfig } from '@/lib/services/amazonOAuthService';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const redirectUri = searchParams.get('redirect_uri') || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/amazon/oauth/callback`;

  const config: AmazonOAuthConfig = {
    clientId: process.env.AMAZON_SP_API_CLIENT_ID || '',
    clientSecret: process.env.AMAZON_SP_API_CLIENT_SECRET || '',
    redirectUri: redirectUri,
    region: process.env.AWS_REGION || 'us-east-1',
  };

  if (!config.clientId) {
    return NextResponse.json(
      { error: 'Amazon SP-API client ID not configured' },
      { status: 500 }
    );
  }

  const state = generateOAuthState();

  // Store state temporarily (in production, use Redis or similar)
  // For now, we'll pass it through the URL
  const authUrl = getAmazonAuthUrl(config, state);

  return NextResponse.redirect(`${authUrl}&state=${state}`);
}
