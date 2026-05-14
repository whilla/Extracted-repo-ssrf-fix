import * as Y from 'yjs';

let WebsocketProvider: any = null;
try {
  import('y-websocket').then(module => {
    WebsocketProvider = module.WebsocketProvider;
  }).catch(() => {
    console.warn('y-websocket not available, using local-only mode');
  });
} catch (e) {
  console.warn('y-websocket not available, using local-only mode');
}

const COLLABORATION_SERVER = process.env.NEXT_PUBLIC_COLLAB_SERVER || '';
const COLLAB_MODE = process.env.NEXT_PUBLIC_COLLAB_MODE || 'auto';

/**
 * Real-time collaboration manager using Yjs for CRDT-based state synchronization.
 * Uses a multi-provider strategy:
 * 1. y-websocket (dedicated WebSocket server, e.g., collaboration.nexusai.app)
 * 2. Supabase Realtime Broadcast (free-tier friendly, works without a separate server)
 * 3. Local-only (single user, changes saved to Puter KV)
 * 
 * This ensures collaboration works regardless of deployment infrastructure.
 */
export class CollaborationManager {
  private static instance: CollaborationManager;
  private providers: Map<string, any> = new Map();
  private docs: Map<string, Y.Doc> = new Map();
  private localMode = false;
  private supabaseChannel: Map<string, any> = new Map();
  private updateHandlers: Map<string, ((update: Uint8Array, origin: any) => void)[]> = new Map();

  private constructor() {
    this.detectMode();
  }

  private detectMode(): void {
    if (COLLAB_MODE === 'local') {
      this.localMode = true;
      return;
    }

    if (COLLAB_MODE === 'supabase' || COLLAB_MODE === 'auto') {
      // Supabase mode is available if the client can be loaded
      this.localMode = false;
      return;
    }

    this.localMode = !WebsocketProvider;
  }

  public static getInstance(): CollaborationManager {
    if (!CollaborationManager.instance) {
      CollaborationManager.instance = new CollaborationManager();
    }
    return CollaborationManager.instance;
  }

  /**
   * Check if collaboration server is configured
   */
  public isOnlineMode(): boolean {
    if (this.localMode) return false;
    if (WebsocketProvider && !!COLLABORATION_SERVER) return true;
    if (COLLAB_MODE === 'supabase' || COLLAB_MODE === 'auto') return true;
    return false;
  }

  /**
   * Get the active collaboration mode description
   */
  public getMode(): 'y-websocket' | 'supabase-realtime' | 'local' {
    if (WebsocketProvider && !!COLLABORATION_SERVER) return 'y-websocket';
    if (!this.localMode) return 'supabase-realtime';
    return 'local';
  }

  /**
   * Connect to a shared document by ID.
   */
  public async connectToDocument(docId: string, roomName: string = docId): Promise<Y.Doc> {
    if (this.docs.has(docId)) {
      return this.docs.get(docId)!;
    }

    const ydoc = new Y.Doc();

    // Strategy 1: y-websocket (dedicated server)
    if (WebsocketProvider && COLLABORATION_SERVER) {
      try {
        const provider = new WebsocketProvider(COLLABORATION_SERVER, roomName, ydoc);
        this.providers.set(docId, provider);
        console.log(`[Collaboration] Connected to y-websocket server: ${COLLABORATION_SERVER}`);
      } catch (e) {
        console.warn('WebSocket connection failed for doc ' + docId + ', trying Supabase:', e);
        await this.trySupabaseConnect(docId, roomName, ydoc);
      }
    }
    // Strategy 2: Supabase Realtime Broadcast
    else if (COLLAB_MODE === 'supabase' || COLLAB_MODE === 'auto') {
      await this.trySupabaseConnect(docId, roomName, ydoc);
    } else {
      console.warn('No collaboration backend configured, using local-only mode');
      this.providers.set(docId, null);
    }
    
    this.docs.set(docId, ydoc);
    return ydoc;
  }

  /**
   * Attempt to connect via Supabase Realtime Broadcast.
   */
  private async trySupabaseConnect(docId: string, roomName: string, ydoc: Y.Doc): Promise<void> {
    try {
      const supabaseMod = await import('@/lib/supabase/client');
      const supabase = supabaseMod.getSupabaseBrowserClient();

      if (!supabase) {
        console.warn('Supabase client not available for collaboration');
        this.providers.set(docId, null);
        return;
      }

      // Use Supabase Realtime Broadcast channel for CRDT sync
      const channel = supabase.channel(`collab:${roomName}`, {
        config: { broadcast: { self: true, ack: true } },
      });

      // When Yjs document changes, broadcast the update
      const updateHandler = (update: Uint8Array, origin: any) => {
        if (origin === 'remote') return;
        const base64 = this.uint8ArrayToBase64(update);
        channel.send({
          type: 'broadcast',
          event: 'yjs_update',
          payload: { update: base64, docId },
        });
      };
      ydoc.on('update', updateHandler);

      // Listen for remote updates
      channel.on('broadcast', { event: 'yjs_update' }, (payload: any) => {
        if (!payload.payload || !payload.payload.update) return;
        try {
          const update = this.base64ToUint8Array(payload.payload.update);
          Y.applyUpdate(ydoc, update, 'remote');
        } catch (e) {
          console.warn('[Collab] Failed to apply remote update:', e);
        }
      });

      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Collaboration] Connected via Supabase Realtime: collab:${roomName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('[Collaboration] Supabase channel error, falling back to local');
          this.providers.set(docId, null);
        }
      });

      this.supabaseChannel.set(docId, channel);
      this.providers.set(docId, { type: 'supabase', channel });
    } catch (e) {
      console.warn('Supabase collaboration setup failed, using local-only:', e);
      this.providers.set(docId, null);
    }
  }

  /**
   * Get a shared text type for collaborative editing.
   */
  public getSharedText(docId: string, key: string): Y.Text {
    const doc = this.docs.get(docId);
    if (!doc) throw new Error(`Document ${docId} not connected`);
    return doc.getText(key);
  }

  /**
   * Get a shared array for collaborative lists.
   */
  public getSharedArray<T>(docId: string, key: string): Y.Array<T> {
    const doc = this.docs.get(docId);
    if (!doc) throw new Error(`Document ${docId} not connected`);
    return doc.getArray<T>(key);
  }

  /**
   * Get a shared map for collaborative objects.
   */
  public getSharedMap<T>(docId: string, key: string): Y.Map<T> {
    const doc = this.docs.get(docId);
    if (!doc) throw new Error(`Document ${docId} not connected`);
    return doc.getMap<T>(key);
  }

  /**
   * Set up awareness for real-time presence (cursors, usernames).
   */
  public setAwareness(docId: string, user: { name: string; color: string; id?: string }) {
    const provider = this.providers.get(docId);
    if (!provider) {
      console.warn('No provider available for awareness');
      return;
    }
    
    if (provider.awareness) {
      provider.awareness.setLocalStateField('user', user);
    } else if (provider.type === 'supabase') {
      // Supabase: send user presence via channel
      try {
        provider.channel.track({ user });
      } catch (e) {
        console.warn('[Collab] Supabase presence track failed:', e);
      }
    }
  }

  /**
   * Get all connected users' awareness states.
   */
  public getConnectedUsers(docId: string): any[] {
    const provider = this.providers.get(docId);
    if (!provider) return [];

    if (provider.awareness) {
      const states = provider.awareness.getStates();
      const users: any[] = [];
      states.forEach((state: any, clientId: number) => {
        if (state.user) {
          users.push({ ...state.user, clientId });
        }
      });
      return users;
    }

    if (provider.type === 'supabase' && provider.channel) {
      try {
        const presence = provider.channel.presenceState();
        return Object.values(presence).flat().map((p: any, i: number) => ({
          ...(p.user || { name: 'Anonymous' }),
          clientId: i,
        }));
      } catch {
        return [];
      }
    }

    return [];
  }

  /**
   * Disconnect from a document.
   */
  public disconnect(docId: string) {
    const provider = this.providers.get(docId);

    if (provider) {
      if (provider.disconnect) {
        try { provider.disconnect(); } catch (e) { console.warn('Error disconnecting provider:', e); }
      }
      if (provider.type === 'supabase' && provider.channel) {
        try { provider.channel.unsubscribe(); } catch (e) { /* ignore */ }
      }
      this.providers.delete(docId);
    }

    const channel = this.supabaseChannel.get(docId);
    if (channel) {
      try { channel.unsubscribe(); } catch (e) { /* ignore */ }
      this.supabaseChannel.delete(docId);
    }

    const doc = this.docs.get(docId);
    if (doc) {
      doc.destroy();
    }
    this.docs.delete(docId);
    this.updateHandlers.delete(docId);
  }

  /**
   * Export document state as JSON for backup/save.
   */
  public exportAsJson(docId: string): string | null {
    const doc = this.docs.get(docId);
    if (!doc) return null;
    const arr = new Uint8Array(Y.encodeStateAsUpdate(doc));
    return this.uint8ArrayToBase64(arr);
  }

  /**
   * Import document state from JSON backup.
   */
  public importFromJson(docId: string, base64Data: string): void {
    const doc = this.docs.get(docId);
    if (!doc) throw new Error(`Document ${docId} not connected`);
    
    const update = this.base64ToUint8Array(base64Data);
    Y.applyUpdate(doc, new Uint8Array(update));
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    if (typeof btoa !== 'undefined') return btoa(binary);
    return Buffer.from(bytes).toString('base64');
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    if (typeof atob !== 'undefined') {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
}

export const collaborationManager = CollaborationManager.getInstance();
