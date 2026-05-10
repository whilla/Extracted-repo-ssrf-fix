/**
 * Stripe Webhook Handler
 * Processes subscription and payment events from Stripe
 */

import { NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/services/puterService';

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export async function POST(request: Request) {
  if (!STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Stripe webhook secret not configured' },
      { status: 500 }
    );
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing Stripe signature' },
      { status: 400 }
    );
  }

  // Verify webhook signature (simplified - production would use stripe library)
  let event: StripeEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        
        console.log('[Stripe Webhook] Checkout completed:', { customerId, subscriptionId });
        
        // Update subscription status
        if (subscriptionId) {
          await updateSubscriptionStatus(subscriptionId, 'active');
        }
        break;
      }

      case 'customer.subscription.created': {
        const subscription = event.data.object;
        const subscriptionId = subscription.id as string;
        const customerId = subscription.customer as string;
        
        console.log('[Stripe Webhook] Subscription created:', { subscriptionId, customerId });
        
        await updateSubscriptionStatus(subscriptionId, 'active');
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const subscriptionId = subscription.id as string;
        const status = subscription.status as string;
        
        console.log('[Stripe Webhook] Subscription updated:', { subscriptionId, status });
        
        // Map Stripe status to our status
        const statusMap: Record<string, string> = {
          'active': 'active',
          'trialing': 'active',
          'past_due': 'past_due',
          'canceled': 'cancelled',
          'unpaid': 'unpaid',
          'paused': 'paused',
        };
        
        await updateSubscriptionStatus(subscriptionId, statusMap[status] || status);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const subscriptionId = subscription.id as string;
        
        console.log('[Stripe Webhook] Subscription cancelled:', { subscriptionId });
        
        await updateSubscriptionStatus(subscriptionId, 'cancelled');
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription as string;
        const customerId = invoice.customer as string;
        
        console.log('[Stripe Webhook] Payment succeeded:', { subscriptionId, customerId });
        
        if (subscriptionId) {
          await updateSubscriptionStatus(subscriptionId, 'active');
          
          // Update period end
          const periodEnd = invoice.lines?.data?.[0]?.period?.end;
          if (periodEnd) {
            await updateSubscriptionPeriod(subscriptionId, new Date(periodEnd * 1000).toISOString());
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription as string;
        
        console.log('[Stripe Webhook] Payment failed:', { subscriptionId });
        
        if (subscriptionId) {
          await updateSubscriptionStatus(subscriptionId, 'past_due');
        }
        break;
      }

      case 'customer.created': {
        const customer = event.data.object;
        console.log('[Stripe Webhook] Customer created:', { customerId: customer.id });
        break;
      }

      default:
        console.log('[Stripe Webhook] Unhandled event type:', event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error processing event:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

const SUBSCRIPTIONS_KEY = 'stripe_subscriptions';

async function loadSubscriptions(): Promise<Record<string, unknown>> {
  const data = await kvGet(SUBSCRIPTIONS_KEY);
  return data ? JSON.parse(data) : {};
}

async function saveSubscriptions(subs: Record<string, unknown>): Promise<void> {
  await kvSet(SUBSCRIPTIONS_KEY, JSON.stringify(subs));
}

async function updateSubscriptionStatus(stripeSubscriptionId: string, status: string): Promise<void> {
  const subscriptions = await loadSubscriptions();
  
  // Find subscription by stripe ID or update all for that customer
  for (const [id, sub] of Object.entries(subscriptions)) {
    if ((sub as Record<string, unknown>).stripeSubscriptionId === stripeSubscriptionId) {
      subscriptions[id] = { ...sub, status };
      break;
    }
  }
  
  await saveSubscriptions(subscriptions);
}

async function updateSubscriptionPeriod(stripeSubscriptionId: string, periodEnd: string): Promise<void> {
  const subscriptions = await loadSubscriptions();
  
  for (const [id, sub] of Object.entries(subscriptions)) {
    if ((sub as Record<string, unknown>).stripeSubscriptionId === stripeSubscriptionId) {
      subscriptions[id] = { ...sub, currentPeriodEnd: periodEnd };
      break;
    }
  }
  
  await saveSubscriptions(subscriptions);
}