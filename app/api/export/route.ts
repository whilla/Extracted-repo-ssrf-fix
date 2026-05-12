import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { CRMService } from '@/lib/services/crmService';
import { loadBrandKit, listPublishedContent } from '@/lib/services/memoryService';

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const type = searchParams.get('type') || 'crm';
      const format = searchParams.get('format') || 'json';

      let data: any[] = [];
      let filename = '';

      switch (type) {
        case 'crm': {
          const result = await CRMService.getAllCustomers();
          if (result.success && result.data) data = result.data;
          filename = 'nexus-crm-export';
          break;
        }
        case 'segments': {
          const result = await CRMService.getAllSegments();
          if (result.success && result.data) data = result.data;
          filename = 'nexus-segments-export';
          break;
        }
        case 'published': {
          const published = await listPublishedContent();
          data = published.map(p => ({
            id: p.id,
            title: p.title,
            content: p.content,
            platform: (p.platforms || []).join(', '),
            publishedAt: p.publishedAt,
            status: p.status,
          }));
          filename = 'nexus-published-content';
          break;
        }
        case 'brand': {
          const brand = await loadBrandKit();
          data = brand ? [brand] : [];
          filename = 'nexus-brand-kit';
          break;
        }
        default:
          return NextResponse.json({ success: false, error: `Unknown export type: ${type}` }, { status: 400 });
      }

      if (format === 'csv') {
        const headers = data.length > 0 ? Object.keys(data[0]) : [];
        const csvRows = [headers.join(',')];
        for (const row of data) {
          csvRows.push(headers.map(h => {
            const val = row[h];
            const str = val == null ? '' : String(val);
            return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
          }).join(','));
        }
        return new NextResponse(csvRows.join('\n'), {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${filename}-${Date.now()}.csv"`,
          },
        });
      }

      return NextResponse.json({
        success: true,
        data,
        total: data.length,
        exportedAt: new Date().toISOString(),
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Export failed' },
        { status: 500 }
      );
    }
  });
}
