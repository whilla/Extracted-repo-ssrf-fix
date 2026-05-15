'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Check, Loader2, Zap, Crown, Building2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface Plan {
  id: string;
  name: string;
  price: number;
  interval: string;
  features: string[];
  stripePriceId: string | null;
}

interface Subscription {
  id: string;
  status: string;
  plan_id: string;
  stripe_subscription_id: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free: <Zap className="w-8 h-8 text-gray-400" />,
  pro: <Crown className="w-8 h-8 text-nexus-cyan" />,
  business: <Building2 className="w-8 h-8 text-purple-400" />,
};

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    loadBillingInfo();
  }, []);

  async function loadBillingInfo() {
    try {
      const [plansRes, subRes] = await Promise.all([
        fetch('/api/billing?action=plans'),
        fetch('/api/billing?action=subscription'),
      ]);

      if (plansRes.ok) {
        const data = await plansRes.json();
        setPlans(data.plans || []);
      }

      if (subRes.ok) {
        const data = await subRes.json();
        setSubscription(data.subscription);
      }
    } catch (err) {
      console.error('Failed to load billing info:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubscribe(planId: string) {
    setCheckoutLoading(planId);
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });

      const data = await res.json();

      if (!data.success) {
        toast.error(data.error || 'Failed to start checkout');
        return;
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast.success(`Switched to ${planId} plan`);
        loadBillingInfo();
      }
    } catch (err) {
      toast.error('Checkout failed');
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleManageBilling() {
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'manage' }),
      });

      const data = await res.json();
      if (data.portalUrl) {
        window.location.href = data.portalUrl;
      } else {
        toast.error('Billing portal not available');
      }
    } catch (err) {
      toast.error('Failed to open billing portal');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-nexus-cyan animate-spin" />
      </div>
    );
  }

  const currentPlanId = subscription?.plan_id || 'free';

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-2 flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-nexus-cyan" /> Billing
          </h1>
          <p className="text-muted-foreground">Manage your subscription and plan</p>
        </div>

        {subscription && (
          <div className="mb-8 p-4 bg-card border border-border rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Current Plan</p>
                <p className="text-lg font-semibold text-foreground capitalize">{subscription.plan_id}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Status</p>
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    subscription.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : subscription.status === 'past_due'
                      ? 'bg-yellow-500/10 text-yellow-400'
                      : 'bg-red-500/10 text-red-400'
                  }`}
                >
                  {subscription.status}
                </span>
              </div>
            </div>
            {subscription.current_period_end && (
              <p className="text-xs text-muted-foreground mt-2">
                Renews: {new Date(subscription.current_period_end).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            const isPopular = plan.id === 'pro';

            return (
              <div
                key={plan.id}
                className={`relative bg-card border rounded-2xl p-6 transition-all ${
                  isCurrent
                    ? 'border-nexus-cyan shadow-lg shadow-nexus-cyan/10'
                    : isPopular
                    ? 'border-purple-500/50'
                    : 'border-border'
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-purple-500 text-white text-xs font-medium rounded-full">
                    Most Popular
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  {PLAN_ICONS[plan.id]}
                  <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                </div>

                <div className="mb-6">
                  <span className="text-4xl font-bold text-foreground">${plan.price}</span>
                  <span className="text-muted-foreground">/{plan.interval}</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-nexus-cyan shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={checkoutLoading === plan.id || isCurrent}
                  className={`w-full py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                    isCurrent
                      ? 'bg-muted text-muted-foreground cursor-default'
                      : plan.id === 'free'
                      ? 'bg-muted text-foreground hover:bg-muted/80'
                      : 'bg-nexus-cyan text-black hover:bg-nexus-cyan/90'
                  }`}
                >
                  {checkoutLoading === plan.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isCurrent ? (
                    <>Current Plan</>
                  ) : (
                    <>
                      {plan.price === 0 ? 'Get Started' : 'Subscribe'}
                      <ExternalLink className="w-3 h-3" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {subscription?.status === 'active' && (
          <div className="mt-8 text-center">
            <button
              onClick={handleManageBilling}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
            >
              Manage billing details & payment method
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
