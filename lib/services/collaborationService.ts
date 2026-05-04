// Collaboration Service
// Manages RBAC, invites, and team synchronization.

import { kvGet, kvSet } from './puterService';
import { generateId } from './memoryService';

export type UserRole = 'ceo' | 'admin' | 'editor' | 'strategist' | 'viewer';

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
