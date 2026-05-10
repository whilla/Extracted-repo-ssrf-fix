export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { repurposingService } from '@/lib/services/repurposingService';

const RepurposeRequestSchema = z.object({
  masterContent: z.string().min(1, 'Master content is required'),
  platforms: z.array(z.string()).min(1, 'At least one platform is required'),
  toneAdjustment: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = RepurposeRequestSchema.safeParse(body);
    
    if (!result.success) {
      return NextResponse.json({ 
        error: `Validation failed: ${result.error.errors.map(e => e.message).join(', ')}` 
      }, { status: 400 });
    }

    const { masterContent, platforms, toneAdjustment } = result.data;

    // Use the repurposing service to generate the campaign
    const campaign = await repurposingService.repurpose({
      masterContent,
      platforms: platforms as any,
      toneAdjustment,
    });

    return NextResponse.json({
      status: 'success',
      campaign,
    });

  } catch (error) {
    console.error('[api/repurpose] Error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Repurposing failed.' 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ready',
    capabilities: [
      'Master content distillation',
      'Platform-specific cultural adaptation',
      'Multi-platform parallel generation',
      'Brand-aware consistency'
    ]
  });
}
