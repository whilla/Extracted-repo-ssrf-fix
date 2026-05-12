import { NextRequest, NextResponse } from 'next/server';
import { DataVisualizationService } from '@/lib/services/dataVisualizationService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * API endpoint for comparison chart generation
 * 
 * POST /api/data/comparison
 * - Generate comparison charts between categories
 * - Compare performance across multiple items
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { csvData, title, categories } = body;

      if (!csvData || !categories || !categories.length) {
        return NextResponse.json(
          { success: false, error: 'csvData and categories array are required' },
          { status: 400 }
        );
      }

      const result = await DataVisualizationService.generateComparisonChart({
        csvData,
        title: title || 'Comparison Chart',
        categories
      });

      return NextResponse.json({
        success: result.success,
        embedUrl: result.embedUrl,
        html: result.html
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to generate comparison chart' },
        { status: 500 }
      );
    }
  });
}
