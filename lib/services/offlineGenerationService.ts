import { offlineSyncManager } from './offlineSyncManager';

export function isOfflineMode(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Wraps a service call with offline resilience.
 * If the network is down, it queues the action instead of failing.
 */
export async function withOfflineResilience<T>(
  actionName: string, 
  actionFn: () => Promise<T>,
  fallbackValue: T
): Promise<T> {
  if (isOfflineMode()) {
    await offlineSyncManager.queueAction({
      type: actionName,
      payload: { status: 'pending_offline' },
      timestamp: new Date().toISOString()
    });
    return fallbackValue;
  }
  
  try {
    return await actionFn();
  } catch (e) {
    if (isOfflineMode()) {
      return fallbackValue;
    }
    throw e;
  }
}
