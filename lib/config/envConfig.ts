/**
 * Centralized Environment Configuration
 * Provides type-safe access to environment variables with validation
 */

import { z } from 'zod';

const envSchema = z.object({
  // Supabase (Required)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('Invalid Supabase URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anon key required'),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  // Puter
  NEXT_PUBLIC_PUTER_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_PUTER_APP_ID: z.string().optional(),
  NEXT_PUBLIC_PUTER_BASE_PATH: z.string().optional(),

  // AI Providers
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  NVIDIA_API_KEY: z.string().optional(),

  // Media Providers
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  FAL_API_KEY: z.string().optional(),
  NEXT_PUBLIC_LTX_ENDPOINT: z.string().optional(),
  NEXT_PUBLIC_LTX_OPEN_ENDPOINT: z.string().optional(),
  STABILITY_API_KEY: z.string().optional(),
  IDEOGRAM_API_KEY: z.string().optional(),
  RUNWAYML_API_KEY: z.string().optional(),

  // Publishing
  AYRSHARE_API_KEY: z.string().optional(),

  // N8N
  N8N_URL: z.string().optional(),
  N8N_PORT: z.string().optional(),
  N8N_API_KEY: z.string().optional(),
  N8N_BRIDGE_SECRET: z.string().optional(),
  N8N_ENCRYPTION_KEY: z.string().optional(),
  N8N_HOST: z.string().optional(),

  // External APIs
  REACT_APP_MEDIASTACK_KEY: z.string().optional(),
  REACT_APP_SERPSTACK_KEY: z.string().optional(),
  REACT_APP_USERSTACK_KEY: z.string().optional(),
  REACT_APP_IPSTACK_KEY: z.string().optional(),
  REACT_APP_NUMVERIFY_KEY: z.string().optional(),

  // Monitoring
  SENTRY_DSN: z.string().optional(),

  // Worker
  WORKER_SECRET: z.string().optional(),

  // Token Budget
  TOKEN_BUDGET_TIMEZONE: z.string().default('UTC'),
});

export type EnvConfig = z.infer<typeof envSchema>;

let envConfig: EnvConfig | null = null;
let envValidationError: string | null = null;

export function getEnvConfig(): EnvConfig {
  if (envConfig) {
    return envConfig;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n');
    envValidationError = `Environment validation failed:\n${errors}`;
    console.error('[EnvConfig]', envValidationError);
    
    // Return partial config with defaults for development
    return {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      NODE_ENV: (process.env.NODE_ENV as EnvConfig["NODE_ENV"]) || "development",
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
      LOG_LEVEL: (process.env.LOG_LEVEL as EnvConfig["LOG_LEVEL"]) || "info",
      NEXT_PUBLIC_PUTER_DOMAIN: process.env.NEXT_PUBLIC_PUTER_DOMAIN,
      NEXT_PUBLIC_PUTER_APP_ID: process.env.NEXT_PUBLIC_PUTER_APP_ID,
      NEXT_PUBLIC_PUTER_BASE_PATH: process.env.NEXT_PUBLIC_PUTER_BASE_PATH,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
      ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
      ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
      FAL_API_KEY: process.env.FAL_API_KEY,
      NEXT_PUBLIC_LTX_ENDPOINT: process.env.NEXT_PUBLIC_LTX_ENDPOINT,
      NEXT_PUBLIC_LTX_OPEN_ENDPOINT: process.env.NEXT_PUBLIC_LTX_OPEN_ENDPOINT,
      STABILITY_API_KEY: process.env.STABILITY_API_KEY,
      IDEOGRAM_API_KEY: process.env.IDEOGRAM_API_KEY,
      RUNWAYML_API_KEY: process.env.RUNWAYML_API_KEY,
      AYRSHARE_API_KEY: process.env.AYRSHARE_API_KEY,
      N8N_URL: process.env.N8N_URL,
      N8N_PORT: process.env.N8N_PORT,
      N8N_API_KEY: process.env.N8N_API_KEY,
      N8N_BRIDGE_SECRET: process.env.N8N_BRIDGE_SECRET,
      N8N_ENCRYPTION_KEY: process.env.N8N_ENCRYPTION_KEY,
      N8N_HOST: process.env.N8N_HOST,
      REACT_APP_MEDIASTACK_KEY: process.env.REACT_APP_MEDIASTACK_KEY,
      REACT_APP_SERPSTACK_KEY: process.env.REACT_APP_SERPSTACK_KEY,
      REACT_APP_USERSTACK_KEY: process.env.REACT_APP_USERSTACK_KEY,
      REACT_APP_IPSTACK_KEY: process.env.REACT_APP_IPSTACK_KEY,
      REACT_APP_NUMVERIFY_KEY: process.env.REACT_APP_NUMVERIFY_KEY,
      SENTRY_DSN: process.env.SENTRY_DSN,
      WORKER_SECRET: process.env.WORKER_SECRET,
      TOKEN_BUDGET_TIMEZONE: process.env.TOKEN_BUDGET_TIMEZONE || "UTC",
    };
  }

  envConfig = result.data;
  return envConfig;
}

export function getEnvValidationError(): string | null {
  return envValidationError;
}

export function isProduction(): boolean {
  return getEnvConfig().NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return getEnvConfig().NODE_ENV === 'development';
}

export function isTest(): boolean {
  return getEnvConfig().NODE_ENV === 'test';
}

export function isSupabaseConfigured(): boolean {
  const env = getEnvConfig();
  return !!(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getRequiredEnvVar(name: keyof EnvConfig): string {
  const env = getEnvConfig();
  const value = env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}