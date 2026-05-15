import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Zod validation schemas for API inputs
 * Centralized validation prevents malformed data from reaching services
 */

export const schemas = {
  // Commerce
  shopify: z.object({
    content: z.string().min(1).max(50000),
    title: z.string().min(1).max(255),
    productId: z.string().optional(),
  }),
  
  amazon: z.object({
    content: z.string().min(1).max(50000),
    title: z.string().min(1).max(255),
    category: z.string().optional(),
  }),
  
  etsy: z.object({
    content: z.string().min(1).max(50000),
    title: z.string().min(1).max(140),
    category: z.string().optional(),
  }),
  
  // Interactive content
  interactive: z.object({
    type: z.enum(['infographic', 'mini_game', 'calculator', 'quiz', 'poll']),
    title: z.string().min(1).max(200).optional(),
    data: z.array(z.object({
      label: z.string(),
      value: z.number(),
      color: z.string().optional(),
    })).optional(),
    layout: z.enum(['bar', 'pie', 'line', 'comparison']).optional(),
    theme: z.enum(['dark', 'light', 'brand']).optional(),
  }),
  
  // CRM
  crmCustomer: z.object({
    email: z.string().email(),
    name: z.string().min(1).max(200),
    source: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  
  crmSegment: z.object({
    name: z.string().min(1).max(200),
    criteria: z.object({
      tag: z.string().optional(),
      engagementScore: z.number().min(0).max(100).optional(),
    }).optional(),
  }),
  
  // Predictive
  predictive: z.object({
    content: z.string().min(1).max(10000),
    platform: z.enum(['instagram', 'tiktok', 'twitter', 'linkedin', 'facebook', 'youtube']).default('instagram'),
    contentType: z.enum(['video', 'image', 'text', 'carousel']).default('text'),
    hashtags: z.array(z.string()).optional(),
    topic: z.string().optional(),
  }),
  
  // Compliance
  compliance: z.object({
    content: z.string().min(1).max(50000),
    regions: z.array(z.enum(['us', 'eu', 'uk', 'ca', 'au', 'jp', 'cn', 'in', 'br', 'de', 'fr', 'es'])).min(1),
    action: z.enum(['verify_copyright', 'check_fair_use', 'generate_alternatives']).optional(),
    autoDetect: z.boolean().optional(),
    purpose: z.string().optional(),
  }),
  
  // Spatial
  spatial3D: z.object({
    prompt: z.string().min(1).max(1000),
    style: z.enum(['realistic', 'cartoon', 'abstract', 'low_poly']).default('realistic'),
    outputFormat: z.enum(['glb', 'gltf', 'usdz']).default('glb'),
  }),
  
  // Data visualization
  dataViz: z.object({
    csvData: z.string().min(1).max(100000),
    chartType: z.enum(['bar', 'line', 'pie', 'area', 'scatter', 'donut', 'radar']).default('bar'),
    title: z.string().max(200).optional(),
    xAxisLabel: z.string().max(100).optional(),
    yAxisLabel: z.string().max(100).optional(),
    colors: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).optional(),
    animated: z.boolean().default(true),
  }),
  
  // Publishing
  publish: z.object({
    text: z.string().min(1).max(10000),
    platforms: z.array(z.string()).min(1),
    mediaUrl: z.string().url().optional(),
    scheduledAt: z.string().datetime().optional(),
    idempotencyKey: z.string().uuid().optional(),
  }),
  
  // AI Chat
  chat: z.object({
    messages: z.array(z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.union([z.string(), z.array(z.any())]),
    })).min(1),
    model: z.string().optional(),
    stream: z.boolean().default(false),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).max(128000).optional(),
  }),
  
  // Posts queue
  queueJob: z.object({
    text: z.string().min(1).max(10000),
    platforms: z.array(z.string()).min(1),
    mediaUrl: z.string().url().optional(),
    scheduledAt: z.string().datetime().optional(),
    idempotencyKey: z.string().uuid().optional(),
    maxAttempts: z.number().min(1).max(10).default(3),
  }),
};

/**
 * Validate request body against a Zod schema
 * Returns validated data or an error response
 */
export async function validateRequest<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      
      return {
        success: false,
        response: NextResponse.json(
          {
            success: false,
            error: 'Validation failed',
            details: errors,
          },
          { status: 400 }
        ),
      };
    }
    
    return { success: true, data: result.data };
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      ),
    };
  }
}

/**
 * Middleware wrapper that validates before executing handler
 */
export function withValidation<T>(
  schema: z.ZodSchema<T>,
  handler: (data: T, request: NextRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const validation = await validateRequest(request, schema);
    if (!validation.success) {
      return validation.response;
    }
    return handler(validation.data, request);
  };
}
