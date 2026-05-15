// Service Worker for NexusAI Offline Generation
// This enables offline content generation and caching

const CACHE_NAME = 'nexusai-v1';
const OFFLINE_QUEUE_KEY = 'offline_generation_queue';

// Precache essential assets
const PRECACHE_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
];

// Install event - precache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    // For POST requests, queue them for later sync
    if (event.request.url.includes('/api/')) {
      event.respondWith(
        fetch(event.request).catch(() => {
          // Queue the failed request
          return queueFailedRequest(event.request);
        })
      );
      return;
    }
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Return offline page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
          
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Background sync event
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-generations') {
    event.waitUntil(syncOfflineGenerations());
  }
});

// Message event - handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'QUEUE_OFFLINE_GENERATION') {
    event.waitUntil(
      queueOfflineGeneration(event.data.request)
    );
  }
  
  if (event.data && event.data.type === 'GET_OFFLINE_QUEUE') {
    event.waitUntil(
      getOfflineQueue().then((queue) => {
        event.source.postMessage({
          type: 'OFFLINE_QUEUE_RESPONSE',
          queue,
        });
      })
    );
  }
});

/**
 * Queue a failed request for later retry
 */
async function queueFailedRequest(request: Request): Promise<Response> {
  try {
    const queue = await getOfflineQueue();
    queue.push({
      url: request.url,
      method: request.method,
      timestamp: Date.now(),
    });
    await saveOfflineQueue(queue);
    
    return new Response('Request queued for later sync', { status: 202 });
  } catch {
    return new Response('Failed to queue request', { status: 500 });
  }
}

/**
 * Get the offline request queue
 */
async function getOfflineQueue(): Promise<Array<{ url: string; method: string; timestamp: number }>> {
  // In a real implementation, this would use IndexedDB
  // For now, we'll use a simple in-memory queue
  return [];
}

/**
 * Save the offline request queue
 */
async function saveOfflineQueue(queue: Array<{ url: string; method: string; timestamp: number }>): Promise<void> {
  // In a real implementation, this would use IndexedDB
}

/**
 * Queue an offline generation request
 */
async function queueOfflineGeneration(request: any): Promise<void> {
  const queue = await getOfflineQueue();
  queue.push({
    ...request,
    queuedAt: Date.now(),
  });
  await saveOfflineQueue(queue);
}

/**
 * Sync offline generations when back online
 */
async function syncOfflineGenerations(): Promise<void> {
  const queue = await getOfflineQueue();
  
  for (const item of queue) {
    try {
      // Retry the queued request
      await fetch(item.url, {
        method: item.method,
      });
    } catch {
      // Failed again, keep in queue
      continue;
    }
  }
  
  // Clear the queue
  await saveOfflineQueue([]);
  
  // Notify clients
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({
      type: 'SYNC_COMPLETE',
      synced: queue.length,
    });
  });
}
