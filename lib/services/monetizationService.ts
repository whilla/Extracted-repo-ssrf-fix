// Monetization Service
// Handles revenue capture and commercial scaling.

import { kvGet, kvSet } from './puterService';

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  features: string[];
}

export async function getSubscriptionStatus(userId: string) {
  const status = await kvGet(`user_sub_${userId}`);
  return status ? JSON.parse(status) : { plan: 'free', active: false };
}

export async function trackRevenue(amount: number, source: string) {
  const total = await kvGet('nexus_total_revenue') || '0';
  const newTotal = parseFloat(total) + amount;
  await kvSet('nexus_total_revenue', newTotal.toString());
  return newTotal;
}
