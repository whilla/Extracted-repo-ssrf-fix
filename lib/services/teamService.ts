/**
 * Team Collaboration Service
 * Multi-user workspaces, roles, and permissions
 */

import { kvGet, kvSet } from './puterService';

export type TeamRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface TeamMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  avatar?: string;
  role: TeamRole;
  joinedAt: string;
  lastActiveAt: string;
}

export interface TeamWorkspace {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: TeamMember[];
  settings: TeamSettings;
  createdAt: string;
  updatedAt: string;
}

export interface TeamSettings {
  allowInvite: boolean;
  requireApproval: boolean;
  defaultRole: TeamRole;
  sharingEnabled: boolean;
}

export interface ActivityLog {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  action: string;
  target: string;
  targetId?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface InviteLink {
  id: string;
  teamId: string;
  workspaceId: string;
  role: TeamRole;
  expiresAt: string;
  maxUses?: number;
  uses: number;
  createdBy: string;
}

const TEAMS_KEY = 'teams';
const ACTIVITY_KEY = 'team_activity';
const INVITES_KEY = 'team_invites';

const rolePermissions: Record<TeamRole, string[]> = {
  owner: ['*'],
  admin: ['manage_members', 'manage_settings', 'create_content', 'edit_content', 'delete_content', 'publish', 'view_analytics'],
  editor: ['create_content', 'edit_content', 'delete_own', 'publish'],
  viewer: ['view_content', 'view_analytics'],
};

function generateTeamId(): string {
  return `team_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function loadTeams(): Promise<TeamWorkspace[]> {
  const data = await kvGet(TEAMS_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveTeams(teams: TeamWorkspace[]): Promise<void> {
  await kvSet(TEAMS_KEY, JSON.stringify(teams.slice(0, 50)));
}

export async function createTeam(
  ownerId: string,
  ownerEmail: string,
  ownerName: string,
  options: { name: string; description?: string }
): Promise<TeamWorkspace> {
  const teams = await loadTeams();

  const owner: TeamMember = {
    id: generateTeamId(),
    userId: ownerId,
    email: ownerEmail,
    name: ownerName,
    role: 'owner',
    joinedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };

  const workspace: TeamWorkspace = {
    id: generateTeamId(),
    name: options.name,
    description: options.description,
    ownerId,
    members: [owner],
    settings: {
      allowInvite: true,
      requireApproval: false,
      defaultRole: 'editor',
      sharingEnabled: true,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  teams.unshift(workspace);
  await saveTeams(teams);

  await logActivity(workspace.id, ownerId, ownerName, 'created_workspace', 'Workspace', workspace.id, { name: workspace.name });

  return workspace;
}

export async function getTeam(teamId: string): Promise<TeamWorkspace | null> {
  const teams = await loadTeams();
  return teams.find(t => t.id === teamId) || null;
}

export async function getUserTeams(userId: string): Promise<TeamWorkspace[]> {
  const teams = await loadTeams();
  return teams.filter(t => t.members.some(m => m.userId === userId));
}

export async function addMember(
  teamId: string,
  userId: string,
  email: string,
  name: string,
  role: TeamRole
): Promise<boolean> {
  const teams = await loadTeams();
  const index = teams.findIndex(t => t.id === teamId);

  if (index === -1) return false;

  const member: TeamMember = {
    id: generateTeamId(),
    userId,
    email,
    name,
    role,
    joinedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };

  teams[index].members.push(member);
  teams[index].updatedAt = new Date().toISOString();

  await saveTeams(teams);
  return true;
}

export async function removeMember(teamId: string, memberId: string): Promise<boolean> {
  const teams = await loadTeams();
  const index = teams.findIndex(t => t.id === teamId);

  if (index === -1) return false;

  const member = teams[index].members.find(m => m.id === memberId);
  if (!member || member.role === 'owner') return false;

  teams[index].members = teams[index].members.filter(m => m.id !== memberId);
  teams[index].updatedAt = new Date().toISOString();

  await saveTeams(teams);
  return true;
}

export async function updateMemberRole(
  teamId: string,
  memberId: string,
  newRole: TeamRole
): Promise<boolean> {
  const teams = await loadTeams();
  const index = teams.findIndex(t => t.id === teamId);

  if (index === -1) return false;

  const member = teams[index].members.find(m => m.id === memberId);
  if (!member || member.role === 'owner') return false;

  member.role = newRole;
  teams[index].updatedAt = new Date().toISOString();

  await saveTeams(teams);
  return true;
}

export function hasPermission(role: TeamRole, permission: string): boolean {
  const perms = rolePermissions[role];
  return perms.includes('*') || perms.includes(permission);
}

export async function createInviteLink(
  teamId: string,
  role: TeamRole,
  createdBy: string,
  expiresInHours: number = 72,
  maxUses?: number
): Promise<InviteLink> {
  const invitesData = await kvGet(INVITES_KEY);
  const invites: InviteLink[] = invitesData ? JSON.parse(invitesData) : [];

  const invite: InviteLink = {
    id: generateTeamId(),
    teamId,
    workspaceId: teamId,
    role,
    expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString(),
    maxUses,
    uses: 0,
    createdBy,
  };

  invites.unshift(invite);
  await kvSet(INVITES_KEY, JSON.stringify(invites.slice(0, 100)));

  return invite;
}

export async function validateInviteLink(inviteId: string): Promise<{
  valid: boolean;
  teamId?: string;
  role?: TeamRole;
  error?: string;
}> {
  const invitesData = await kvGet(INVITES_KEY);
  const invites: InviteLink[] = invitesData ? JSON.parse(invitesData) : [];
  const invite = invites.find(i => i.id === inviteId);

  if (!invite) {
    return { valid: false, error: 'Invite not found' };
  }

  if (new Date(invite.expiresAt) < new Date()) {
    return { valid: false, error: 'Invite expired' };
  }

  if (invite.maxUses && invite.uses >= invite.maxUses) {
    return { valid: false, error: 'Invite max uses reached' };
  }

  return { valid: true, teamId: invite.teamId, role: invite.role };
}

export async function useInviteLink(inviteId: string): Promise<boolean> {
  const invitesData = await kvGet(INVITES_KEY);
  const invites: InviteLink[] = invitesData ? JSON.parse(invitesData) : [];
  const index = invites.findIndex(i => i.id === inviteId);

  if (index === -1) return false;

  invites[index].uses++;
  await kvSet(INVITES_KEY, JSON.stringify(invites));
  return true;
}

async function logActivity(
  workspaceId: string,
  userId: string,
  userName: string,
  action: string,
  target: string,
  targetId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  const activitiesData = await kvGet(ACTIVITY_KEY);
  const activities: ActivityLog[] = activitiesData ? JSON.parse(activitiesData) : [];

  activities.unshift({
    id: generateTeamId(),
    workspaceId,
    userId,
    userName,
    action,
    target,
    targetId,
    details,
    timestamp: new Date().toISOString(),
  });

  await kvSet(ACTIVITY_KEY, JSON.stringify(activities.slice(0, 500)));
}

export async function getTeamActivity(teamId: string, limit: number = 50): Promise<ActivityLog[]> {
  const activitiesData = await kvGet(ACTIVITY_KEY);
  const activities: ActivityLog[] = activitiesData ? JSON.parse(activitiesData) : [];
  return activities.filter(a => a.workspaceId === teamId).slice(0, limit);
}

export async function updateTeamSettings(
  teamId: string,
  settings: Partial<TeamSettings>
): Promise<boolean> {
  const teams = await loadTeams();
  const index = teams.findIndex(t => t.id === teamId);

  if (index === -1) return false;

  teams[index].settings = { ...teams[index].settings, ...settings };
  teams[index].updatedAt = new Date().toISOString();

  await saveTeams(teams);
  return true;
}

export async function deleteTeam(teamId: string): Promise<boolean> {
  const teams = await loadTeams();
  const filtered = teams.filter(t => t.id !== teamId);
  
  if (filtered.length === teams.length) return false;
  
  await saveTeams(filtered);
  return true;
}

export async function getTeamStats(teamId: string): Promise<{
  memberCount: number;
  roleBreakdown: Record<TeamRole, number>;
  activityToday: number;
  activityThisWeek: number;
}> {
  const team = await getTeam(teamId);
  if (!team) throw new Error('Team not found');

  const activities = await getTeamActivity(teamId, 200);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  const roleBreakdown = team.members.reduce((acc, m) => {
    acc[m.role] = (acc[m.role] || 0) + 1;
    return acc;
  }, {} as Record<TeamRole, number>);

  return {
    memberCount: team.members.length,
    roleBreakdown,
    activityToday: activities.filter(a => new Date(a.timestamp) >= todayStart).length,
    activityThisWeek: activities.filter(a => new Date(a.timestamp) >= weekStart).length,
  };
}

export interface SharedContent {
  id: string;
  workspaceId: string;
  contentType: 'post' | 'draft' | 'media' | 'brand_kit';
  contentId: string;
  title: string;
  sharedBy: string;
  sharedWith: string[];
  permissions: ('view' | 'edit' | 'admin')[];
  createdAt: string;
}

export async function shareContent(
  workspaceId: string,
  contentType: SharedContent['contentType'],
  contentId: string,
  title: string,
  sharedBy: string,
  sharedWith: string[],
  permissions: SharedContent['permissions']
): Promise<SharedContent> {
  const share: SharedContent = {
    id: generateTeamId(),
    workspaceId,
    contentType,
    contentId,
    title,
    sharedBy,
    sharedWith,
    permissions,
    createdAt: new Date().toISOString(),
  };

  await logActivity(workspaceId, sharedBy, sharedBy, 'shared_content', title, share.id, { contentType, sharedWith: sharedWith.length });

  return share;
}