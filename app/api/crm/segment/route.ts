import { NextRequest, NextResponse } from 'next/server';
import { CRMService } from '@/lib/services/crmService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * API endpoint for CRM segment operations
 * 
 * POST /api/crm/segment
 * - Create, update, track, or get customer segments
 * 
 * GET /api/crm/segment
 * - Get all segments
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { type, ...data } = body;

      if (!type) {
        return NextResponse.json(
          { success: false, error: 'type is required (create, update, track, get)' },
          { status: 400 }
        );
      }

      let result;
      switch (type) {
        case 'create':
          result = await CRMService.createSegment(data.name, data.criteria);
          break;
        case 'update':
          result = await CRMService.updateSegment(data.segmentId, data.updates);
          break;
        case 'track':
          result = await CRMService.trackInteraction(data);
          break;
        case 'get':
          result = await CRMService.getAllSegments();
          break;
        default:
          return NextResponse.json(
            { success: false, error: 'Unknown CRM operation' },
            { status: 400 }
          );
      }

      return NextResponse.json(
        {
          success: result.success,
          data: result.data,
          error: result.error
        },
        { status: result.success ? 200 : 400 }
      );
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'CRM operation failed' },
        { status: 500 }
      );
    }
  });
}

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const result = await CRMService.getAllSegments();
      return NextResponse.json({
        success: result.success,
        segments: result.data || []
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to get segments' },
        { status: 500 }
      );
    }
  });
}
