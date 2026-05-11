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

const COLLABORATION_SERVER = process.env.NEXT_PUBLIC_COLLAB_SERVER || 'wss://collaboration.nexusai.app';

/**
 * Real-time collaboration manager using Yjs for CRDT-based state synchronization.
 * This service ensures that multiple users can edit the same content draft 
 * without conflicts, providing a Google Docs-like experience.
 * 
 * Supports both WebSocket server (production) and local-only mode (development).
 */
export class CollaborationManager {
  private static instance: CollaborationManager;
  private providers: Map<string, any> = new Map();
  private docs: Map<string, Y.Doc> = new Map();
  private localMode = !WebsocketProvider;

  private constructor() {}

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
    return !this.localMode && !!WebsocketProvider;
  }

  /**
   * Connect to a shared document by ID.
   */
  public async connectToDocument(docId: string, roomName: string = docId): Promise<Y.Doc> {
    if (this.docs.has(docId)) {
      return this.docs.get(docId)!;
    }

    const ydoc = new Y.Doc();

    if (WebsocketProvider) {
      try {
        const provider = new WebsocketProvider(COLLABORATION_SERVER, roomName, ydoc);
        this.providers.set(docId, provider);
      } catch (e) {
        console.warn('WebSocket connection failed, using local mode:', e);
        this.localMode = true;
      }
    }
    
    this.docs.set(docId, ydoc);
    return ydoc;
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
    }
  }

  /**
   * Get all connected users' awareness states.
   */
  public getConnectedUsers(docId: string): any[] {
    const provider = this.providers.get(docId);
    if (!provider?.awareness) return [];
    
    const states = provider.awareness.getStates();
    const users: any[] = [];
    states.forEach((state: any, clientId: number) => {
      if (state.user) {
        users.push({ ...state.user, clientId });
      }
    });
    return users;
  }

  /**
   * Disconnect from a document.
   */
  public disconnect(docId: string) {
    const provider = this.providers.get(docId);
    if (provider) {
      try {
        provider.disconnect();
      } catch (e) {
        console.warn('Error disconnecting provider:', e);
      }
      this.providers.delete(docId);
    }
    const doc = this.docs.get(docId);
    if (doc) {
      doc.destroy();
    }
    this.docs.delete(docId);
  }

  /**
   * Export document state as JSON for backup/save.
   */
  public exportAsJson(docId: string): string | null {
    const doc = this.docs.get(docId);
    if (!doc) return null;
    const arr = new Uint8Array(Y.encodeStateAsUpdate(doc));
    return Buffer.from(arr).toString('base64');
  }

  /**
   * Import document state from JSON backup.
   */
  public importFromJson(docId: string, base64Data: string): void {
    const doc = this.docs.get(docId);
    if (!doc) throw new Error(`Document ${docId} not connected`);
    
    const update = Buffer.from(base64Data, 'base64');
    Y.applyUpdate(doc, new Uint8Array(update));
  }
}

export const collaborationManager = CollaborationManager.getInstance();
