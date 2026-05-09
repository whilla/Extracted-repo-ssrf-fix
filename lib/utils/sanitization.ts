/**
 * Input Sanitization Utilities
 * Provides protection against common injection attacks
 */

import { z } from 'zod';

const sanitizeString = (input: unknown): string => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

const sanitizeObject = (obj: Record<string, unknown>): Record<string, unknown> => {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'string' ? sanitizeString(item) : item
      );
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

export function sanitizeInput<T>(data: unknown, schema: z.ZodSchema<T>): { success: true; data: T } | { success: false; error: string } {
  try {
    const sanitized = typeof data === 'object' && data !== null 
      ? sanitizeObject(data as Record<string, unknown>) 
      : data;
    
    const result = schema.safeParse(sanitized);
    
    if (!result.success) {
      return {
        success: false,
        error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', '),
      };
    }
    
    return { success: true, data: result.data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}

export function sanitizeForSQL(input: string): string {
  return input.replace(/['";\\]/g, '\\$&');
}

export function sanitizeFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);
}

export function sanitizeUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (['http:', 'https:'].includes(url.protocol)) {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function validateAndSanitizeRedirectUrl(url: string | null | undefined, fallback: string): string {
  if (!url) return fallback;
  
  try {
    const parsed = new URL(url, 'http://localhost');
    if (['http:', 'https:'].includes(parsed.protocol)) {
      return parsed.pathname;
    }
  } catch {
    // Invalid URL, use fallback
  }
  
  return fallback;
}

export const commonSchemas = {
  uuid: z.string().uuid('Invalid UUID'),
  email: z.string().email('Invalid email'),
  positiveInt: z.number().int().positive('Must be positive'),
  nonEmptyString: z.string().min(1, 'Cannot be empty').max(1000),
  platform: z.enum(['twitter', 'instagram', 'tiktok', 'linkedin', 'facebook', 'threads', 'youtube', 'pinterest']),
};