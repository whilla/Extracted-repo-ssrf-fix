import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { kvGet, kvSet } from '@/lib/services/puterService';
import { getSupabaseAdminClient } from '@/lib/supabase/server';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: 'month',
    features: ['5 generations/month', 'Basic platforms', 'Community support'],
    stripePriceId: null,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 29,
    interval: 'month',
    features: ['Unlimited generations', 'All platforms', 'Priority support', 'Advanced analytics', 'Custom brand kit'],
    stripePriceId: null,
  },
  business: {
    id: 'business',
    name: 'Business',
    price: 99,
    interval: 'month',
    features: ['Everything in Pro', 'Team collaboration', 'API access', 'Custom integrations', 'Dedicated support'],
    stripePriceId: null,
  },
};

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async ({ userId }) => {
    try {
      const searchParams = request.nextUrl.searchParams;
      const action = searchParams.get('action');

      if (action === 'plans') {
        const storedPrices = await kvGet('stripe_price_ids');
        const priceIds = storedPrices ? JSON.parse(storedPrices) : {};

        const plans = Object.values(PLANS).map((plan) => ({
          ...plan,
          stripePriceId: priceIds[plan.id] || null,
        }));

        return NextResponse.json({ success: true, plans });
      }

      if (action === 'subscription' && userId) {
        const supabase = await getSupabaseAdminClient();
        if (!supabase) {
          return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 500 });
        }

        const { data, error } = await (supabase as any)
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, subscription: data || null });
      }

      return NextResponse.json({ success: true, plans: PLANS });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to fetch billing info' },
        { status: 500 }
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async ({ userId }) => {
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    if (!STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { success: false, error: 'Stripe not configured. Set STRIPE_SECRET_KEY in environment.' },
        { status: 500 }
      );
    }

    try {
      const body = await request.json();
      const { planId, successUrl, cancelUrl } = body;

      if (!planId || !PLANS[planId as keyof typeof PLANS]) {
        return NextResponse.json({ success: false, error: 'Invalid plan' }, { status: 400 });
      }

      const plan = PLANS[planId as keyof typeof PLANS];

      if (plan.price === 0) {
        return NextResponse.json({ success: true, message: 'Free plan activated', plan });
      }

      const storedPrices = await kvGet('stripe_price_ids');
      const priceIds = storedPrices ? JSON.parse(storedPrices) : {};
      const priceId = priceIds[planId];

      if (!priceId) {
        return NextResponse.json(
          {
            success: false,
            error: `Stripe price ID not configured for ${planId}. Set it via /api/billing/prices`,
          },
          { status: 400 }
        );
      }

      const supabase = await getSupabaseAdminClient();
      if (!supabase) {
        return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 500 });
      }

      const { data: user } = await (supabase as any).auth.admin.getUserById(userId);

      const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          mode: 'subscription',
          customer_email: user?.user?.email || '',
          'line_items[0][price]': priceId,
          'line_items[0][quantity]': '1',
          'success_url': successUrl || `${SITE_URL}/billing?session_id={CHECKOUT_SESSION_ID}`,
          'cancel_url': cancelUrl || `${SITE_URL}/billing?canceled=true`,
          'client_reference_id': userId,
          'metadata[user_id]': userId,
          'metadata[plan_id]': planId,
        }),
      });

      if (!sessionRes.ok) {
        const errData = await sessionRes.json();
        return NextResponse.json(
          { success: false, error: errData.error?.message || 'Failed to create checkout session' },
          { status: 500 }
        );
      }

      const session = await sessionRes.json();

      return NextResponse.json({
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Checkout failed' },
        { status: 500 }
      );
    }
  });
}

export async function PUT(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { prices } = body;

      if (!prices || typeof prices !== 'object') {
        return NextResponse.json({ success: false, error: 'prices object required' }, { status: 400 });
      }

      await kvSet('stripe_price_ids', JSON.stringify(prices));

      return NextResponse.json({
        success: true,
        message: 'Price IDs updated',
        prices,
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to update prices' },
        { status: 500 }
      );
    }
  });
}
