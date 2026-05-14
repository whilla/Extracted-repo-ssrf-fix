/**
 * Stripe Webhook Handler - PRODUCTION-READY with signature verification
 * Processes subscription and payment events from Stripe
 */

import { NextResponse } from 'next/server';
import { kvGet, kvSet } from '@/lib/services/puterService';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

/**
 * Verify Stripe webhook signature using HMAC-SHA256
 * This prevents forged webhook events from unauthorized sources
 */
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<StripeEvent | null> {
  try {
    // Parse the signature header to extract timestamp and signatures
    const elements = signature.split(',');
    const signatureMap: Record<string, string> = {};
    
    for (const element of elements) {
      const [key, value] = element.split('=');
      if (key && value) {
        signatureMap[key.trim()] = value.trim();
      }
    }
    
    const timestamp = signatureMap['t'];
    const signatureHash = signatureMap['v1'];
    
    if (!timestamp || !signatureHash) {
      logger.error('Stripe Webhook', 'Missing timestamp or signature in header');
      return null;
    }
    
    // Check timestamp to prevent replay attacks (events older than 5 minutes are rejected)
    const now = Math.floor(Date.now() / 1000);
    const eventTime = parseInt(timestamp, 10);
    if (isNaN(eventTime) || Math.abs(now - eventTime) > 300) {
      logger.error('Stripe Webhook', 'Event timestamp too old or invalid, possible replay attack');
      return null;
    }
    
    // Compute expected signature: HMAC-SHA256(secret, timestamp.payload)
    const signedPayload = `${timestamp}.${payload}`;
    
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Constant-time comparison to prevent timing attacks
    if (expectedSignature.length !== signatureHash.length) {
      logger.error('Stripe Webhook', 'Signature length mismatch');
      return null;
    }
    
    let match = true;
    for (let i = 0; i < expectedSignature.length; i++) {
      if (expectedSignature[i] !== signatureHash[i]) {
        match = false;
      }
    }
    
    if (!match) {
      logger.error('Stripe Webhook', 'Signature verification failed');
      return null;
    }
    
    // Signature valid - parse the event
    const event = JSON.parse(payload) as StripeEvent;
    logger.info('Stripe Webhook', 'Signature verified for event', { id: event.id, type: event.type });
    return event;
  } catch (error) {
    logger.error('Stripe Webhook', 'Signature verification error', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * Store webhook event in audit log for debugging and compliance
 */
async function logWebhookEvent(event: StripeEvent, processed: boolean, error?: string): Promise<void> {
  try {
    const supabase = await createClient();
    if (supabase) {
      await (supabase.from('stripe_webhook_events') as any).insert({
        stripe_event_id: event.id,
        event_type: event.type,
        processed,
        error_message: error || null,
        created_at: new Date().toISOString(),
      });
    }
  } catch {
    // Non-critical - just log to console if DB logging fails
    logger.warn('Stripe Webhook', 'Failed to write audit log');
  }
}

export async function POST(request: Request) {
  // Step 1: Check webhook secret is configured
  if (!STRIPE_WEBHOOK_SECRET) {
    logger.error('Stripe Webhook', 'STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json(
      { error: 'Stripe webhook secret not configured' },
      { status: 500 }
    );
  }

  // Step 2: Get raw body and signature
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    logger.warn('Stripe Webhook', 'Missing stripe-signature header');
    return NextResponse.json(
      { error: 'Missing Stripe signature' },
      { status: 400 }
    );
  }

  // Step 3: Verify signature cryptographically
  const event = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET);
  
  if (!event) {
    logger.warn('Stripe Webhook', 'Signature verification failed - possible forged request');
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 401 }
    );
  }

  // Step 4: Idempotency - check if we've already processed this event
  const eventProcessed = await checkEventProcessed(event.id);
  if (eventProcessed) {
    logger.info('Stripe Webhook', 'Event already processed, skipping', { eventId: event.id });
    return NextResponse.json({ received: true, idempotency: true });
  }

  // Step 5: Process the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const userId = session.client_reference_id as string | undefined;
        
        logger.info('Stripe Webhook', 'Checkout completed', { customerId, subscriptionId, userId });
        
        if (subscriptionId && userId) {
          await updateSubscriptionStatus(subscriptionId, 'active', userId);
        }
        break;
      }

      case 'customer.subscription.created': {
        const subscription = event.data.object;
        const subscriptionId = subscription.id as string;
        const customerId = subscription.customer as string;
        
        logger.info('Stripe Webhook', 'Subscription created', { subscriptionId, customerId });
        
        await updateSubscriptionStatus(subscriptionId, 'active');
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const subscriptionId = subscription.id as string;
        const status = subscription.status as string;
        const cancelAtPeriodEnd = subscription.cancel_at_period_end as boolean;
        
        logger.info('Stripe Webhook', 'Subscription updated', { subscriptionId, status, cancelAtPeriodEnd });
        
        const statusMap: Record<string, string> = {
          'active': 'active',
          'trialing': 'active',
          'past_due': 'past_due',
          'canceled': 'cancelled',
          'unpaid': 'unpaid',
          'paused': 'paused',
          'incomplete': 'incomplete',
          'incomplete_expired': 'expired',
        };
        
        const mappedStatus = statusMap[status] || status;
        await updateSubscriptionStatus(subscriptionId, mappedStatus);
        
        if (cancelAtPeriodEnd) {
          await updateSubscriptionCancelAtPeriodEnd(subscriptionId, true);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const subscriptionId = subscription.id as string;
        
        logger.info('Stripe Webhook', 'Subscription cancelled', { subscriptionId });
        
        await updateSubscriptionStatus(subscriptionId, 'cancelled');
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Record<string, unknown>;
        const subscriptionId = invoice.subscription as string;
        const customerId = invoice.customer as string;
        const billingReason = invoice.billing_reason as string;
        
        logger.info('Stripe Webhook', 'Payment succeeded', { subscriptionId, customerId, billingReason });
        
        if (subscriptionId) {
          await updateSubscriptionStatus(subscriptionId, 'active');
          
          const lines = invoice.lines as { data?: Array<{ period?: { end?: number } }> } | undefined;
          const periodEnd = lines?.data?.[0]?.period?.end;
          if (periodEnd) {
            await updateSubscriptionPeriod(subscriptionId, new Date(periodEnd * 1000).toISOString());
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription as string;
        const attemptCount = invoice.attempt_count as number;
        
        logger.warn('Stripe Webhook', 'Payment failed', { subscriptionId, attemptCount });
        
        if (subscriptionId) {
          await updateSubscriptionStatus(subscriptionId, 'past_due');
          
          // After 3 failed attempts, mark as unpaid
          if (attemptCount >= 3) {
            await updateSubscriptionStatus(subscriptionId, 'unpaid');
          }
        }
        break;
      }

      case 'customer.created': {
        const customer = event.data.object;
        logger.info('Stripe Webhook', 'Customer created', { customerId: customer.id });
        break;
      }

      default:
        logger.info('Stripe Webhook', 'Unhandled event type', { type: event.type });
    }

    // Mark event as processed
    await markEventProcessed(event.id);
    await logWebhookEvent(event, true);

    return NextResponse.json({ received: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Webhook processing failed';
    logger.error('Stripe Webhook', 'Error processing event', { error: errorMessage, eventId: event.id });
    await logWebhookEvent(event, false, errorMessage);
    
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

// Idempotency tracking
const PROCESSED_EVENTS_KEY = 'stripe_processed_events';
const MAX_PROCESSED_EVENTS = 1000;

async function loadProcessedEvents(): Promise<Set<string>> {
  try {
    const data = await kvGet(PROCESSED_EVENTS_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      return new Set(Array.isArray(parsed) ? parsed : []);
    }
  } catch {
    // Invalid data, start fresh
  }
  return new Set();
}

async function checkEventProcessed(eventId: string): Promise<boolean> {
  const processed = await loadProcessedEvents();
  return processed.has(eventId);
}

async function markEventProcessed(eventId: string): Promise<void> {
  const processed = await loadProcessedEvents();
  processed.add(eventId);
  
  // Keep only the most recent events to prevent unbounded growth
  const eventsArray = Array.from(processed);
  if (eventsArray.length > MAX_PROCESSED_EVENTS) {
    eventsArray.splice(0, eventsArray.length - MAX_PROCESSED_EVENTS);
  }
  
  await kvSet(PROCESSED_EVENTS_KEY, JSON.stringify(eventsArray));
}

const SUBSCRIPTIONS_KEY = 'stripe_subscriptions';

async function loadSubscriptions(): Promise<Record<string, unknown>> {
  const data = await kvGet(SUBSCRIPTIONS_KEY);
  return data ? JSON.parse(data) : {};
}

async function saveSubscriptions(subs: Record<string, unknown>): Promise<void> {
  await kvSet(SUBSCRIPTIONS_KEY, JSON.stringify(subs));
}

async function updateSubscriptionStatus(
  stripeSubscriptionId: string,
  status: string,
  userId?: string
): Promise<void> {
  const subscriptions = await loadSubscriptions();
  
  let found = false;
  for (const [id, sub] of Object.entries(subscriptions)) {
    const subRecord = sub as Record<string, unknown>;
    if (subRecord.stripeSubscriptionId === stripeSubscriptionId) {
      subscriptions[id] = {
        ...subRecord,
        status,
        updatedAt: new Date().toISOString(),
        ...(userId && !subRecord.userId ? { userId } : {}),
      };
      found = true;
      break;
    }
  }
  
  // If not found, create a new entry
  if (!found && userId) {
    subscriptions[stripeSubscriptionId] = {
      stripeSubscriptionId,
      status,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  
  await saveSubscriptions(subscriptions);
}

async function updateSubscriptionPeriod(stripeSubscriptionId: string, periodEnd: string): Promise<void> {
  const subscriptions = await loadSubscriptions();
  
  for (const [id, sub] of Object.entries(subscriptions)) {
    const subRecord = sub as Record<string, unknown>;
    if (subRecord.stripeSubscriptionId === stripeSubscriptionId) {
      subscriptions[id] = { ...subRecord, currentPeriodEnd: periodEnd };
      break;
    }
  }
  
  await saveSubscriptions(subscriptions);
}

async function updateSubscriptionCancelAtPeriodEnd(stripeSubscriptionId: string, cancelAtPeriodEnd: boolean): Promise<void> {
  const subscriptions = await loadSubscriptions();
  
  for (const [id, sub] of Object.entries(subscriptions)) {
    const subRecord = sub as Record<string, unknown>;
    if (subRecord.stripeSubscriptionId === stripeSubscriptionId) {
      subscriptions[id] = { ...subRecord, cancelAtPeriodEnd };
      break;
    }
  }
  
  await saveSubscriptions(subscriptions);
}
