export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { getUserLocation } from '@/lib/services/ipStackService';

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const location = await getUserLocation();
      return NextResponse.json(location);
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  });
}
