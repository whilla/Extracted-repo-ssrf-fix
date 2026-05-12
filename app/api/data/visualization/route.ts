import { NextRequest, NextResponse } from 'next/server';
import { DataVisualizationService } from '@/lib/services/dataVisualizationService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * API endpoint for data visualization and chart generation
 * 
 * POST /api/data/visualization
 * - Generate charts from CSV data
 * - Create comparison charts
 * 
 * GET /api/data/visualization
 * - Get list of available chart types
 */
export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const chartTypes = ['bar', 'line', 'pie', 'area', 'scatter', 'donut', 'radar'];
      
      return NextResponse.json({
        success: true,
        chartTypes,
        examples: [
          {
            type: 'bar',
            description: 'Compare values across categories',
            sample: 'Category,Value\nProduct A,45\nProduct B,32\nProduct C,67'
          },
          {
            type: 'line',
            description: 'Track changes over time',
            sample: 'Month,Sales\nJan,100\nFeb,150\nMar,200'
          },
          {
            type: 'pie',
            description: 'Show parts of a whole',
            sample: 'Segment,Percentage\nRevenue,45\nCost,30\nProfit,25'
          }
        ]
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to load chart types' },
        { status: 500 }
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { csvData, chartType, title, options } = body;

      if (!csvData || !chartType) {
        return NextResponse.json(
          { success: false, error: 'csvData and chartType are required' },
          { status: 400 }
        );
      }

      const result = await DataVisualizationService.generateFromCSV({
        csvData,
        chartType,
        title: title || 'Data Visualization',
        animated: options?.animated ?? true
      });

      return NextResponse.json({
        success: result.success,
        embedUrl: result.embedUrl,
        html: result.html,
        chartData: result.chartData
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to generate visualization' },
        { status: 500 }
      );
    }
  });
}
