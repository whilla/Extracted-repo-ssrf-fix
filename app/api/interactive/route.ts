import { NextRequest, NextResponse } from 'next/server';
import { InteractiveContentService } from '@/lib/services/interactiveContentService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * API endpoint for generating interactive content
 * 
 * POST /api/interactive
 * - Generate infographics, mini games, calculators, quizzes, polls
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { type, ...options } = body;

      if (!type || !['infographic', 'mini_game', 'calculator', 'quiz', 'poll'].includes(type)) {
        return NextResponse.json(
          { success: false, error: 'Invalid or missing type. Must be: infographic, mini_game, calculator, quiz, or poll' },
          { status: 400 }
        );
      }

      if (typeof options !== 'object' || options === null || Array.isArray(options)) {
        return NextResponse.json(
          { success: false, error: 'options must be a valid object' },
          { status: 400 }
        );
      }

      let result;
      switch (type) {
        case 'infographic':
          result = await InteractiveContentService.generateInfographic(options);
          break;
        case 'mini_game':
          result = await InteractiveContentService.generateMiniGame(options);
          break;
        case 'calculator':
          result = await InteractiveContentService.generateCalculator(options);
          break;
        case 'quiz':
          result = await InteractiveContentService.generateQuiz(options);
          break;
        case 'poll':
          result = await InteractiveContentService.generatePoll(options);
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
        html: result.html
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to generate interactive content' },
        { status: 500 }
      );
    }
  });
}
