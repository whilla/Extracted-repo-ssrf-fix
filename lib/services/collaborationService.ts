// Collaboration Service
// Manages RBAC, invites, and team synchronization.

import { kvGet, kvSet } from './puterService';
import { generateId } from './memoryService';
import { collaborationManager } from './collaborationManager';

export type UserRole = 'ceo' | 'admin' | 'editor' | 'strategist' | 'viewer';

/**
 * Initialize collaboration session for a specific content draft.
 * Integrates team roles with real-time CRDT synchronization.
 */
export async function initCollaborationSession(docId: string, user: { name: string, color: string, role: UserRole }) {
  // 1. Set up the CRDT document connection
  const ydoc = await collaborationManager.connectToDocument(docId);
  
  // 2. Set user presence (awareness)
  collaborationManager.setAwareness(docId, { ...user, role: user.role });
  
  return {
    ydoc,
    manager: collaborationManager
  };
}

export async function createInvite(email: string, role: UserRole) {
  const inviteId = generateId();
  const invites = await kvGet('nexus_invites') || '[]';
  const list = JSON.parse(invites);
  list.push({ inviteId, email, role, createdAt: new Date().toISOString() });
  await kvSet('nexus_invites', JSON.stringify(list));
  return `https://nexusai.app/join?id=${inviteId}`;
}

export async function validateInvite(id: string) {
  const invites = await kvGet('nexus_invites') || '[]';
  const list = JSON.parse(invites);
  return list.find((i: any) => i.inviteId === id);
}
