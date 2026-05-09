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

function generateId(): string {
  return `wl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
  limits: {
    maxPostsPerDay: 50,
    maxScheduledPosts: 500,
    maxTeamMembers: 10,
    maxStorage: 1000000000,
    maxApiCalls: 10000,
    maxAgents: 20,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export async function getWhiteLabelConfig(tenantId?: string): Promise<WhiteLabelConfig> {
  const customConfig = await kvGet(WHITE_LABEL_KEY);
  
  if (customConfig) {
    return JSON.parse(customConfig);
  }

  return defaultWhiteLabelConfig;
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

export async function createTenant(
  slug: string,
  name: string,
  plan: Tenant['plan'] = 'free'
): Promise<Tenant> {
  const tenantsData = await kvGet(TENANTS_KEY);
  const tenants: Tenant[] = tenantsData ? JSON.parse(tenantsData) : [];

  if (tenants.some(t => t.slug === slug)) {
    throw new Error('Tenant slug already exists');
  }

  const limits: Record<Tenant['plan'], WhiteLabelLimits> = {
    free: { maxPostsPerDay: 10, maxScheduledPosts: 50, maxTeamMembers: 2, maxStorage: 100000000, maxApiCalls: 1000, maxAgents: 5 },
    starter: { maxPostsPerDay: 50, maxScheduledPosts: 200, maxTeamMembers: 5, maxStorage: 500000000, maxApiCalls: 10000, maxAgents: 10 },
    pro: { maxPostsPerDay: 200, maxScheduledPosts: 1000, maxTeamMembers: 20, maxStorage: 2000000000, maxApiCalls: 50000, maxAgents: 50 },
    enterprise: { maxPostsPerDay: 999999, maxScheduledPosts: 999999, maxTeamMembers: 999, maxStorage: 999999999999, maxApiCalls: 999999999, maxAgents: 999 },
  };

  const tenant: Tenant = {
    id: generateId(),
    slug,
    name,
    whiteLabelId: 'default',
    plan,
    status: 'trial',
    settings: {
      allowedFeatures: [],
      rateLimit: limits[plan].maxApiCalls,
      maxStorage: limits[plan].maxStorage,
    },
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  };

  tenants.push(tenant);
  await kvSet(TENANTS_KEY, JSON.stringify(tenants));

  return tenant;
}

export async function getTenant(tenantId: string): Promise<Tenant | null> {
  const tenantsData = await kvGet(TENANTS_KEY);
  const tenants: Tenant[] = tenantsData ? JSON.parse(tenantsData) : [];
  return tenants.find(t => t.id === tenantId) || null;
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const tenantsData = await kvGet(TENANTS_KEY);
  const tenants: Tenant[] = tenantsData ? JSON.parse(tenantsData) : [];
  return tenants.find(t => t.slug === slug) || null;
}

export async function updateTenant(
  tenantId: string,
  updates: Partial<Tenant>
): Promise<boolean> {
  const tenantsData = await kvGet(TENANTS_KEY);
  const tenants: Tenant[] = tenantsData ? JSON.parse(tenantsData) : [];
  const index = tenants.findIndex(t => t.id === tenantId);

  if (index === -1) return false;

  tenants[index] = { ...tenants[index], ...updates };
  await kvSet(TENANTS_KEY, JSON.stringify(tenants));

  return true;
}

export async function listTenants(): Promise<Tenant[]> {
  const tenantsData = await kvGet(TENANTS_KEY);
  return tenantsData ? JSON.parse(tenantsData) : [];
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
  --primary: ${config.primaryColor};
  --secondary: ${config.secondaryColor};
  --accent: ${config.accentColor};
  --background: ${config.backgroundColor};
  --text: ${config.textColor};
  --font-family: ${config.fontFamily || 'system-ui, -apple-system, sans-serif'};
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

${config.customCss || ''}
  `.trim();
}

export function generateWhiteLabelMeta(config: WhiteLabelConfig): string {
  return `
<meta name="theme-color" content="${config.primaryColor}">
<meta name="apple-mobile-web-app-title" content="${config.name}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="icon" type="image/x-icon" href="${config.favicon || '/favicon.ico'}">
<link rel="apple-touch-icon" href="${config.logo || '/icon.png'}">
  `.trim();
}

export async function checkDomainAvailability(domain: string): Promise<{ available: boolean; suggestion?: string }> {
  const tenants = await listTenants();
  
  if (tenants.some(t => t.slug === domain.toLowerCase())) {
    return { available: false, suggestion: `${domain}-app` };
  }

  return { available: true };
}

export async function verifyCustomDomain(
  tenantId: string,
  domain: string
): Promise<{ verified: boolean; error?: string }> {
  const tenant = await getTenant(tenantId);
  if (!tenant) {
    return { verified: false, error: 'Tenant not found' };
  }

  await updateTenant(tenantId, {
    settings: { ...tenant.settings, customDomain: domain },
  });

  return { verified: true };
}

export function getTenantLimits(tenant: Tenant): WhiteLabelLimits {
  const limits: Record<Tenant['plan'], WhiteLabelLimits> = {
    free: { maxPostsPerDay: 10, maxScheduledPosts: 50, maxTeamMembers: 2, maxStorage: 100000000, maxApiCalls: 1000, maxAgents: 5 },
    starter: { maxPostsPerDay: 50, maxScheduledPosts: 200, maxTeamMembers: 5, maxStorage: 500000000, maxApiCalls: 10000, maxAgents: 10 },
    pro: { maxPostsPerDay: 200, maxScheduledPosts: 1000, maxTeamMembers: 20, maxStorage: 2000000000, maxApiCalls: 50000, maxAgents: 50 },
    enterprise: { maxPostsPerDay: 999999, maxScheduledPosts: 999999, maxTeamMembers: 999, maxStorage: 999999999999, maxApiCalls: 999999999, maxAgents: 999 },
  };

  return limits[tenant.plan];
}