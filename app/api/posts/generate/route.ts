/**
 * Post Generation API
 * Generate social media posts with descriptions and emojis
 */

import { NextResponse } from 'next/server';
import { generatePost, generatePostVariations, chatWithAgent, type PostGenerationOptions } from '@/lib/services/postGeneratorService';
import { loadBrandKit } from '@/lib/services/memoryService';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'generate': {
        const { idea, platform, format, tone, includeEmoji, includeDescription, includeHashtags, customInstructions } = params as {
          idea: string;
          platform: string;
          format?: string;
          tone?: string;
          includeEmoji?: boolean;
          includeDescription?: boolean;
          includeHashtags?: boolean;
          customInstructions?: string;
        };

        if (!idea || !platform) {
          return NextResponse.json(
            { error: 'Missing required fields: idea, platform' },
            { status: 400 }
          );
        }

        const validPlatforms = ['twitter', 'instagram', 'tiktok', 'linkedin', 'facebook', 'threads', 'youtube', 'pinterest'];
        if (!validPlatforms.includes(platform)) {
          return NextResponse.json(
            { error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}` },
            { status: 400 }
          );
        }

        const brandKit = await loadBrandKit();

        const post = await generatePost(
          {
            idea,
            platform: platform as PostGenerationOptions['platform'],
            format: format as PostGenerationOptions['format'],
            tone: tone as PostGenerationOptions['tone'],
            includeEmoji: includeEmoji !== false,
            includeDescription: includeDescription !== false,
            includeHashtags: includeHashtags !== false,
            customInstructions,
          },
          brandKit
        );

        return NextResponse.json({
          success: true,
          post,
        });
      }

      case 'variations': {
        const { originalPost, platform, count } = params as {
          originalPost: string;
          platform: string;
          count?: number;
        };

        if (!originalPost || !platform) {
          return NextResponse.json(
            { error: 'Missing required fields: originalPost, platform' },
            { status: 400 }
          );
        }

        const brandKit = await loadBrandKit();
        const variations = await generatePostVariations(originalPost, platform as any, count || 3, brandKit);

        return NextResponse.json({
          success: true,
          variations,
        });
      }

      case 'chat': {
        const { message, recentMessages, purpose } = params as {
          message: string;
          recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
          purpose?: 'content_creation' | 'general' | 'strategy';
        };

        if (!message) {
          return NextResponse.json(
            { error: 'Missing required field: message' },
            { status: 400 }
          );
        }

        const brandKit = await loadBrandKit();
        const response = await chatWithAgent(message, { brandKit, recentMessages, purpose });

        return NextResponse.json({
          success: true,
          response,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Use: generate, variations, or chat` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[api/posts/generate] Error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Post generation failed',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Post Generation API',
    endpoints: {
      POST: {
        actions: {
          generate: 'Generate a new post with emoji description',
          variations: 'Generate variations of an existing post',
          chat: 'Chat with the AI agent',
        },
      },
    },
    example: {
      action: 'generate',
      idea: 'Launching our new product',
      platform: 'twitter',
      format: 'post',
      tone: 'exciting',
      includeEmoji: true,
      includeDescription: true,
    },
  });
}