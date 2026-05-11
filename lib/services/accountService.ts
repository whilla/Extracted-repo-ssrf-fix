'use client';

import { kvGet, kvSet, kvDelete } from './puterService';
import { sanitizeApiKey } from './providerCredentialUtils';

// Provider account types
export interface ProviderAccount {
  provider: string;
  email?: string;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  username?: string;
  tier?: 'free' | 'paid' | 'trial';
  quotaUsed?: number;
  quotaLimit?: number;
  lastVerified?: string;
  status: 'active' | 'expired' | 'invalid' | 'pending';
}

export interface ProviderConfig {
  id: string;
  name: string;
  category: 'voice' | 'music' | 'image' | 'ai' | 'publishing';
  signupUrl: string;
  apiKeyUrl?: string;
  docsUrl?: string;
  freeTier: boolean;
  freeTierLimits?: string;
  requiresApiKey: boolean;
  requiresOAuth?: boolean;
  note?: string;
}

// All supported providers
export const PROVIDERS: ProviderConfig[] = [
  // Voice Providers
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    category: 'voice',
    signupUrl: 'https://elevenlabs.io/sign-up',
    apiKeyUrl: 'https://elevenlabs.io/app/settings/api-keys',
    docsUrl: 'https://elevenlabs.io/docs',
    freeTier: true,
    freeTierLimits: '10,000 characters/month',
    requiresApiKey: true,
  },
  {
    id: 'speechify',
    name: 'Speechify',
    category: 'voice',
    signupUrl: 'https://speechify.com/signup',
    apiKeyUrl: 'https://speechify.com/api',
    docsUrl: 'https://docs.speechify.com',
    freeTier: true,
    freeTierLimits: '10,000 characters/month',
    requiresApiKey: true,
  },
  {
    id: 'playht',
    name: 'Play.ht',
    category: 'voice',
    signupUrl: 'https://play.ht/signup',
    apiKeyUrl: 'https://play.ht/studio/api-access',
    freeTier: true,
    freeTierLimits: '12,500 characters/month',
    requiresApiKey: true,
  },
  {
    id: 'resemble',
    name: 'Resemble AI',
    category: 'voice',
    signupUrl: 'https://app.resemble.ai/signup',
    apiKeyUrl: 'https://app.resemble.ai/api',
    freeTier: true,
    freeTierLimits: '1,000 characters/day',
    requiresApiKey: true,
  },
  // Music Providers
  {
    id: 'suno',
    name: 'Suno AI',
    category: 'music',
    signupUrl: 'https://suno.com/subscribe',
    apiKeyUrl: 'https://suno.com',
    freeTier: false,
    freeTierLimits: 'Subscription required',
    requiresApiKey: true,
    note: 'Suno no longer offers public API. Requires subscription + browser cookie extraction.',
  },
  {
    id: 'udio',
    name: 'Udio',
    category: 'music',
    signupUrl: 'https://www.udio.com/signup',
    freeTier: true,
    freeTierLimits: '1200 credits/month',
    requiresApiKey: true,
  },
  {
    id: 'beatoven',
    name: 'Beatoven.ai',
    category: 'music',
    signupUrl: 'https://www.beatoven.ai/signup',
    freeTier: true,
    freeTierLimits: '15 minutes/month',
    requiresApiKey: true,
  },
  {
    id: 'soundraw',
    name: 'Soundraw',
    category: 'music',
    signupUrl: 'https://soundraw.io/signup',
    freeTier: true,
    freeTierLimits: 'Unlimited preview, paid download',
    requiresApiKey: true,
  },
  // Image Providers
  {
    id: 'puter',
    name: 'Puter AI (DALL-E)',
    category: 'image',
    signupUrl: 'https://puter.com',
    freeTier: true,
    freeTierLimits: 'Built-in, no key required',
    requiresApiKey: false,
  },
  {
    id: 'stability',
    name: 'Stability AI',
    category: 'image',
    signupUrl: 'https://platform.stability.ai/signup',
    apiKeyUrl: 'https://platform.stability.ai/account/keys',
    freeTier: true,
    freeTierLimits: '25 credits free',
    requiresApiKey: true,
  },
  {
    id: 'leonardo',
    name: 'Leonardo AI',
    category: 'image',
    signupUrl: 'https://leonardo.ai/signup',
    freeTier: true,
    freeTierLimits: '150 tokens/day',
    requiresApiKey: true,
  },
  {
    id: 'ideogram',
    name: 'Ideogram',
    category: 'image',
    signupUrl: 'https://ideogram.ai/signup',
    freeTier: true,
    freeTierLimits: '100 images/day',
    requiresApiKey: true,
  },
  // Publishing
  {
    id: 'gemini',
    name: 'Google Gemini',
    category: 'ai',
    signupUrl: 'https://aistudio.google.com/',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    docsUrl: 'https://ai.google.dev/',
    freeTier: true,
    freeTierLimits: 'Free-tier quotas vary by model',
    requiresApiKey: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    category: 'ai',
    signupUrl: 'https://openrouter.ai/',
    apiKeyUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/docs',
    freeTier: false,
    requiresApiKey: true,
  },
  {
    id: 'groq',
    name: 'Groq',
    category: 'ai',
    signupUrl: 'https://console.groq.com/',
    apiKeyUrl: 'https://console.groq.com/keys',
    docsUrl: 'https://console.groq.com/docs',
    freeTier: true,
    freeTierLimits: 'Free developer-tier quotas vary',
    requiresApiKey: true,
  },
  {
    id: 'ayrshare',
    name: 'Ayrshare',
    category: 'publishing',
    signupUrl: 'https://www.ayrshare.com/signup',
    apiKeyUrl: 'https://app.ayrshare.com/dashboard',
    docsUrl: 'https://docs.ayrshare.com',
    freeTier: true,
    freeTierLimits: '1 profile, limited posts',
    requiresApiKey: true,
  },
];

// Get storage key for provider
function getStorageKey(providerId: string, field: string): string {
  return `provider_${providerId}_${field}`;
}

// Save provider account
export async function saveProviderAccount(account: ProviderAccount): Promise<void> {
  const { provider, ...data } = account;
  const sanitizedApiKey = data.apiKey ? sanitizeApiKey(data.apiKey) : '';
  
  // Save each field separately for security
  if (sanitizedApiKey) {
    await kvSet(getStorageKey(provider, 'apiKey'), sanitizedApiKey);
  }
  if (data.accessToken) {
    await kvSet(getStorageKey(provider, 'accessToken'), data.accessToken);
  }
  if (data.refreshToken) {
    await kvSet(getStorageKey(provider, 'refreshToken'), data.refreshToken);
  }
  if (data.email) {
    await kvSet(getStorageKey(provider, 'email'), data.email);
  }
  if (data.username) {
    await kvSet(getStorageKey(provider, 'username'), data.username);
  }
  
  // Save metadata
  const metadata = {
    tier: data.tier || 'free',
    quotaUsed: data.quotaUsed || 0,
    quotaLimit: data.quotaLimit || 0,
    lastVerified: data.lastVerified || new Date().toISOString(),
    expiresAt: data.expiresAt,
    status: data.status,
  };
  await kvSet(getStorageKey(provider, 'metadata'), JSON.stringify(metadata));
  
  // Also save to legacy keys for backwards compatibility
  if (sanitizedApiKey) {
    const legacyKeyMap: Record<string, string> = {
      elevenlabs: 'elevenlabs_key',
      speechify: 'speechify_key',
      suno: 'suno_key',
      ayrshare: 'ayrshare_key',
      gemini: 'gemini_key',
      openrouter: 'openrouter_key',
      groq: 'groq_key',
      stability: 'stability_key',
      leonardo: 'leonardo_key',
      playht: 'playht_key',
      resemble: 'resemble_key',
      beatoven: 'beatoven_key',
      soundraw: 'soundraw_key',
      udio: 'udio_key',
      ideogram: 'ideogram_key',
    };
    const legacyKey = legacyKeyMap[provider];
    if (legacyKey) {
      await kvSet(legacyKey, sanitizedApiKey);
    }
  }
}

// Load provider account
export async function loadProviderAccount(providerId: string): Promise<ProviderAccount | null> {
  try {
    const [apiKey, accessToken, email, username, metadataStr] = await Promise.all([
      kvGet(getStorageKey(providerId, 'apiKey')),
      kvGet(getStorageKey(providerId, 'accessToken')),
      kvGet(getStorageKey(providerId, 'email')),
      kvGet(getStorageKey(providerId, 'username')),
      kvGet(getStorageKey(providerId, 'metadata')),
    ]);
    
    // If no data found, check legacy keys
    if (!apiKey && !accessToken) {
      const legacyKeyMap: Record<string, string> = {
        elevenlabs: 'elevenlabs_key',
        speechify: 'speechify_key',
        suno: 'suno_key',
        ayrshare: 'ayrshare_key',
        gemini: 'gemini_key',
        openrouter: 'openrouter_key',
        groq: 'groq_key',
        stability: 'stability_key',
      };
      const legacyKey = legacyKeyMap[providerId];
      if (legacyKey) {
        const legacyApiKey = await kvGet(legacyKey);
        const sanitizedLegacyApiKey = sanitizeApiKey(legacyApiKey);
        if (sanitizedLegacyApiKey) {
          return {
            provider: providerId,
            apiKey: sanitizedLegacyApiKey,
            status: 'active',
            tier: 'free',
          };
        }
      }
      return null;
    }
    
    const metadata = metadataStr ? JSON.parse(metadataStr) : {};
    
    return {
      provider: providerId,
      apiKey: sanitizeApiKey(apiKey) || undefined,
      accessToken: accessToken || undefined,
      email: email || undefined,
      username: username || undefined,
      ...metadata,
    };
  } catch (error) {
    console.error(`Failed to load account for ${providerId}:`, error);
    return null;
  }
}

// Delete provider account
export async function deleteProviderAccount(providerId: string): Promise<void> {
  await Promise.all([
    kvDelete(getStorageKey(providerId, 'apiKey')),
    kvDelete(getStorageKey(providerId, 'accessToken')),
    kvDelete(getStorageKey(providerId, 'refreshToken')),
    kvDelete(getStorageKey(providerId, 'email')),
    kvDelete(getStorageKey(providerId, 'username')),
    kvDelete(getStorageKey(providerId, 'metadata')),
  ]);
  
  // Also delete legacy key
  const legacyKeyMap: Record<string, string> = {
    elevenlabs: 'elevenlabs_key',
    speechify: 'speechify_key',
    suno: 'suno_key',
    ayrshare: 'ayrshare_key',
  };
  const legacyKey = legacyKeyMap[providerId];
  if (legacyKey) {
    await kvDelete(legacyKey);
  }
}

// Get all connected providers
export async function getConnectedProviders(): Promise<ProviderAccount[]> {
  const accounts: ProviderAccount[] = [];
  
  for (const provider of PROVIDERS) {
    const account = await loadProviderAccount(provider.id);
    if (account && (account.apiKey || account.accessToken)) {
      accounts.push(account);
    }
  }
  
  return accounts;
}

// Verify provider API key
export async function verifyProviderKey(providerId: string, apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const sanitizedApiKey = sanitizeApiKey(apiKey);
    if (!sanitizedApiKey) {
      return { valid: false, error: 'API key is empty after sanitization. Remove whitespace or smart quotes and retry.' };
    }

    switch (providerId) {
      case 'openrouter': {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { 'Authorization': `Bearer ${sanitizedApiKey}` },
        });
        return { valid: response.ok, error: response.ok ? undefined : 'Invalid OpenRouter API key' };
      }

      case 'groq': {
        const response = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { 'Authorization': `Bearer ${sanitizedApiKey}` },
        });
        return { valid: response.ok, error: response.ok ? undefined : 'Invalid Groq API key' };
      }

      case 'gemini': {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
          headers: { 'x-goog-api-key': sanitizedApiKey }
        });
        return { valid: response.ok, error: response.ok ? undefined : 'Invalid Gemini API key' };
      }

      case 'deepseek': {
        const response = await fetch('https://api.deepseek.com/models', {
          headers: { 'Authorization': `Bearer ${sanitizedApiKey}` },
        });
        return { valid: response.ok, error: response.ok ? undefined : 'Invalid DeepSeek API key' };
      }

      case 'suno': {
        // Suno AI uses cookie-based authentication, not API keys
        // Check if it looks like a cookie session or API key
        if (sanitizedApiKey.includes('sunoid=') || sanitizedApiKey.startsWith('suno-')) {
          // Likely a valid session/ID
          return { valid: true };
        }
        // Try the new Suno API endpoint (subscription required)
        const response = await fetch('https://api.suno.ai/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': sanitizedApiKey,
          },
          body: JSON.stringify({ prompt: 'test', makeInstrumental: false }),
        });
        // Even if it fails, we can't easily validate - suggest user check manually
        if (response.status === 401 || response.status === 403) {
          return { valid: false, error: 'Invalid or expired session. Re-login at suno.com and copy your cookie.' };
        }
        return { valid: true };
      }

      case 'elevenlabs': {
        const response = await fetch('https://api.elevenlabs.io/v1/user', {
          headers: { 'xi-api-key': sanitizedApiKey },
        });
        if (response.ok) {
          const data = await response.json();
          return { valid: true };
        }
        return { valid: false, error: 'Invalid API key' };
      }
      
      case 'speechify': {
        // Speechify verification endpoint
        const response = await fetch('https://api.speechify.com/v1/user', {
          headers: { 'Authorization': `Bearer ${sanitizedApiKey}` },
        });
        return { valid: response.ok, error: response.ok ? undefined : 'Invalid API key' };
      }
      
      case 'ayrshare': {
        const response = await fetch('https://api.ayrshare.com/api/user', {
          headers: { 'Authorization': `Bearer ${sanitizedApiKey}` },
        });
        return { valid: response.ok, error: response.ok ? undefined : 'Invalid API key' };
      }
      
      default:
        // For providers without verification, assume valid
        return { valid: true };
    }
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}

// Open signup page and listen for callback
export function openProviderSignup(providerId: string): void {
  const provider = PROVIDERS.find(p => p.id === providerId);
  if (provider) {
    window.open(provider.signupUrl, '_blank', 'noopener,noreferrer,width=600,height=700');
  }
}

// Get provider by ID
export function getProvider(providerId: string): ProviderConfig | undefined {
  return PROVIDERS.find(p => p.id === providerId);
}

// Get providers by category
export function getProvidersByCategory(category: ProviderConfig['category']): ProviderConfig[] {
  return PROVIDERS.filter(p => p.category === category);
}

// Check if provider has free tier
export function hasFreeTier(providerId: string): boolean {
  const provider = PROVIDERS.find(p => p.id === providerId);
  return provider?.freeTier ?? false;
}
