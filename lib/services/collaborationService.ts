

import { createClient } from '@supabase/supabase-js';
import { RealtimeChannel } from '@supabase/supabase-js';

// Initialize Supabase client (assuming env vars are available)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface CollaborationUser {
  id: string;
  name: string;
  color: string;
  cursorPosition: { line: number; ch: number };
}

export interface CollaborationEvent {
  type: 'CONTENT_UPDATE' | 'CURSOR_MOVE' | 'USER_JOINED' | 'USER_LEFT';
  payload: any;
  userId: string;
}

/**
 * CollaborationService manages real-time synchronization and presence
 * for content drafts using Supabase Realtime.
 */
export const collaborationService = {
  channels: new Map<string, RealtimeChannel>(),

  /**
   * Joins a collaborative session for a specific draft.
   */
  async joinDraftSession(draftId: string, user: CollaborationUser, onUpdate: (event: CollaborationEvent) => void) {
    const channelName = `draft:${draftId}`;
    
    if (this.channels.has(channelName)) {
      return this.channels.get(channelName);
    }

    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channel
      .on('broadcast', { event: 'update' }, ({ payload }) => {
        onUpdate({
          type: payload.type,
          payload: payload.data,
          userId: payload.userId,
        });
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        onUpdate({
          type: 'USER_JOINED',
          payload: state,
          userId: 'system',
        });
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        onUpdate({
          type: 'USER_JOINED',
          payload: newPresences,
          userId: 'system',
        });
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        onUpdate({
          type: 'USER_LEFT',
          payload: leftPresences,
          userId: 'system',
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Sync current user presence
          await channel.track({
            name: user.name,
            color: user.color,
            cursorPosition: user.cursorPosition,
          });
        }
      });

    this.channels.set(channelName, channel);
    return channel;
  },

  /**
   * Broadcasts a content change to all collaborators.
   */
  async broadcastUpdate(draftId: string, userId: string, newContent: string) {
    const channel = this.channels.get(`draft:${draftId}`);
    if (!channel) throw new Error('Not joined to draft session');

    await channel.send({
      type: 'broadcast',
      event: 'update',
      payload: {
        type: 'CONTENT_UPDATE',
        userId,
        data: newContent,
      },
    });
  },

  /**
   * Broadcasts a cursor movement update.
   */
  async broadcastCursorMove(draftId: string, userId: string, position: { line: number; ch: number }) {
    const channel = this.channels.get(`draft:${draftId}`);
    if (!channel) throw new Error('Not joined to draft session');

    await channel.send({
      type: 'broadcast',
      event: 'update',
      payload: {
        type: 'CURSOR_MOVE',
        userId,
        data: position,
      },
    });
  },

  /**
   * Leaves the collaborative session.
   */
  async leaveDraftSession(draftId: string) {
    const channel = this.channels.get(`draft:${draftId}`);
    if (channel) {
      await channel.unsubscribe();
      this.channels.delete(`draft:${draftId}`);
    }
  },
};
