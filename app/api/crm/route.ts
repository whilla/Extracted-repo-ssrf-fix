import { NextRequest, NextResponse } from 'next/server';
import { CRMService } from '@/lib/services/crmService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

export const crmService = CRMService;

/**
 * API endpoint for CRM operations
 * 
 * POST /api/crm/segments
 * - Get or create audience segments
 * 
 * POST /api/crm/track
 * - Track customer interactions
 * 
 * GET /api/crm/segments
 * - Get all segments with engagement stats
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { type, ...data } = body;

      if (!type) {
        return NextResponse.json(
          { success: false, error: 'type is required (create_segment, track_interaction, get_segments)' },
          { status: 400 }
        );
      }

      let result;
      switch (type) {
        case 'create_segment':
          result = await CRMService.createSegment(data.name, data.criteria);
          break;
        case 'track_interaction':
          result = await CRMService.trackInteraction(data);
          break;
        case 'get_segments':
          result = await CRMService.getAllSegments();
          break;
        case 'update_segment':
          result = await CRMService.updateSegment(data.segmentId, data.updates);
          break;
        default:
          return NextResponse.json(
            { success: false, error: 'Unknown CRM type' },
            { status: 400 }
          );
      }

      return NextResponse.json({ 
        success: result.success, 
        data: result.data, 
        error: result.error 
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to perform CRM operation' },
        { status: 500 }
      );
    }
  });
}

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const result = await CRMService.getAllSegments();
      const segments = result.data || [];

      return NextResponse.json({
        success: result.success,
        segments,
        total: segments.length
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to get segments' },
        { status: 500 }
      );
    }
  });
}
