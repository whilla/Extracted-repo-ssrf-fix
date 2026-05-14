/**
 * Environment variable validation utilities
 */

export const validateEnv = (): { valid: boolean; missing: string[] } => {
  const missing: string[] = [];
  
  // Check for required environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    missing.push('NEXT_PUBLIC_SUPABASE_URL');
  }
  
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  
  if (missing.length > 0) {
    console.warn(`[NexusAI] Missing environment variables: ${missing.join(', ')}`);
    console.warn('[NexusAI] Some features may not work without these variables.');
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
};

export const getEnvVar = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.warn(`[NexusAI] Environment variable ${name} is not set`);
  }
  return value || '';
};
