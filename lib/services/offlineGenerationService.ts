import { offlineSyncManager, SyncAction } from './offlineSyncManager';
import { kvGet, kvSet } from './puterService';

export interface OfflineGenerationRequest {
  id: string;
  type: 'text' | 'image' | 'video' | 'audio';
  prompt: string;
  parameters?: Record<string, unknown>;
  timestamp: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: string;
  error?: string;
}

export function isOfflineMode(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Check if service worker is registered and active
 */
export async function isServiceWorkerActive(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  return registrations.some(reg => reg.active !== null);
}

/**
 * Register the service worker for offline generation
 */
export async function registerServiceWorker(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    console.warn('[OfflineGeneration] Service workers not supported');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    if (registration.installing) {
      console.log('[OfflineGeneration] Service worker installing');
    } else if (registration.waiting) {
      console.log('[OfflineGeneration] Service worker installed');
    } else if (registration.active) {
      console.log('[OfflineGeneration] Service worker active');
    }

    return true;
  } catch (error) {
    console.error('[OfflineGeneration] Service worker registration failed:', error);
    return false;
  }
}

/**
 * Queue a generation request for offline processing
 */
export async function queueOfflineGeneration(request: Omit<OfflineGenerationRequest, 'id' | 'timestamp' | 'status'>): Promise<string> {
  const id = `offline_gen_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  
  const action: Omit<SyncAction, 'id' | 'status'> = {
    type: 'offline_generation',
    payload: {
      ...request,
      id,
      timestamp: new Date().toISOString(),
      status: 'queued',
    },
    timestamp: new Date().toISOString(),
    priority: request.type === 'text' ? 1 : request.type === 'image' ? 2 : 3,
  };

  await offlineSyncManager.queueAction(action);
  
  // Also store in local generation queue for service worker
  const queue = await getOfflineGenerationQueue();
  queue.push({
    ...request,
    id,
    timestamp: new Date().toISOString(),
    status: 'queued',
  });
  await saveOfflineGenerationQueue(queue);

  return id;
}

/**
 * Get the offline generation queue
 */
export async function getOfflineGenerationQueue(): Promise<OfflineGenerationRequest[]> {
  const data = await kvGet('offline_generation_queue');
  return data ? JSON.parse(data) : [];
}

/**
 * Save the offline generation queue
 */
async function saveOfflineGenerationQueue(queue: OfflineGenerationRequest[]): Promise<void> {
  await kvSet('offline_generation_queue', JSON.stringify(queue));
}

/**
 * Process a queued offline generation request
 */
export async function processOfflineGeneration(
  request: OfflineGenerationRequest,
  generationFn: (prompt: string, params?: Record<string, unknown>) => Promise<string>
): Promise<OfflineGenerationRequest> {
  try {
    request.status = 'processing';
    await updateOfflineGenerationRequest(request);

    const result = await generationFn(request.prompt, request.parameters);
    
    request.status = 'completed';
    request.result = result;
    await updateOfflineGenerationRequest(request);

    // Remove from sync queue
    const queue = await getOfflineGenerationQueue();
    const filtered = queue.filter(r => r.id !== request.id);
    await saveOfflineGenerationQueue(filtered);

    return request;
  } catch (error) {
    request.status = 'failed';
    request.error = error instanceof Error ? error.message : 'Unknown error';
    await updateOfflineGenerationRequest(request);
    return request;
  }
}

/**
 * Update a generation request in the queue
 */
async function updateOfflineGenerationRequest(request: OfflineGenerationRequest): Promise<void> {
  const queue = await getOfflineGenerationQueue();
  const index = queue.findIndex(r => r.id === request.id);
  if (index !== -1) {
    queue[index] = request;
    await saveOfflineGenerationQueue(queue);
  }
}

/**
 * Flush all queued offline generations when back online
 */
export async function flushOfflineGenerations(
  generationFn: (prompt: string, params?: Record<string, unknown>) => Promise<string>
): Promise<{ succeeded: number; failed: number }> {
  const queue = await getOfflineGenerationQueue();
  const pending = queue.filter(r => r.status === 'queued');

  let succeeded = 0;
  let failed = 0;

  for (const request of pending) {
    const result = await processOfflineGeneration(request, generationFn);
    if (result.status === 'completed') {
      succeeded++;
    } else {
      failed++;
    }
  }

  return { succeeded, failed };
}

/**
 * Get offline generation statistics
 */
export async function getOfflineGenerationStats(): Promise<{
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
}> {
  const queue = await getOfflineGenerationQueue();
  return {
    total: queue.length,
    queued: queue.filter(r => r.status === 'queued').length,
    processing: queue.filter(r => r.status === 'processing').length,
    completed: queue.filter(r => r.status === 'completed').length,
    failed: queue.filter(r => r.status === 'failed').length,
  };
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
