import { NextRequest, NextResponse } from 'next/server';
import { socialMetricsService } from '@/lib/services/socialMetricsService';
import { analyticsService } from '@/lib/services/analyticsService';
import { kvGet } from '@/lib/services/puterService';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const platform = searchParams.get('platform');
    const view = searchParams.get('view') || 'overview';

    // Get Ayrshare key for legacy analytics
    const ayrshareKey = await kvGet('ayrshare_key') as string | null;

    // Fetch real social metrics
    const realMetrics = await socialMetricsService.fetchAllMetrics();

    // Fetch legacy analytics (based on publishing patterns)
    const legacyAnalytics = await analyticsService.fetchAnalytics(ayrshareKey || '');

    let response;

    switch (view) {
      case 'real-time':
        response = {
          success: true,
          view: 'real-time',
          metrics: realMetrics,
          timestamp: new Date().toISOString(),
        };
        break;

      case 'platform':
        if (!platform) {
          return NextResponse.json(
            { success: false, error: 'platform parameter required for platform view' },
            { status: 400 }
          );
        }
        const platformMetric = realMetrics.find(m => m.platform === platform);
        response = {
          success: true,
          view: 'platform',
          platform,
          metrics: platformMetric || null,
        };
        break;

      case 'overview':
      default:
        response = {
          success: true,
          view: 'overview',
          realMetrics,
          publishingAnalytics: {
            engagementRates: legacyAnalytics.engagementRates,
            topHashtags: legacyAnalytics.topHashtags,
            postingTimes: legacyAnalytics.postingTimes,
          },
        };
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Analytics API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'refresh':
        // Force refresh all metrics
        const metrics = await socialMetricsService.fetchAllMetrics();
        return NextResponse.json({
          success: true,
          action: 'refresh',
          metrics,
          refreshedAt: new Date().toISOString(),
        });

      case 'sync':
        // Sync with publishing records
        const ayrshareKey = await kvGet('ayrshare_key') as string | null;
        const analytics = await analyticsService.fetchAnalytics(ayrshareKey || '');
        return NextResponse.json({
          success: true,
          action: 'sync',
          analytics,
        });

      default:
        return NextResponse.json(
          { success: false, error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Analytics API] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
}