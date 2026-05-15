export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { getServerProviderStatus } from '@/lib/server/aiProviderProxy';

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    return NextResponse.json({
      providers: getServerProviderStatus().map(({ id, configured }) => ({ id, configured })),
    });
  });
}
