// Amazon SP-API OAuth Flow Service
// Handles the OAuth 2.0 authorization code flow for Amazon Selling Partner API

import { kvGet, kvSet } from './puterService';

export interface AmazonOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  region: string;
}

export interface AmazonOAuthState {
  state: string;
  timestamp: number;
}

export interface AmazonTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

const AMAZON_AUTH_URL = 'https://www.amazon.com/ap/oa';
const AMAZON_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

/**
 * Generate the Amazon OAuth authorization URL
 */
export function getAmazonAuthUrl(config: AmazonOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    scope: 'sellingpartnerapi::migration',
    response_type: 'code',
    redirect_uri: config.redirectUri,
    state: state,
  });

  return `${AMAZON_AUTH_URL}?${params.toString()}`;
}

/**
 * Generate a random state parameter for OAuth flow
 */
export function generateOAuthState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  config: AmazonOAuthConfig
): Promise<AmazonTokenResponse | null> {
  try {
    const response = await fetch(AMAZON_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error_description || `Token exchange failed: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Amazon OAuth token exchange error:', error);
    return null;
  }
}

/**
 * Refresh an expired access token using the refresh token
 */
export async function refreshAmazonToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<AmazonTokenResponse | null> {
  try {
    const response = await fetch(AMAZON_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error_description || `Token refresh failed: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Amazon OAuth token refresh error:', error);
    return null;
  }
}

/**
 * Complete the OAuth flow by handling the callback
 */
export async function handleAmazonOAuthCallback(
  code: string,
  state: string,
  config: AmazonOAuthConfig,
  expectedState: string
): Promise<{ success: boolean; error?: string }> {
  if (state !== expectedState) {
    return { success: false, error: 'State mismatch. Possible CSRF attack.' };
  }

  const tokens = await exchangeCodeForTokens(code, config);
  if (!tokens) {
    return { success: false, error: 'Failed to exchange authorization code for tokens.' };
  }

  // Store the tokens securely
  await kvSet('amazon_sp_api_access_token', tokens.access_token);
  await kvSet('amazon_sp_api_token_expires_at', String(Date.now() + tokens.expires_in * 1000));

  if (tokens.refresh_token) {
    await kvSet('amazon_sp_api_refresh_token', tokens.refresh_token);
  }

  return { success: true };
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidAmazonAccessToken(): Promise<string | null> {
  const accessToken = await kvGet('amazon_sp_api_access_token');
  const expiresAt = await kvGet('amazon_sp_api_token_expires_at');
  const refreshToken = await kvGet('amazon_sp_api_refresh_token');
  const clientId = await kvGet('amazon_sp_api_client_id');
  const clientSecret = await kvGet('amazon_sp_api_client_secret');

  if (!accessToken || !expiresAt) {
    return null;
  }

  // Check if token is expired or about to expire (within 5 minutes)
  const expiresAtMs = parseInt(expiresAt, 10);
  const now = Date.now();
  const fiveMinutesMs = 5 * 60 * 1000;

  if (now + fiveMinutesMs > expiresAtMs) {
    // Token is expired or about to expire, refresh it
    if (!refreshToken || !clientId || !clientSecret) {
      return null;
    }

    const newTokens = await refreshAmazonToken(refreshToken, clientId, clientSecret);
    if (!newTokens) {
      return null;
    }

    await kvSet('amazon_sp_api_access_token', newTokens.access_token);
    await kvSet('amazon_sp_api_token_expires_at', String(now + newTokens.expires_in * 1000));

    return newTokens.access_token;
  }

  return accessToken;
}

/**
 * Generate the Amazon SP-API authorization URL for seller authorization
 */
export function generateSellerAuthUrl(config: AmazonOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    application_id: config.clientId,
    state: state,
    version: 'beta',
  });

  return `https://sellercentral.amazon.com/apps/authorize/consent?${params.toString()}`;
}

/**
 * Get the LWA (Login with Amazon) access token for SP-API calls
 */
export async function getLWAAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string | null> {
  const tokens = await refreshAmazonToken(refreshToken, clientId, clientSecret);
  return tokens?.access_token || null;
}
