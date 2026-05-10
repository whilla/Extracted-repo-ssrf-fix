import { puterService } from './puterService';
import { kvGet, kvSet } from './puterService';

export interface SyncAction {
  id: string;
  type: string;
  payload: any;
  timestamp: string;
  priority?: number;
  retries?: number;
  status?: 'pending' | 'syncing' | 'failed' | 'completed';
}

type NetworkStatusCallback = (isOnline: boolean) => void;

/**
 * OfflineSyncManager
 * Implements a local-first synchronization queue using IndexedDB (via puterService)
 * to ensure no work is lost when the connection drops.
 */
export class OfflineSyncManager {
  private static instance: OfflineSyncManager;
  private syncQueueKey = 'nexus_offline_sync_queue';
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private statusCallbacks: Set<NetworkStatusCallback> = new Set();
  private queueLock = false;
  private lockTimeout = 5000;
  
  private async acquireLock(): Promise<boolean> {
    const start = Date.now();
    while (this.queueLock) {
      if (Date.now() - start > this.lockTimeout) return false;
      await new Promise(r => setTimeout(r, 50));
    }
    this.queueLock = true;
    return true;
  }
  
  private releaseLock(): void {
    this.queueLock = false;
  }

  private constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnlineStatusChange(true));
      window.addEventListener('offline', () => this.handleOnlineStatusChange(false));
    }
  }

  public static getInstance(): OfflineSyncManager {
    if (!OfflineSyncManager.instance) {
      OfflineSyncManager.instance = new OfflineSyncManager();
    }
    return OfflineSyncManager.instance;
  }

  /**
   * Register for network status changes
   */
  public onStatusChange(callback: NetworkStatusCallback): () => void {
    this.statusCallbacks.add(callback);
    return () => this.statusCallbacks.delete(callback);
  }

  /**
   * Get current network status
   */
  public getStatus(): boolean {
    return this.isOnline;
  }

  private handleOnlineStatusChange(online: boolean) {
    this.isOnline = online;
    this.statusCallbacks.forEach(cb => cb(online));
    if (online) {
      console.log('[OfflineSync] Network restored, triggering auto-sync');
      this.triggerAutoSync();
    }
  }

  /**
   * Queue an action to be performed when back online.
   */
  async queueAction(action: Omit<SyncAction, 'id' | 'status'>): Promise<string> {
    const locked = await this.acquireLock();
    if (!locked) throw new Error('Failed to acquire queue lock');
    try {
      const queue = await this.getQueue();
      
      const syncAction: SyncAction = {
        ...action,
        id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        status: 'pending',
        retries: 0,
      };
      
      queue.push(syncAction);
      await kvSet(this.syncQueueKey, JSON.stringify(queue));
      console.log(`[OfflineSync] Action ${action.type} queued for later sync.`);
      
      return syncAction.id;
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Queue multiple actions at once (batch)
   */
  async queueBatch(actions: Omit<SyncAction, 'id' | 'status'>[]): Promise<string[]> {
    const locked = await this.acquireLock();
    if (!locked) throw new Error('Failed to acquire queue lock');
    try {
      const queue = await this.getQueue();
      const ids: string[] = [];
      
      for (const action of actions) {
        const syncAction: SyncAction = {
          ...action,
          id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          status: 'pending',
          retries: 0,
        };
        queue.push(syncAction);
        ids.push(syncAction.id);
      }
      
      await kvSet(this.syncQueueKey, JSON.stringify(queue));
      console.log(`[OfflineSync] ${actions.length} actions queued for later sync.`);
      
      return ids;
    } finally {
      this.releaseLock();
    }
  }

  async getQueue(): Promise<SyncAction[]> {
    const data = await kvGet(this.syncQueueKey);
    return data ? JSON.parse(data) : [];
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{ total: number; pending: number; failed: number }> {
    const queue = await this.getQueue();
    return {
      total: queue.length,
      pending: queue.filter(a => a.status === 'pending').length,
      failed: queue.filter(a => a.status === 'failed').length,
    };
  }

  /**
   * Remove specific action from queue
   */
  async removeAction(actionId: string): Promise<void> {
    const locked = await this.acquireLock();
    if (!locked) throw new Error('Failed to acquire queue lock');
    try {
      const queue = await this.getQueue();
      const filtered = queue.filter(a => a.id !== actionId);
      await kvSet(this.syncQueueKey, JSON.stringify(filtered));
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Clear completed actions from queue
   */
  async clearCompleted(): Promise<number> {
    const locked = await this.acquireLock();
    if (!locked) throw new Error('Failed to acquire queue lock');
    try {
      const queue = await this.getQueue();
      const before = queue.length;
      const filtered = queue.filter(a => a.status !== 'completed');
      await kvSet(this.syncQueueKey, JSON.stringify(filtered));
      return before - filtered.length;
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Process the queue when connectivity is restored.
   */
  async flushQueue(syncCallback: (action: SyncAction) => Promise<void>): Promise<{
    succeeded: number;
    failed: number;
  }> {
    const locked = await this.acquireLock();
    if (!locked) return { succeeded: 0, failed: 0 };
    try {
      let queue = await this.getQueue();
      if (queue.length === 0) return { succeeded: 0, failed: 0 };

      console.log(`[OfflineSync] Flushing ${queue.length} queued actions...`);
      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < queue.length; i++) {
        const action = queue[i];
        if (action.status === 'completed') continue;
        
        action.status = 'syncing';
        await kvSet(this.syncQueueKey, JSON.stringify(queue));

        try {
          await syncCallback(action);
          action.status = 'completed';
          succeeded++;
        } catch (e) {
          console.error(`[OfflineSync] Failed to sync action ${action.type}:`, e);
          action.status = 'failed';
          action.retries = (action.retries || 0) + 1;
          failed++;
        }
        
        queue = await this.getQueue();
      }

      const remaining = queue.filter(a => a.status !== 'completed');
      await kvSet(this.syncQueueKey, JSON.stringify(remaining));

      return { succeeded, failed };
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Auto-sync when coming back online
   */
  private async triggerAutoSync(): Promise<void> {
    // This should be connected to the actual sync mechanism
    // For now, just emit an event that can be handled by the app
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nexus-offline-sync'));
    }
  }

  /**
   * Retry failed actions
   */
  async retryFailed(maxRetries = 3): Promise<number> {
    const queue = await this.getQueue();
    let retried = 0;
    
    for (const action of queue) {
      if (action.status === 'failed' && (action.retries || 0) < maxRetries) {
        action.status = 'pending';
        retried++;
      }
    }
    
    await kvSet(this.syncQueueKey, JSON.stringify(queue));
    return retried;
  }
}

export const offlineSyncManager = OfflineSyncManager.getInstance();
