import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { getSupabaseAdminClient } from '@/lib/supabase/server';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async ({ userId }) => {
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    if (!STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { success: false, error: 'Stripe not configured' },
        { status: 500 }
      );
    }

    try {
      const supabase = await getSupabaseAdminClient();
      if (!supabase) {
        return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 500 });
      }

      const { data } = await (supabase as any)
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .single();

      if (!data?.stripe_customer_id) {
        return NextResponse.json(
          { success: false, error: 'No Stripe customer found. Subscribe to a plan first.' },
          { status: 400 }
        );
      }

      const sessionRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          customer: data.stripe_customer_id,
          return_url: `${SITE_URL}/billing`,
        }),
      });

      if (!sessionRes.ok) {
        const errData = await sessionRes.json();
        return NextResponse.json(
          { success: false, error: errData.error?.message || 'Failed to create portal session' },
          { status: 500 }
        );
      }

      const session = await sessionRes.json();

      return NextResponse.json({
        success: true,
        portalUrl: session.url,
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Portal access failed' },
        { status: 500 }
      );
    }
  });
}
