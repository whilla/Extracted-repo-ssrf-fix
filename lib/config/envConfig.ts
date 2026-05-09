/**
 * Centralized Environment Configuration
 * Provides type-safe access to environment variables with validation
 */

import { z } from 'zod';

const envSchema = z.object({
  // Supabase (Required)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('Invalid Supabase URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anon key required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

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

  // Publishing
  AYRSHARE_API_KEY: z.string().optional(),

  // N8N
  N8N_URL: z.string().optional(),
  N8N_PORT: z.string().optional(),
  N8N_API_KEY: z.string().optional(),
  N8N_BRIDGE_SECRET: z.string().optional(),
  N8N_ENCRYPTION_KEY: z.string().optional(),

  // External APIs
  REACT_APP_MEDIASTACK_KEY: z.string().optional(),
  REACT_APP_SERPSTACK_KEY: z.string().optional(),
  REACT_APP_USERSTACK_KEY: z.string().optional(),
  REACT_APP_IPSTACK_KEY: z.string().optional(),
  REACT_APP_NUMVERIFY_KEY: z.string().optional(),

  // Worker
  WORKER_SECRET: z.string().optional(),
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
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      NODE_ENV: (process.env.NODE_ENV as EnvConfig['NODE_ENV']) || 'development',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
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