/**
 * E-commerce & Monetization Service
 * Products, payments, subscriptions, and revenue tracking
 */

import { kvGet, kvSet } from './puterService';

export type ProductType = 'digital' | 'physical' | 'subscription' | 'service';
export type PricingType = 'one_time' | 'recurring' | 'free';
export type Currency = 'USD' | 'EUR' | 'GBP';

export interface Product {
  id: string;
  name: string;
  description: string;
  type: ProductType;
  pricingType: PricingType;
  price: number;
  currency: Currency;
  interval?: 'month' | 'year' | 'week';
  features: string[];
  mediaUrls: string[];
  downloadUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  userId: string;
  userEmail: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: Currency;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentMethod?: string;
  paymentId?: string;
  paidAt?: string;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface Subscription {
  id: string;
  userId: string;
  productId: string;
  status: 'active' | 'cancelled' | 'expired' | 'past_due';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

export interface RevenueReport {
  period: string;
  revenue: number;
  orders: number;
  averageOrderValue: number;
  newSubscriptions: number;
  churnedSubscriptions: number;
}

export interface AffiliateLink {
  id: string;
  productId: string;
  code: string;
  commission: number;
  clicks: number;
  conversions: number;
  createdAt: string;
}

const PRODUCTS_KEY = 'products';
const ORDERS_KEY = 'orders';
const SUBSCRIPTIONS_KEY = 'subscriptions';
const AFFILIATES_KEY = 'affiliates';

function generateProductId(): string {
  return `prod_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateCode(length: number = 8): string {
  return Math.random().toString(36).substring(2, 2 + length).toUpperCase();
}

async function loadProducts(): Promise<Product[]> {
  const data = await kvGet(PRODUCTS_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveProducts(products: Product[]): Promise<void> {
  await kvSet(PRODUCTS_KEY, JSON.stringify(products.slice(0, 100)));
}

async function loadOrders(): Promise<Order[]> {
  const data = await kvGet(ORDERS_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveOrders(orders: Order[]): Promise<void> {
  await kvSet(ORDERS_KEY, JSON.stringify(orders.slice(0, 500)));
}

export async function createProduct(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> {
  const products = await loadProducts();

  const newProduct: Product = {
    ...product,
    id: generateProductId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  products.unshift(newProduct);
  await saveProducts(products);

  return newProduct;
}

export async function getProduct(productId: string): Promise<Product | null> {
  const products = await loadProducts();
  return products.find(p => p.id === productId) || null;
}

export async function updateProduct(productId: string, updates: Partial<Product>): Promise<boolean> {
  const products = await loadProducts();
  const index = products.findIndex(p => p.id === productId);

  if (index === -1) return false;

  products[index] = {
    ...products[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await saveProducts(products);
  return true;
}

export async function listProducts(options?: {
  type?: ProductType;
  pricingType?: PricingType;
  activeOnly?: boolean;
}): Promise<Product[]> {
  let products = await loadProducts();

  if (options?.type) {
    products = products.filter(p => p.type === options.type);
  }
  if (options?.pricingType) {
    products = products.filter(p => p.pricingType === options.pricingType);
  }
  if (options?.activeOnly) {
    products = products.filter(p => p.isActive);
  }

  return products;
}

export async function deleteProduct(productId: string): Promise<boolean> {
  const products = await loadProducts();
  const filtered = products.filter(p => p.id !== productId);
  
  if (filtered.length === products.length) return false;
  
  await saveProducts(filtered);
  return true;
}

export async function createOrder(order: Omit<Order, 'id' | 'createdAt' | 'status'>): Promise<Order> {
  const orders = await loadOrders();

  const newOrder: Order = {
    ...order,
    id: generateProductId(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  orders.unshift(newOrder);
  await saveOrders(orders);

  return newOrder;
}

export async function updateOrderStatus(
  orderId: string,
  status: Order['status'],
  paymentId?: string
): Promise<boolean> {
  const orders = await loadOrders();
  const index = orders.findIndex(o => o.id === orderId);

  if (index === -1) return false;

  orders[index].status = status;
  if (paymentId) orders[index].paymentId = paymentId;
  if (status === 'paid') orders[index].paidAt = new Date().toISOString();

  await saveOrders(orders);
  return true;
}

export async function getOrder(orderId: string): Promise<Order | null> {
  const orders = await loadOrders();
  return orders.find(o => o.id === orderId) || null;
}

export async function getUserOrders(userId: string): Promise<Order[]> {
  const orders = await loadOrders();
  return orders.filter(o => o.userId === userId);
}

export async function getOrdersByStatus(status: Order['status']): Promise<Order[]> {
  const orders = await loadOrders();
  return orders.filter(o => o.status === status);
}

export async function createSubscription(subscription: Omit<Subscription, 'id' | 'createdAt'>): Promise<Subscription> {
  const subsData = await kvGet(SUBSCRIPTIONS_KEY);
  const subscriptions: Subscription[] = subsData ? JSON.parse(subsData) : [];

  const newSub: Subscription = {
    ...subscription,
    id: generateProductId(),
    createdAt: new Date().toISOString(),
  };

  subscriptions.unshift(newSub);
  await kvSet(SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions.slice(0, 200)));

  return newSub;
}

export async function getSubscription(subscriptionId: string): Promise<Subscription | null> {
  const subsData = await kvGet(SUBSCRIPTIONS_KEY);
  const subscriptions: Subscription[] = subsData ? JSON.parse(subsData) : [];
  return subscriptions.find(s => s.id === subscriptionId) || null;
}

export async function getUserSubscriptions(userId: string): Promise<Subscription[]> {
  const subsData = await kvGet(SUBSCRIPTIONS_KEY);
  const subscriptions: Subscription[] = subsData ? JSON.parse(subsData) : [];
  return subscriptions.filter(s => s.userId === userId);
}

export async function cancelSubscription(subscriptionId: string, immediate: boolean = false): Promise<boolean> {
  const subsData = await kvGet(SUBSCRIPTIONS_KEY);
  const subscriptions: Subscription[] = subsData ? JSON.parse(subsData) : [];
  const index = subscriptions.findIndex(s => s.id === subscriptionId);

  if (index === -1) return false;

  if (immediate) {
    subscriptions[index].status = 'cancelled';
  } else {
    subscriptions[index].cancelAtPeriodEnd = true;
  }

  await kvSet(SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions));
  return true;
}

export async function createAffiliateLink(
  productId: string,
  commission: number
): Promise<AffiliateLink> {
  const affiliatesData = await kvGet(AFFILIATES_KEY);
  const affiliates: AffiliateLink[] = affiliatesData ? JSON.parse(affiliatesData) : [];

  let code = generateCode(8);
  while (affiliates.some(a => a.code === code)) {
    code = generateCode(8);
  }

  const link: AffiliateLink = {
    id: generateProductId(),
    productId,
    code,
    commission,
    clicks: 0,
    conversions: 0,
    createdAt: new Date().toISOString(),
  };

  affiliates.unshift(link);
  await kvSet(AFFILIATES_KEY, JSON.stringify(affiliates));

  return link;
}

export async function trackAffiliateClick(code: string): Promise<boolean> {
  const affiliatesData = await kvGet(AFFILIATES_KEY);
  const affiliates: AffiliateLink[] = affiliatesData ? JSON.parse(affiliatesData) : [];
  const index = affiliates.findIndex(a => a.code === code);

  if (index === -1) return false;

  affiliates[index].clicks++;
  await kvSet(AFFILIATES_KEY, JSON.stringify(affiliates));
  return true;
}

export async function trackAffiliateConversion(code: string): Promise<boolean> {
  const affiliatesData = await kvGet(AFFILIATES_KEY);
  const affiliates: AffiliateLink[] = affiliatesData ? JSON.parse(affiliatesData) : [];
  const index = affiliates.findIndex(a => a.code === code);

  if (index === -1) return false;

  affiliates[index].conversions++;
  await kvSet(AFFILIATES_KEY, JSON.stringify(affiliates));
  return true;
}

export async function getRevenueReport(period: 'day' | 'week' | 'month' | 'year'): Promise<RevenueReport> {
  const orders = await loadOrders();
  const now = new Date();
  
  let startDate: Date;
  switch (period) {
    case 'day':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
  }

  const periodOrders = orders.filter(o => 
    o.status === 'paid' && new Date(o.createdAt) >= startDate
  );

  const revenue = periodOrders.reduce((sum, o) => sum + o.total, 0);
  const ordersCount = periodOrders.length;

  return {
    period,
    revenue,
    orders: ordersCount,
    averageOrderValue: ordersCount > 0 ? revenue / ordersCount : 0,
    newSubscriptions: 0,
    churnedSubscriptions: 0,
  };
}

export async function getDashboardStats(): Promise<{
  totalProducts: number;
  activeProducts: number;
  totalOrders: number;
  paidOrders: number;
  totalRevenue: number;
  activeSubscriptions: number;
}> {
  const products = await loadProducts();
  const orders = await loadOrders();
  const subsData = await kvGet(SUBSCRIPTIONS_KEY);
  const subscriptions: Subscription[] = subsData ? JSON.parse(subsData) : [];

  return {
    totalProducts: products.length,
    activeProducts: products.filter(p => p.isActive).length,
    totalOrders: orders.length,
    paidOrders: orders.filter(o => o.status === 'paid').length,
    totalRevenue: orders.filter(o => o.status === 'paid').reduce((sum, o) => sum + o.total, 0),
    activeSubscriptions: subscriptions.filter(s => s.status === 'active').length,
  };
}

export async function processPayment(
  orderId: string,
  paymentMethod: string,
  paymentDetails: Record<string, unknown>
): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  const order = await getOrder(orderId);
  if (!order) {
    return { success: false, error: 'Order not found' };
  }

  const transactionId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Use Stripe for real payments
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  
  if (stripeKey && order.total > 0) {
    try {
      const response = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          amount: String(Math.round(order.total * 100)),
          currency: order.currency.toLowerCase(),
          payment_method: paymentDetails.paymentMethodId as string || 'card',
          customer: paymentDetails.customerId as string || '',
          metadata: JSON.stringify({ orderId }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Payment failed');
      }

      const paymentData = await response.json();
      
      // Confirm the payment
      const confirmResponse = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentData.id}/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
        },
      });

      if (!confirmResponse.ok) {
        await updateOrderStatus(orderId, 'failed');
        return { success: false, error: 'Payment confirmation failed' };
      }

      const confirmData = await confirmResponse.json();
      
      if (confirmData.status === 'succeeded') {
        await updateOrderStatus(orderId, 'paid', transactionId);
        
        const products = await loadProducts();
        
        // Create subscriptions for recurring products
        if (order.items.some(item => {
          const product = products.find(p => p.id === item.productId);
          return product?.pricingType === 'recurring';
        })) {
          for (const item of order.items) {
            const product = await getProduct(item.productId);
            if (product?.pricingType === 'recurring') {
              await createSubscription({
                userId: order.userId,
                productId: item.productId,
                status: 'active',
                currentPeriodStart: new Date().toISOString(),
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                cancelAtPeriodEnd: false,
              });
            }
          }
        }

        return { success: true, transactionId };
      } else {
        await updateOrderStatus(orderId, 'failed');
        return { success: false, error: confirmData.error || 'Payment not completed' };
      }
    } catch (error) {
      console.error('[Monetization] Payment error:', error);
      await updateOrderStatus(orderId, 'failed');
      return { success: false, error: error instanceof Error ? error.message : 'Payment processing failed' };
    }
  }

  // Fallback: If no Stripe key, try to process as free/demo
  if (order.total === 0) {
    await updateOrderStatus(orderId, 'paid', transactionId);
    return { success: true, transactionId };
  }

  await updateOrderStatus(orderId, 'failed');
  return { success: false, error: 'Payment system not configured. Set STRIPE_SECRET_KEY environment variable.' };
}