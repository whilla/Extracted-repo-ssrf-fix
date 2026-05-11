import { kvGet, kvSet } from './puterService';

export interface WebhookTrigger {
  id: string;
  name: string;
  event: WebhookEvent;
  url: string;
  headers?: Record<string, string>;
  enabled: boolean;
  filters?: WebhookFilter[];
  transformations?: WebhookTransformation[];
  retryPolicy?: RetryPolicy;
  createdAt: string;
  lastTriggered?: string;
  failureCount: number;
}

export type WebhookEvent = 
  | 'content.generated'
  | 'content.published'
  | 'content.scheduled'
  | 'content.failed'
  | 'analytics.spike'
  | 'analytics.milestone'
  | 'viral.detected'
  | 'approval.required'
  | 'approval.approved'
  | 'approval.rejected'
  | 'agent.error'
  | 'provider.failure';

export interface WebhookFilter {
  field: string;
  operator: 'equals' | 'contains' | 'gt' | 'lt' | 'in' | 'not';
  value: string | number | boolean;
}

export interface WebhookTransformation {
  type: 'template' | 'extract' | 'map';
  expression: string;
  outputKey: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  exponentialBackoff: boolean;
}

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, any>;
  metadata?: {
    userId?: string;
    contentId?: string;
    platform?: string;
  };
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 1000,
  exponentialBackoff: true,
};

export const webhookCustomizationService = {
  async getAllTriggers(): Promise<WebhookTrigger[]> {
    const stored = await kvGet('webhook_triggers');
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  },

  async createTrigger(params: {
    name: string;
    event: WebhookEvent;
    url: string;
    headers?: Record<string, string>;
    filters?: WebhookFilter[];
    transformations?: WebhookTransformation[];
    retryPolicy?: RetryPolicy;
  }): Promise<WebhookTrigger> {
    const triggers = await this.getAllTriggers();
    
    const newTrigger: WebhookTrigger = {
      id: `webhook_${crypto.randomUUID()}`,
      name: params.name,
      event: params.event,
      url: params.url,
      headers: params.headers,
      enabled: true,
      filters: params.filters,
      transformations: params.transformations,
      retryPolicy: params.retryPolicy || DEFAULT_RETRY_POLICY,
      createdAt: new Date().toISOString(),
      failureCount: 0,
    };

    triggers.push(newTrigger);
    await kvSet('webhook_triggers', JSON.stringify(triggers));
    
    return newTrigger;
  },

  async updateTrigger(id: string, updates: Partial<WebhookTrigger>): Promise<WebhookTrigger | null> {
    const triggers = await this.getAllTriggers();
    const index = triggers.findIndex(t => t.id === id);
    if (index === -1) return null;

    triggers[index] = { ...triggers[index], ...updates };
    await kvSet('webhook_triggers', JSON.stringify(triggers));
    return triggers[index];
  },

  async deleteTrigger(id: string): Promise<boolean> {
    const triggers = await this.getAllTriggers();
    const filtered = triggers.filter(t => t.id !== id);
    if (filtered.length === triggers.length) return false;
    await kvSet('webhook_triggers', JSON.stringify(filtered));
    return true;
  },

  async triggerWebhooks(event: WebhookEvent, data: Record<string, any>, metadata?: WebhookPayload['metadata']): Promise<void> {
    const triggers = await this.getAllTriggers();
    const matchingTriggers = triggers.filter(t => t.enabled && t.event === event);

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
      metadata,
    };

    await Promise.allSettled(
      matchingTriggers.map(trigger => this.executeTrigger(trigger, payload))
    );
  },

  async executeTrigger(trigger: WebhookTrigger, payload: WebhookPayload): Promise<void> {
    if (trigger.filters && !this.evaluateFilters(payload, trigger.filters)) {
      return;
    }

    const transformedPayload = trigger.transformations
      ? this.applyTransformations(payload, trigger.transformations)
      : payload;

    const retryPolicy = trigger.retryPolicy || DEFAULT_RETRY_POLICY;
    let attempt = 0;

    while (attempt < retryPolicy.maxAttempts) {
      try {
        const response = await fetch(trigger.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-NexusAI-Event': payload.event,
            'X-NexusAI-Timestamp': payload.timestamp,
            ...trigger.headers,
          },
          body: JSON.stringify(transformedPayload),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        await this.updateTrigger(trigger.id, {
          lastTriggered: new Date().toISOString(),
          failureCount: 0,
        });
        return;
      } catch (error) {
        attempt++;
        const waitTime = retryPolicy.exponentialBackoff
          ? retryPolicy.backoffMs * Math.pow(2, attempt - 1)
          : retryPolicy.backoffMs;

        if (attempt < retryPolicy.maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    await this.updateTrigger(trigger.id, {
      failureCount: trigger.failureCount + 1,
    });
  },

  evaluateFilters(payload: WebhookPayload, filters: WebhookFilter[]): boolean {
    return filters.every(filter => {
      const value = this.getNestedValue(payload, filter.field);
      switch (filter.operator) {
        case 'equals': return value === filter.value;
        case 'contains': return String(value).includes(String(filter.value));
        case 'gt': return Number(value) > Number(filter.value);
        case 'lt': return Number(value) < Number(filter.value);
        case 'in': return ((filter.value as unknown) as any[]).includes(value);
        case 'not': return value !== filter.value;
        default: return true;
      }
    });
  },

  getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  },

  applyTransformations(payload: WebhookPayload, transformations: WebhookTransformation[]): any {
    const result: any = { ...payload };

    transformations.forEach(t => {
      const value = this.getNestedValue(payload, t.expression);
      result[t.outputKey] = value;
    });

    return result;
  },

  async testTrigger(id: string, testPayload?: Record<string, any>): Promise<{ success: boolean; response?: any; error?: string }> {
    const triggers = await this.getAllTriggers();
    const trigger = triggers.find(t => t.id === id);
    if (!trigger) {
      return { success: false, error: 'Trigger not found' };
    }

    const payload: WebhookPayload = {
      event: trigger.event,
      timestamp: new Date().toISOString(),
      data: testPayload || {
        test: true,
        message: 'This is a test webhook payload from NexusAI',
        sampleData: 'All systems operational',
      },
      metadata: { userId: 'test-user' },
    };

    try {
      const response = await fetch(trigger.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NexusAI-Event': payload.event,
          'X-NexusAI-Timestamp': payload.timestamp,
          ...trigger.headers,
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.text().catch(() => null);
      return {
        success: response.ok,
        response: responseData,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};
