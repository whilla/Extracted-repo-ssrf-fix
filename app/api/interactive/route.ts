import { NextRequest, NextResponse } from 'next/server';
import { InteractiveContentService } from '@/lib/services/interactiveContentService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { schemas, validateRequest } from '@/lib/utils/validation';

/**
 * API endpoint for generating interactive content
 * 
 * POST /api/interactive
 * - Generate infographics, mini games, calculators, quizzes, polls
 * - Validated input prevents malformed requests
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    // Validate input with Zod schema
    const validation = await validateRequest(request, schemas.interactive);
    if (!validation.success) {
      return validation.response;
    }

    const { type, ...options } = validation.data;

    try {
      let result;
      switch (type) {
        case 'infographic':
          result = await InteractiveContentService.generateInfographic(options as any);
          break;
        case 'mini_game':
          result = await InteractiveContentService.generateMiniGame(options as any);
          break;
        case 'calculator':
          result = await InteractiveContentService.generateCalculator(options as any);
          break;
        case 'quiz':
          result = await InteractiveContentService.generateQuiz(options as any);
          break;
        case 'poll':
          result = await InteractiveContentService.generatePoll(options as any);
          break;
        default:
          return NextResponse.json(
            { success: false, error: 'Unknown interactive content type' },
            { status: 400 }
          );
      }

      return NextResponse.json({
        success: result.success,
        embedUrl: result.embedUrl,
        html: result.html,
        type,
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to generate interactive content' },
        { status: 500 }
      );
    }
  });
}
