import { NextRequest, NextResponse } from 'next/server';
import { CRMService } from '@/lib/services/crmService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * API endpoint for CRM operations
 * 
 * POST /api/crm/customers
 * - Create or update customers
 * - Track engagement
 * - Get customer segments
 * 
 * GET /api/crm/customers
 * - Get all customers
 * - Get customers by stage
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { type, customerId, ...data } = body;

      if (!type) {
        return NextResponse.json(
          { success: false, error: 'type is required (create, update, track, get, segment)' },
          { status: 400 }
        );
      }

      let result;
      switch (type) {
        case 'create':
          result = await CRMService.createCustomer(data);
          break;
        case 'update':
          result = await CRMService.updateCustomer(customerId, data);
          break;
        case 'track':
          result = await CRMService.trackInteraction(data);
          break;
        case 'get':
          result = customerId ? await CRMService.getCustomer(customerId) : await CRMService.getAllCustomers();
          break;
        case 'segment':
          result = await CRMService.getSegmentsByCustomer(customerId);
          break;
        case 'aggregate':
          result = await CRMService.getAggregate();
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
      const { searchParams } = new URL(request.url);
      const type = searchParams.get('type');

      let result;
      switch (type) {
        case 'segments':
          result = await CRMService.getAllSegments();
          break;
        case 'customers':
          result = await CRMService.getAllCustomers();
          break;
        case 'high-value':
          result = await CRMService.getHighValueCustomers();
          break;
        case 'aggregate':
          result = await CRMService.getAggregate();
          break;
        default:
          result = await CRMService.getAllCustomers();
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
        { success: false, error: error instanceof Error ? error.message : 'Failed to get CRM data' },
        { status: 500 }
      );
    }
  });
}
