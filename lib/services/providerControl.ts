import type { AIModel } from '@/lib/types';
import { kvDelete, kvGet, kvSet } from './puterService';

export const DISABLE_PUTER_FALLBACK_KEY = 'disable_puter_fallback';
export const PROVIDER_EVENT_NAME = 'nexus:provider-event';

export type ProviderEventDetail =
  | {
      type: 'provider_switched';
      from: string;
      to: string;
      model: string;
      message: string;
    }
  | {
      type: 'puter_fallback_disabled';
      provider: string;
      model: string;
      message: string;
    }
  | {
      type: 'puter_credit_exhausted';
      provider: 'puter';
      model: string;
      message: string;
    };

const providerEventCooldown = new Map<string, number>();
const PROVIDER_EVENT_COOLDOWN_MS = 45000;

export async function isPuterFallbackDisabled(): Promise<boolean> {
  const raw = await kvGet(DISABLE_PUTER_FALLBACK_KEY);
  return raw === 'true';
}

export async function setPuterFallbackDisabled(disabled: boolean): Promise<boolean> {
  if (disabled) {
    return kvSet(DISABLE_PUTER_FALLBACK_KEY, 'true');
  }
  return kvDelete(DISABLE_PUTER_FALLBACK_KEY);
}

export function resolveProviderForModel(model: string, models: AIModel[]): string {
  return models.find((entry) => entry.model === model)?.provider || 'puter';
}

export function dispatchProviderEvent(detail: ProviderEventDetail): void {
  if (typeof window === 'undefined') return;

  const key = `${detail.type}:${'from' in detail ? detail.from : detail.provider}:${'to' in detail ? detail.to : detail.model}`;
  const previous = providerEventCooldown.get(key) || 0;
  const now = Date.now();
  if (now - previous < PROVIDER_EVENT_COOLDOWN_MS) {
    return;
  }

  providerEventCooldown.set(key, now);
  window.dispatchEvent(new CustomEvent<ProviderEventDetail>(PROVIDER_EVENT_NAME, { detail }));
}
