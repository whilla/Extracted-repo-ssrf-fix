import { NextRequest, NextResponse } from 'next/server';
import { CredentialVaultService, SecretCredential } from '@/lib/services/credentialVaultService';
import { kvSet, kvGet, kvDel } from '@/lib/services/puterService';

interface CredentialRequest {
  provider: string;
  key: string;
  value: string;
  category?: 'API_KEY' | 'ACCESS_TOKEN' | 'SECRET' | 'CLIENT_ID';
}

interface TestConnectionResponse {
  success: boolean;
  provider: string;
  message: string;
  configured: string[];
}

// Default platform credentials list
const PLATFORM_CREDENTIALS = [
  // AI Providers
  { key: 'openai_api_key', provider: 'openai', label: 'OpenAI API Key' },
  { key: 'anthropic_api_key', provider: 'anthropic', label: 'Anthropic API Key' },
  { key: 'groq_api_key', provider: 'groq', label: 'Groq API Key' },
  { key: 'gemini_api_key', provider: 'gemini', label: 'Google Gemini API Key' },
  
  // Social Platforms
  { key: 'twitter_bearer_token', provider: 'twitter', label: 'Twitter Bearer Token' },
  { key: 'twitter_api_key', provider: 'twitter', label: 'Twitter API Key' },
  { key: 'twitter_api_secret', provider: 'twitter', label: 'Twitter API Secret' },
  { key: 'linkedin_access_token', provider: 'linkedin', label: 'LinkedIn Access Token' },
  { key: 'facebook_access_token', provider: 'facebook', label: 'Facebook Access Token' },
  { key: 'instagram_access_token', provider: 'instagram', label: 'Instagram Access Token' },
  { key: 'tiktok_access_token', provider: 'tiktok', label: 'TikTok Access Token' },
  
  // E-commerce
  { key: 'shopify_api_key', provider: 'shopify', label: 'Shopify API Key' },
  { key: 'shopify_password', provider: 'shopify', label: 'Shopify Password' },
  { key: 'shopify_access_token', provider: 'shopify', label: 'Shopify Access Token' },
  { key: 'amazon_sp_api_key', provider: 'amazon', label: 'Amazon SP-API Key' },
  { key: 'amazon_sp_secret_key', provider: 'amazon', label: 'Amazon SP Secret Key' },
  { key: 'etsy_api_key', provider: 'etsy', label: 'Etsy API Key' },
  
  // Email Services
  { key: 'mailchimp_api_key', provider: 'mailchimp', label: 'Mailchimp API Key' },
  { key: 'klaviyo_api_key', provider: 'klaviyo', label: 'Klaviyo API Key' },
  { key: 'convertkit_api_key', provider: 'convertkit', label: 'ConvertKit API Key' },
  
  // Blogging
  { key: 'wordpress_username', provider: 'wordpress', label: 'WordPress Username' },
  { key: 'wordpress_password', provider: 'wordpress', label: 'WordPress Password' },
  { key: 'medium_token', provider: 'medium', label: 'Medium Integration Token' },
];

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');
    const provider = searchParams.get('provider');

    switch (action) {
      case 'list':
        // List all possible credential configurations
        return NextResponse.json({
          success: true,
          credentials: PLATFORM_CREDENTIALS,
        });

      case 'status':
        // Check which credentials are configured
        if (!provider) {
          return NextResponse.json(
            { success: false, error: 'Provider parameter required' },
            { status: 400 }
          );
        }

        const providerCreds = PLATFORM_CREDENTIALS.filter(c => c.provider === provider);
        const status: Record<string, boolean> = {};
        
        for (const cred of providerCreds) {
          const value = await CredentialVaultService.getSecret(cred.key);
          status[cred.key] = !!value;
        }

        return NextResponse.json({
          success: true,
          provider,
          configured: status,
        });

      case 'test-connection':
        // Test connection to a provider
        if (!provider) {
          return NextResponse.json(
            { success: false, error: 'Provider parameter required' },
            { status: 400 }
          );
        }

        const testResult = await testProviderConnection(provider);
        return NextResponse.json({
          success: true,
          ...testResult,
        });

      default:
        // List all configured credentials (masked)
        const configured: Record<string, string> = {};
        for (const cred of PLATFORM_CREDENTIALS) {
          const value = await CredentialVaultService.getSecret(cred.key);
          if (value) {
            configured[cred.key] = '****' + value.slice(-4);
          }
        }

        return NextResponse.json({
          success: true,
          configured,
        });
    }
  } catch (error) {
    console.error('[Credentials API] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch credentials' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CredentialRequest = await request.json();
    const { provider, key, value, category = 'API_KEY' } = body;

    if (!provider || !key || !value) {
      return NextResponse.json(
        { success: false, error: 'provider, key, and value are required' },
        { status: 400 }
      );
    }

    // Store the credential
    const credential: SecretCredential = {
      key,
      value,
      platform: provider,
      category,
    };

    await CredentialVaultService.setSecret(key, value);

    return NextResponse.json({
      success: true,
      message: `Credential ${key} stored successfully`,
    });
  } catch (error) {
    console.error('[Credentials API] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to store credential' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { success: false, error: 'key parameter required' },
        { status: 400 }
      );
    }

    await kvDel(key);

    return NextResponse.json({
      success: true,
      message: `Credential ${key} deleted`,
    });
  } catch (error) {
    console.error('[Credentials API] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete credential' },
      { status: 500 }
    );
  }
}

async function testProviderConnection(provider: string): Promise<TestConnectionResponse> {
  const configured: string[] = [];
  
  // Check which credentials exist for this provider
  const providerCreds = PLATFORM_CREDENTIALS.filter(c => c.provider === provider);
  
  for (const cred of providerCreds) {
    const value = await CredentialVaultService.getSecret(cred.key);
    if (value) {
      configured.push(cred.key);
    }
  }

  // Basic validation - just check if keys exist
  const hasCredentials = configured.length > 0;

  return {
    success: hasCredentials,
    provider,
    message: hasCredentials
      ? `Found ${configured.length} configured credential(s)`
      : 'No credentials configured',
    configured,
  };
}