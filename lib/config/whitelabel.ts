/**
 * White-Label Configuration Service
 * Custom branding, domains, and multi-tenant support
 */

import { kvGet, kvSet } from '../services/puterService';

export interface WhiteLabelConfig {
  id: string;
  name: string;
  domain?: string;
  logo?: string;
  favicon?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily?: string;
  customCss?: string;
  customJs?: string;
  emailFrom?: string;
  emailName?: string;
  socialLinks?: {
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    facebook?: string;
    youtube?: string;
  };
  features: WhiteLabelFeatures;
  limits: WhiteLabelLimits;
  createdAt: string;
  updatedAt: string;
}

export interface WhiteLabelFeatures {
  showPoweredBy: boolean;
  showBranding: boolean;
  customDomain: boolean;
  apiAccess: boolean;
  teamSeats: number;
  customPlugins: boolean;
  whiteLabelDomain: boolean;
}

export interface WhiteLabelLimits {
  maxPostsPerDay: number;
  maxScheduledPosts: number;
  maxTeamMembers: number;
  maxStorage: number;
  maxApiCalls: number;
  maxAgents: number;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  whiteLabelId: string;
  plan: 'free' | 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'trial';
  settings: TenantSettings;
  createdAt: string;
  expiresAt?: string;
}

export interface TenantSettings {
  allowedFeatures: string[];
  rateLimit: number;
  maxStorage: number;
  customDomain?: string;
  ssoEnabled: boolean;
  ssoProvider?: 'google' | 'github' | 'saml';
}

const WHITE_LABEL_KEY = 'white_label_config';
const TENANTS_KEY = 'tenants';

const PLAN_LIMITS: Record<Tenant['plan'], WhiteLabelLimits> = {
  free: { maxPostsPerDay: 10, maxScheduledPosts: 50, maxTeamMembers: 2, maxStorage: 100000000, maxApiCalls: 1000, maxAgents: 5 },
  starter: { maxPostsPerDay: 50, maxScheduledPosts: 200, maxTeamMembers: 5, maxStorage: 500000000, maxApiCalls: 10000, maxAgents: 10 },
  pro: { maxPostsPerDay: 200, maxScheduledPosts: 1000, maxTeamMembers: 20, maxStorage: 2000000000, maxApiCalls: 50000, maxAgents: 50 },
  enterprise: { maxPostsPerDay: 999999, maxScheduledPosts: 999999, maxTeamMembers: 999, maxStorage: 999999999999, maxApiCalls: 999999999, maxAgents: 999 },
};

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `wl_${crypto.randomUUID()}`;
  }
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `wl_${timestamp}_${randomPart}`;
}

function safeJsonParse<T>(jsonString: string | null, fallback: T): T {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.error('[whitelabel] JSON parse error:', error);
    return fallback;
  }
}

function escapeHtml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeColor(color: string): string {
  if (/^#[0-9A-Fa-f]{3,6}$/.test(color)) return color;
  if (/^rgb\(\d+\s*,\s*\d+\s*,\s*\d+\)$/.test(color)) return color;
  if (/^rgba\(\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\)$/.test(color)) return color;
  return '#6366f1';
}

function sanitizeFontFamily(fontFamily: string): string {
  if (!fontFamily || /[;{}]/.test(fontFamily)) return 'system-ui, -apple-system, sans-serif';
  return fontFamily.split(',')[0].trim().replace(/["']/g, '') || 'system-ui, -apple-system, sans-serif';
}

function sanitizeCssProperty(value: string): string {
  return value.replace(/[;<>{}]/g, '');
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export const defaultWhiteLabelConfig: WhiteLabelConfig = {
  id: 'default',
  name: 'NexusAI',
  primaryColor: '#6366f1',
  secondaryColor: '#8b5cf6',
  accentColor: '#10b981',
  backgroundColor: '#0a0a0a',
  textColor: '#ffffff',
  features: {
    showPoweredBy: true,
    showBranding: true,
    customDomain: false,
    apiAccess: true,
    teamSeats: 5,
    customPlugins: false,
    whiteLabelDomain: false,
  },
  limits: PLAN_LIMITS.free,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export async function getWhiteLabelConfig(): Promise<WhiteLabelConfig> {
  const customConfig = await kvGet(WHITE_LABEL_KEY);
  return safeJsonParse(customConfig, defaultWhiteLabelConfig);
}

export async function updateWhiteLabelConfig(
  updates: Partial<WhiteLabelConfig>
): Promise<WhiteLabelConfig> {
  const current = await getWhiteLabelConfig();
  
  const updated: WhiteLabelConfig = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await kvSet(WHITE_LABEL_KEY, JSON.stringify(updated));
  
  return updated;
}

export async function resetWhiteLabelConfig(): Promise<WhiteLabelConfig> {
  await kvSet(WHITE_LABEL_KEY, JSON.stringify(defaultWhiteLabelConfig));
  return defaultWhiteLabelConfig;
}

const tenantLocks = new Map<string, Promise<void>>();

async function withTenantLock<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  let lock = tenantLocks.get(tenantId);
  const releaseLock = () => tenantLocks.delete(tenantId);
  
  if (lock) {
    await lock;
  }
  
  lock = fn().then(fn => {
    releaseLock();
    return fn;
  }).catch(err => {
    releaseLock();
    throw err;
  }) as Promise<void>;
  
  tenantLocks.set(tenantId, lock);
  return lock as unknown as Promise<T>;
}

export async function createTenant(
  slug: string,
  name: string,
  plan: Tenant['plan'] = 'free'
): Promise<Tenant> {
  const normalizedSlug = slug.toLowerCase().trim();
  
  if (!/^[a-z0-9-]+$/.test(normalizedSlug)) {
    throw new Error('Invalid slug format: only lowercase letters, numbers, and hyphens allowed');
  }

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const existingTenants = await listTenants();
    
    if (existingTenants.some(t => t.slug === normalizedSlug)) {
      throw new Error('Tenant slug already exists');
    }

    const tenant: Tenant = {
      id: generateId(),
      slug: normalizedSlug,
      name: escapeHtml(name),
      whiteLabelId: 'default',
      plan,
      status: 'trial',
      settings: {
        allowedFeatures: [],
        rateLimit: PLAN_LIMITS[plan].maxApiCalls,
        maxStorage: PLAN_LIMITS[plan].maxStorage,
        ssoEnabled: false,
      },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const tenantsAfter = [...existingTenants, tenant];
    await kvSet(TENANTS_KEY, JSON.stringify(tenantsAfter));

    const verified = await listTenants();
    if (verified.some(t => t.id === tenant.id)) {
      return tenant;
    }
  }

  throw new Error('Failed to create tenant after multiple attempts');
}

export async function getTenant(tenantId: string): Promise<Tenant | null> {
  const tenants = await listTenants();
  return tenants.find(t => t.id === tenantId) || null;
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const tenants = await listTenants();
  return tenants.find(t => t.slug === slug.toLowerCase()) || null;
}

const MUTABLE_SETTINGS = ['allowedFeatures', 'rateLimit', 'maxStorage', 'customDomain', 'ssoEnabled', 'ssoProvider'] as const;

export async function updateTenant(
  tenantId: string,
  updates: Partial<Tenant>
): Promise<boolean> {
  return withTenantLock(tenantId, async () => {
    const tenantsData = await kvGet(TENANTS_KEY);
    const tenants: Tenant[] = safeJsonParse(tenantsData, []);
    const index = tenants.findIndex(t => t.id === tenantId);

    if (index === -1) return false;

    const existing = tenants[index];
    const sanitizedUpdates: Partial<Tenant> = {
      id: existing.id,
      slug: existing.slug,
      whiteLabelId: existing.whiteLabelId,
      createdAt: existing.createdAt,
    };

    if (updates.status) {
      sanitizedUpdates.status = updates.status;
    }
    if (updates.plan) {
      sanitizedUpdates.plan = updates.plan;
    }
    if (updates.name) {
      sanitizedUpdates.name = escapeHtml(updates.name);
    }
    if (updates.expiresAt) {
      sanitizedUpdates.expiresAt = updates.expiresAt;
    }

    if (updates.settings) {
      const sanitizedSettings: TenantSettings = { ...existing.settings };
      for (const key of MUTABLE_SETTINGS) {
        if (key in updates.settings) {
          (sanitizedSettings as unknown as Record<string, unknown>)[key] = (updates.settings as unknown as Record<string, unknown>)[key];
        }
      }
      sanitizedUpdates.settings = sanitizedSettings;
    }

    tenants[index] = { ...existing, ...sanitizedUpdates };
    await kvSet(TENANTS_KEY, JSON.stringify(tenants));

    return true;
  });
}

export async function listTenants(): Promise<Tenant[]> {
  const tenantsData = await kvGet(TENANTS_KEY);
  return safeJsonParse(tenantsData, []);
}

export async function suspendTenant(tenantId: string): Promise<boolean> {
  return updateTenant(tenantId, { status: 'suspended' });
}

export async function activateTenant(tenantId: string): Promise<boolean> {
  return updateTenant(tenantId, { status: 'active' });
}

export function generateWhiteLabelCss(config: WhiteLabelConfig): string {
  return `
:root {
  --primary: ${sanitizeColor(config.primaryColor)};
  --secondary: ${sanitizeColor(config.secondaryColor)};
  --accent: ${sanitizeColor(config.accentColor)};
  --background: ${sanitizeColor(config.backgroundColor)};
  --text: ${sanitizeColor(config.textColor)};
  --font-family: ${sanitizeFontFamily(config.fontFamily || '')};
}

body {
  background-color: var(--background);
  color: var(--text);
  font-family: var(--font-family);
}

.primary-color { color: var(--primary); }
.secondary-color { color: var(--secondary); }
.accent-color { color: var(--accent); }

.bg-primary { background-color: var(--primary); }
.bg-secondary { background-color: var(--secondary); }
.bg-accent { background-color: var(--accent); }

${config.customCss ? sanitizeCssProperty(config.customCss) : ''}
  `.trim();
}

export function generateWhiteLabelMeta(config: WhiteLabelConfig): string {
  const primaryColor = escapeHtml(sanitizeColor(config.primaryColor));
  const name = escapeHtml(config.name);
  const favicon = config.favicon && isValidUrl(config.favicon) ? escapeHtml(config.favicon) : '/favicon.ico';
  const logo = config.logo && isValidUrl(config.logo) ? escapeHtml(config.logo) : '/icon.png';

  return `
<meta name="theme-color" content="${primaryColor}">
<meta name="apple-mobile-web-app-title" content="${name}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="icon" type="image/x-icon" href="${favicon}">
<link rel="apple-touch-icon" href="${logo}">
  `.trim();
}

export async function checkDomainAvailability(domain: string): Promise<{ available: boolean; suggestion?: string }> {
  const normalizedDomain = domain.toLowerCase();
  const tenants = await listTenants();
  
  const isSlugTaken = tenants.some(t => t.slug === normalizedDomain);
  const isCustomDomainTaken = tenants.some(t => t.settings.customDomain?.toLowerCase() === normalizedDomain);
  
  if (isSlugTaken || isCustomDomainTaken) {
    return { available: false, suggestion: `${normalizedDomain}-app` };
  }

  return { available: true };
}

export async function setCustomDomain(
  tenantId: string,
  domain: string
): Promise<{ success: boolean; error?: string }> {
  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return { success: false, error: 'Tenant not found' };
  }

  if (!isValidUrl(`https://${domain}`)) {
    return { success: false, error: 'Invalid domain format' };
  }

  await updateTenant(tenantId, {
    settings: { ...tenant.settings, customDomain: domain },
  });

  return { success: true };
}

export function getTenantLimits(tenant: Tenant): WhiteLabelLimits {
  return PLAN_LIMITS[tenant.plan];
}