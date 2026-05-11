/**
 * Public API Layer
 * RESTful API for third-party integrations
 */

import { kvGet, kvSet } from '@/lib/services/puterService';

export type ApiKeyScope = 'read' | 'write' | 'admin';
export type ApiKeyStatus = 'active' | 'revoked' | 'expired';

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  scope: ApiKeyScope;
  status: ApiKeyStatus;
  tenantId?: string;
  permissions: string[];
  rateLimit: number;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
}

export interface ApiWebhook {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: string;
}

export interface ApiRateLimit {
  key: string;
  requests: number;
  resetAt: number;
}

const API_KEYS_KEY = 'api_keys';
const API_WEBHOOKS_KEY = 'api_webhooks';
const API_RATE_LIMITS_KEY = 'api_rate_limits';

const MAX_REQUESTS_PER_MINUTE = 100;

function generateId(): string {
  return `api_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'nxa_';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

async function loadApiKeys(): Promise<ApiKey[]> {
  const data = await kvGet(API_KEYS_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveApiKeys(keys: ApiKey[]): Promise<void> {
  await kvSet(API_KEYS_KEY, JSON.stringify(keys.slice(0, 50)));
}

export async function createApiKey(
  name: string,
  scope: ApiKeyScope,
  permissions: string[],
  expiresInDays?: number,
  tenantId?: string
): Promise<ApiKey> {
  const keys = await loadApiKeys();

  const key: ApiKey = {
    id: generateId(),
    name,
    key: generateApiKey(),
    scope,
    status: 'active',
    tenantId,
    permissions,
    rateLimit: scope === 'admin' ? 1000 : scope === 'write' ? 500 : 100,
    createdAt: new Date().toISOString(),
    expiresAt: expiresInDays 
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() 
      : undefined,
  };

  keys.push(key);
  await saveApiKeys(keys);

  return key;
}

export async function getApiKey(keyId: string): Promise<ApiKey | null> {
  const keys = await loadApiKeys();
  return keys.find(k => k.id === keyId) || null;
}

export async function getApiKeyByKey(key: string): Promise<ApiKey | null> {
  const keys = await loadApiKeys();
  return keys.find(k => k.key === key && k.status === 'active') || null;
}

export async function validateApiKey(key: string): Promise<{
  valid: boolean;
  apiKey?: ApiKey;
  error?: string;
}> {
  const apiKey = await getApiKeyByKey(key);

  if (!apiKey) {
    return { valid: false, error: 'Invalid API key' };
  }

  if (apiKey.status !== 'active') {
    return { valid: false, error: 'API key is not active' };
  }

  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    return { valid: false, error: 'API key has expired' };
  }

  apiKey.lastUsedAt = new Date().toISOString();
  const keys = await loadApiKeys();
  const index = keys.findIndex(k => k.id === apiKey.id);
  if (index !== -1) {
    keys[index] = apiKey;
    await saveApiKeys(keys);
  }

  return { valid: true, apiKey };
}

export async function listApiKeys(tenantId?: string): Promise<ApiKey[]> {
  const keys = await loadApiKeys();
  if (tenantId) {
    return keys.filter(k => k.tenantId === tenantId);
  }
  return keys;
}

export async function revokeApiKey(keyId: string): Promise<boolean> {
  const keys = await loadApiKeys();
  const index = keys.findIndex(k => k.id === keyId);

  if (index === -1) return false;

  keys[index].status = 'revoked';
  await saveApiKeys(keys);
  return true;
}

export async function deleteApiKey(keyId: string): Promise<boolean> {
  const keys = await loadApiKeys();
  const filtered = keys.filter(k => k.id !== keyId);
  
  if (filtered.length === keys.length) return false;
  
  await saveApiKeys(filtered);
  return true;
}

export async function checkRateLimit(key: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
}> {
  const limitsData = await kvGet(API_RATE_LIMITS_KEY);
  const limits: Record<string, ApiRateLimit> = limitsData ? JSON.parse(limitsData) : {};

  const now = Date.now();
  const resetTime = Math.ceil(now / 60000) * 60000;

  if (!limits[key] || limits[key].resetAt < now) {
    limits[key] = { key, requests: 0, resetAt: resetTime };
  }

  limits[key].requests++;

  const remaining = MAX_REQUESTS_PER_MINUTE - limits[key].requests;
  const allowed = remaining >= 0;

  await kvSet(API_RATE_LIMITS_KEY, JSON.stringify(limits));

  return {
    allowed,
    remaining: Math.max(0, remaining),
    resetAt: limits[key].resetAt,
  };
}

export function hasPermission(apiKey: ApiKey, permission: string): boolean {
  if (apiKey.scope === 'admin') return true;
  if (apiKey.scope === 'write') return apiKey.permissions.includes(permission) || apiKey.permissions.includes('*');
  if (apiKey.scope === 'read') return apiKey.permissions.includes(permission) || apiKey.permissions.includes('*') || permission.startsWith('read:');
  return false;
}

export async function registerWebhook(
  url: string,
  events: string[],
  secret: string
): Promise<ApiWebhook> {
  const webhooksData = await kvGet(API_WEBHOOKS_KEY);
  const webhooks: ApiWebhook[] = webhooksData ? JSON.parse(webhooksData) : [];

  const webhook: ApiWebhook = {
    id: generateId(),
    url,
    events,
    secret,
    active: true,
    createdAt: new Date().toISOString(),
  };

  webhooks.push(webhook);
  await kvSet(API_WEBHOOKS_KEY, JSON.stringify(webhooks));

  return webhook;
}

export async function listWebhooks(): Promise<ApiWebhook[]> {
  const webhooksData = await kvGet(API_WEBHOOKS_KEY);
  return webhooksData ? JSON.parse(webhooksData) : [];
}

export async function deleteWebhook(webhookId: string): Promise<boolean> {
  const webhooksData = await kvGet(API_WEBHOOKS_KEY);
  const webhooks: ApiWebhook[] = webhooksData ? JSON.parse(webhooksData) : [];
  const filtered = webhooks.filter(w => w.id !== webhookId);
  
  if (filtered.length === webhooks.length) return false;
  
  await kvSet(API_WEBHOOKS_KEY, JSON.stringify(filtered));
  return true;
}

export async function triggerWebhook(
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  const webhooks = await listWebhooks();
  
  const matchingWebhooks = webhooks.filter(w => 
    w.active && (w.events.includes('*') || w.events.includes(event))
  );

  for (const webhook of matchingWebhooks) {
    try {
      const payload = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data,
      });

      await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
          'X-Webhook-Signature': await generateHmacSignature(payload, webhook.secret),
        },
        body: payload,
      });
    } catch (error) {
      console.error(`[API] Webhook delivery failed for ${webhook.url}:`, error);
    }
  }
}

async function generateHmacSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(payload);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export const API_PERMISSIONS = {
  'read:posts': 'Read posts and drafts',
  'write:posts': 'Create and update posts',
  'delete:posts': 'Delete posts',
  'read:analytics': 'Read analytics data',
  'write:media': 'Upload and manage media',
  'read:schedules': 'Read scheduled posts',
  'write:schedules': 'Create and manage schedules',
  'read:agents': 'Read agent configurations',
  'write:agents': 'Create and update agents',
  'read:brand': 'Read brand kit',
  'write:brand': 'Update brand kit',
  'read:team': 'Read team members',
  'write:team': 'Manage team members',
  'webhooks:manage': 'Manage webhooks',
  'api:manage': 'Manage API keys',
};

export const API_ENDPOINTS = {
  posts: {
    list: 'GET /v1/posts',
    get: 'GET /v1/posts/:id',
    create: 'POST /v1/posts',
    update: 'PUT /v1/posts/:id',
    delete: 'DELETE /v1/posts/:id',
  },
  media: {
    list: 'GET /v1/media',
    upload: 'POST /v1/media',
    delete: 'DELETE /v1/media/:id',
  },
  analytics: {
    overview: 'GET /v1/analytics/overview',
    posts: 'GET /v1/analytics/posts',
    engagement: 'GET /v1/analytics/engagement',
  },
  schedules: {
    list: 'GET /v1/schedules',
    create: 'POST /v1/schedules',
    update: 'PUT /v1/schedules/:id',
    delete: 'DELETE /v1/schedules/:id',
  },
  brand: {
    get: 'GET /v1/brand',
    update: 'PUT /v1/brand',
  },
  team: {
    list: 'GET /v1/team',
    invite: 'POST /v1/team/invite',
    remove: 'DELETE /v1/team/:id',
  },
  webhooks: {
    list: 'GET /v1/webhooks',
    create: 'POST /v1/webhooks',
    delete: 'DELETE /v1/webhooks/:id',
  },
};

export async function generateApiDocumentation(): Promise<string> {
  const endpoints = Object.entries(API_ENDPOINTS).map(([category, methods]) => {
    const methodDocs = Object.entries(methods).map(([name, path]) => {
      return `  ${path}`;
    }).join('\n');
    
    return `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n${methodDocs}`;
  }).join('\n\n');

  return `# NexusAI API Documentation

## Authentication
Include your API key in the request header:
\`Authorization: Bearer YOUR_API_KEY\`

## Endpoints

${endpoints}

## Rate Limits
- Read: 100 requests/minute
- Write: 500 requests/minute
- Admin: 1000 requests/minute

## Webhooks
Subscribe to events: posts, media, analytics, schedules, team, system

## Errors
- 401: Invalid or expired API key
- 403: Insufficient permissions
- 429: Rate limit exceeded
- 500: Internal server error
`;
}