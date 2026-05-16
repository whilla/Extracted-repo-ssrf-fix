/**
 * Server-side credential resolver.
 * For API routes that need to read credentials on the server.
 * Tries env vars first, then Puter KV directly.
 */

import { kvGet } from './puterService';

const ENV_MAP: Record<string, string> = {
  shopify_store_url: 'SHOPIFY_STORE_URL',
  shopify_access_token: 'SHOPIFY_ACCESS_TOKEN',
  shopify_api_key: 'SHOPIFY_API_KEY',
  shopify_password: 'SHOPIFY_PASSWORD',
  aws_access_key_id: 'AWS_ACCESS_KEY_ID',
  aws_secret_access_key: 'AWS_SECRET_ACCESS_KEY',
  aws_region: 'AWS_REGION',
  amazon_api_key: 'AMAZON_API_KEY',
  amazon_pa_api_key: 'AMAZON_PA_API_KEY',
  amazon_pa_secret_key: 'AMAZON_PA_SECRET_KEY',
  amazon_seller_id: 'AMAZON_SELLER_ID',
  amazon_sp_api_key: 'AMAZON_SP_API_KEY',
  amazon_sp_secret_key: 'AMAZON_SP_API_SECRET_KEY',
  amazon_sp_api_refresh_token: 'AMAZON_SP_API_REFRESH_TOKEN',
  amazon_sp_api_client_id: 'AMAZON_SP_API_CLIENT_ID',
  amazon_sp_api_client_secret: 'AMAZON_SP_API_CLIENT_SECRET',
  etsy_api_key: 'ETSY_API_KEY',
  etsy_shop_id: 'ETSY_SHOP_ID',
  discord_webhook_url: 'DISCORD_WEBHOOK_URL',
  reddit_access_token: 'REDDIT_ACCESS_TOKEN',
  reddit_client_id: 'REDDIT_CLIENT_ID',
  ayrshare_key: 'AYRSHARE_API_KEY',
};

const ENCRYPTION_PREFIX = 'SEC_V2_';

export async function serverGetCredential(key: string): Promise<string | null> {
  // 1. Try environment variable first
  const envKey = ENV_MAP[key];
  if (envKey && process.env[envKey]) {
    return process.env[envKey]!;
  }

  // 2. Try exact env var match
  const upperKey = key.toUpperCase().replace(/ /g, '_');
  if (process.env[upperKey]) {
    return process.env[upperKey]!;
  }

  // 3. Fall back to Puter KV
  try {
    const stored = await kvGet(key);
    if (!stored || typeof stored !== 'string') return null;

    // Return raw value if not encrypted (legacy or plaintext)
    if (!stored.startsWith(ENCRYPTION_PREFIX)) return stored;

    // Cannot decrypt Web Crypto encrypted values on server
    // In production, use environment variables instead
    console.warn(`[serverGetCredential] ${key} is encrypted with Web Crypto and cannot be read server-side. Set env var ${envKey || upperKey} instead.`);
    return null;
  } catch {
    return null;
  }
}
