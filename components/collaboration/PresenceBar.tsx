"use client";

import React, { useState, useEffect } from 'react';
import { collaborationManager } from '@/lib/services/collaborationManager';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Box } from '@/components/ui'; // Mocking standard layout box

interface CollaborationPresenceProps {
  docId: string;
  currentUser: { name: string, color: string };
}

export function CollaborationPresence({ docId, currentUser }: CollaborationPresenceProps) {
  const [users, setUsers] = useState<any[]>([]);
  const userName = currentUser?.name ?? '';
  const userColor = currentUser?.color ?? '#888888';

  useEffect(() => {
    const setupAwareness = async () => {
      const ydoc = await collaborationManager.connectToDocument(docId);
      const provider = (collaborationManager as any).providers.get(docId);
      
      if (!provider) return;

      collaborationManager.setAwareness(docId, { name: userName, color: userColor });

      provider.awareness.on('change', () => {
        const states = Array.from(provider.awareness.getStates().values());
        setUsers(states.map((state: any) => state.user));
      });
    };

    setupAwareness();
    return () => collaborationManager.disconnect(docId);
  }, [docId, userName, userColor]);

  return (
    <div className="flex items-center gap-2 p-2 bg-secondary/30 rounded-full border border-border">
      <div className="text-xs font-medium text-muted-foreground mr-2">Collaborators:</div>
      {users.map((user, i) => {
        const initial = user?.name?.trim()?.[0] || '?';
        return (
        <div key={i} className="relative group">
          <Avatar className="w-6 h-6 border-2" style={{ borderColor: user.color }}>
            <span className="text-[10px] font-bold">{initial}</span>
          </Avatar>
          <div className="absolute top-full left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded shadow-sm whitespace-nowrap z-50">
            {user.name} ({user.role || 'Editor'})
          </div>
        </div>
      )})}
    </div>
  );
}
