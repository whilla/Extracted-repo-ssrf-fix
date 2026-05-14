/**
 * Centralized configuration error handling
 * Provides structured, actionable error messages for missing API keys and credentials
 */

export interface ConfigErrorDetails {
  service: string;
  envVar: string;
  kvKey?: string;
  docsUrl?: string;
  setupInstructions?: string;
  severity: 'error' | 'warning';
}

export class ConfigError extends Error {
  public readonly details: ConfigErrorDetails;
  public readonly isConfigError = true;

  constructor(details: ConfigErrorDetails) {
    const message = `${details.service} is not configured. ` +
      `Set ${details.envVar} environment variable` +
      (details.kvKey ? ` or configure ${details.kvKey} in settings` : '') +
      (details.docsUrl ? `. Docs: ${details.docsUrl}` : '');
    
    super(message);
    this.name = 'ConfigError';
    this.details = details;
  }

  toJSON() {
    return {
      error: this.message,
      type: 'ConfigError',
      details: this.details,
    };
  }
}

export function isConfigError(error: unknown): error is ConfigError {
  return error instanceof ConfigError || (error as any)?.isConfigError === true;
}

export function formatConfigErrorResponse(error: unknown) {
  if (isConfigError(error)) {
    return {
      success: false,
      error: error.message,
      configError: true,
      service: error.details.service,
      setupInstructions: error.details.setupInstructions || `Configure ${error.details.envVar} to enable this feature`,
      docsUrl: error.details.docsUrl,
    };
  }
  
  return {
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error',
  };
}

// Preset configurations for common services
export const SERVICE_CONFIGS = {
  shopify: {
    service: 'Shopify',
    envVar: 'SHOPIFY_ACCESS_TOKEN',
    kvKey: 'shopify_access_token',
    docsUrl: 'https://shopify.dev/docs/admin-api',
    setupInstructions: 'Create a custom app in your Shopify admin and generate an Admin API access token',
  },
  amazon: {
    service: 'Amazon SP-API',
    envVar: 'AMAZON_SP_API_CLIENT_SECRET',
    kvKey: 'amazon_sp_api_client_secret',
    docsUrl: 'https://developer-docs.amazon.com/sp-api/',
    setupInstructions: 'Register as an Amazon developer and create SP-API application credentials',
  },
  etsy: {
    service: 'Etsy',
    envVar: 'ETSY_API_KEY',
    kvKey: 'etsy_api_key',
    docsUrl: 'https://developers.etsy.com/',
    setupInstructions: 'Create an Etsy app at https://www.etsy.com/developers to get an API key',
  },
  suno: {
    service: 'Suno AI',
    envVar: 'SUNO_API_KEY',
    kvKey: 'suno_key',
    docsUrl: 'https://suno.ai',
    setupInstructions: 'Get a free API key from Suno AI dashboard',
  },
  elevenlabs: {
    service: 'ElevenLabs',
    envVar: 'ELEVENLABS_API_KEY',
    kvKey: 'elevenlabs_key',
    docsUrl: 'https://elevenlabs.io/docs',
    setupInstructions: 'Sign up at elevenlabs.io and copy your API key from the profile page',
  },
  replicate: {
    service: 'Replicate',
    envVar: 'REPLICATE_API_KEY',
    kvKey: 'replicate_api_key',
    docsUrl: 'https://replicate.com/docs',
    setupInstructions: 'Get a free token from replicate.com/account/api-tokens',
  },
  runway: {
    service: 'RunwayML',
    envVar: 'RUNWAY_API_KEY',
    kvKey: 'runway_key',
    docsUrl: 'https://docs.runwayml.com/',
    setupInstructions: 'Get an API key from your RunwayML account settings',
  },
  ayrshare: {
    service: 'Ayrshare',
    envVar: 'AYRSHARE_API_KEY',
    kvKey: 'ayrshare_key',
    docsUrl: 'https://www.ayrshare.com/docs/',
    setupInstructions: 'Sign up at ayrshare.com and get your API key from the dashboard',
  },
  mailchimp: {
    service: 'Mailchimp',
    envVar: 'MAILCHIMP_API_KEY',
    kvKey: 'mailchimp_api_key',
    docsUrl: 'https://mailchimp.com/developer/',
    setupInstructions: 'Get your API key from Account > Extras > API Keys in Mailchimp',
  },
  klaviyo: {
    service: 'Klaviyo',
    envVar: 'KLAVIYO_API_KEY',
    kvKey: 'klaviyo_api_key',
    docsUrl: 'https://developers.klaviyo.com/',
    setupInstructions: 'Create a private API key in Klaviyo Account Settings > API Keys',
  },
} as const;

export function createConfigError(serviceKey: string): ConfigError {
  const config = (SERVICE_CONFIGS as Record<string, typeof SERVICE_CONFIGS[keyof typeof SERVICE_CONFIGS]>)[serviceKey];
  if (config) {
    return new ConfigError({
      ...config,
      severity: 'error',
    });
  }
  // Generic fallback for unregistered services
  return new ConfigError({
    service: serviceKey.charAt(0).toUpperCase() + serviceKey.slice(1),
    envVar: `${serviceKey.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`,
    kvKey: `${serviceKey.toLowerCase().replace(/[^a-z0-9]/g, '_')}_key`,
    severity: 'error',
  });
}
