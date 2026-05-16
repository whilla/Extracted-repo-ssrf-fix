import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { socialMetricsService } from '@/lib/services/socialMetricsService';

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    const platform = request.nextUrl.searchParams.get('platform');
    const metrics = await socialMetricsService.fetchAllMetrics();

    if (platform) {
      return NextResponse.json({
        success: true,
        platform,
        metrics: metrics.find((metric) => metric.platform === platform) || null,
      });
    }

    return NextResponse.json({ success: true, metrics });
  });
}
