import { logger } from '@/lib/utils/logger';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { kvGet, kvSet } from './puterService';

export const PERMISSIONS = {
  CREATE_CONTENT: 'create_content',
  PUBLISH_CONTENT: 'publish_content',
  MANAGE_TEAM: 'manage_team',
  VIEW_ANALYTICS: 'view_analytics',
  MANAGE_BRAND: 'manage_brand',
  MANAGE_SETTINGS: 'manage_settings',
  APPROVE_CONTENT: 'approve_content',
  DELETE_CONTENT: 'delete_content',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: [
    PERMISSIONS.CREATE_CONTENT,
    PERMISSIONS.PUBLISH_CONTENT,
    PERMISSIONS.MANAGE_TEAM,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.MANAGE_BRAND,
    PERMISSIONS.MANAGE_SETTINGS,
    PERMISSIONS.APPROVE_CONTENT,
    PERMISSIONS.DELETE_CONTENT,
  ],
  admin: [
    PERMISSIONS.CREATE_CONTENT,
    PERMISSIONS.PUBLISH_CONTENT,
    PERMISSIONS.MANAGE_TEAM,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.MANAGE_BRAND,
    PERMISSIONS.MANAGE_SETTINGS,
    PERMISSIONS.APPROVE_CONTENT,
    PERMISSIONS.DELETE_CONTENT,
  ],
  editor: [
    PERMISSIONS.CREATE_CONTENT,
    PERMISSIONS.PUBLISH_CONTENT,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.MANAGE_BRAND,
    PERMISSIONS.APPROVE_CONTENT,
  ],
  viewer: [
    PERMISSIONS.VIEW_ANALYTICS,
  ],
};

export interface Team {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  email: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status: 'invited' | 'active' | 'removed';
  invitedAt: string;
  joinedAt: string | null;
}

export interface TeamRole {
  id: string;
  name: string;
  permissions: Permission[];
}

export interface TeamResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export class TeamService {
  private static getClient(): any {
    try {
      return getSupabaseAdminClient();
    } catch {
      return null;
    }
  }

  private static generateId(): string {
    return `team_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private static mapTeamRow(row: any): Team {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      ownerId: row.owner_id,
      settings: row.settings || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private static mapMemberRow(row: any): TeamMember {
    return {
      id: row.id,
      teamId: row.team_id,
      userId: row.user_id,
      email: row.email,
      role: row.role,
      status: row.status,
      invitedAt: row.invited_at,
      joinedAt: row.joined_at,
    };
  }

  static async createTeam(
    name: string,
    ownerId: string,
    settings?: Record<string, unknown>
  ): Promise<TeamResult<Team>> {
    try {
      const supabase = this.getClient();
      const id = this.generateId();
      const now = new Date().toISOString();

      const team: Team = {
        id,
        name,
        description: null,
        ownerId,
        settings: settings || {},
        createdAt: now,
        updatedAt: now,
      };

      if (supabase) {
        const { error } = await supabase.from('teams').insert({
          id,
          name,
          description: null,
          owner_id: ownerId,
          settings: settings || {},
          created_at: now,
          updated_at: now,
        });
        if (error) throw error;

        const memberResult = await this.addMemberInternal(supabase, id, ownerId, '', 'owner', 'active', now);
        if (!memberResult.success) throw new Error(memberResult.error);
      }

      logger.info('[TeamService] Created team', { id, name, ownerId });
      return { success: true, data: team };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getTeam(teamId: string): Promise<TeamResult<Team & { members: TeamMember[] }>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
      }

      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

      if (teamError || !teamData) {
        return { success: false, error: 'Team not found' };
      }

      const membersResult = await this.getTeamMembers(teamId);
      const members = membersResult.success ? membersResult.data || [] : [];

      return {
        success: true,
        data: {
          ...this.mapTeamRow(teamData),
          members,
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async updateTeam(
    teamId: string,
    updates: { name?: string; description?: string | null; settings?: Record<string, unknown> }
  ): Promise<TeamResult<Team>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
      }

      const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.settings !== undefined) dbUpdates.settings = updates.settings;

      const { data, error } = await supabase
        .from('teams')
        .update(dbUpdates)
        .eq('id', teamId)
        .select()
        .single();

      if (error) throw error;

      logger.info('[TeamService] Updated team', { teamId });
      return { success: true, data: this.mapTeamRow(data) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async deleteTeam(teamId: string): Promise<TeamResult<void>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
      }

      const { error: membersError } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId);

      if (membersError) throw membersError;

      const { error: teamError } = await supabase
        .from('teams')
        .delete()
        .eq('id', teamId);

      if (teamError) throw teamError;

      await kvSet(`team_settings:${teamId}`, null as any);

      logger.info('[TeamService] Deleted team', { teamId });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async inviteMember(
    teamId: string,
    email: string,
    role: 'admin' | 'editor' | 'viewer',
    inviterId: string
  ): Promise<TeamResult<TeamMember>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
      }

      const inviterResult = await this.getMemberByUserId(supabase, teamId, inviterId);
      if (!inviterResult.success || !inviterResult.data) {
        return { success: false, error: 'Inviter not a member of this team' };
      }

      if (!this.canMemberDo(inviterResult.data, PERMISSIONS.MANAGE_TEAM)) {
        return { success: false, error: 'Insufficient permissions to invite members' };
      }

      const existingResult = await this.getMemberByEmail(supabase, teamId, email);
      if (existingResult.success && existingResult.data && existingResult.data.status !== 'removed') {
        return { success: false, error: 'User already a member of this team' };
      }

      const now = new Date().toISOString();
      const id = this.generateId();

      const { data, error } = await supabase.from('team_members').insert({
        id,
        team_id: teamId,
        user_id: null,
        email,
        role,
        status: 'invited',
        invited_at: now,
        joined_at: null,
      }).select().single();

      if (error) throw error;

      logger.info('[TeamService] Invited member', { teamId, email, role });
      return { success: true, data: this.mapMemberRow(data) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async acceptInvite(inviteId: string, userId: string): Promise<TeamResult<TeamMember>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
      }

      const { data: invite, error: fetchError } = await supabase
        .from('team_members')
        .select('*')
        .eq('id', inviteId)
        .eq('status', 'invited')
        .single();

      if (fetchError || !invite) {
        return { success: false, error: 'Invite not found or expired' };
      }

      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('team_members')
        .update({ user_id: userId, status: 'active', joined_at: now })
        .eq('id', inviteId)
        .select()
        .single();

      if (error) throw error;

      logger.info('[TeamService] Accepted invite', { inviteId, userId });
      return { success: true, data: this.mapMemberRow(data) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async removeMember(
    teamId: string,
    memberId: string,
    removerId: string
  ): Promise<TeamResult<void>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
      }

      const removerResult = await this.getMemberByUserId(supabase, teamId, removerId);
      if (!removerResult.success || !removerResult.data) {
        return { success: false, error: 'Remover not a member of this team' };
      }

      const targetResult = await this.getMemberById(supabase, teamId, memberId);
      if (!targetResult.success || !targetResult.data) {
        return { success: false, error: 'Member not found' };
      }

      if (targetResult.data.role === 'owner') {
        return { success: false, error: 'Cannot remove team owner' };
      }

      if (removerResult.data.role !== 'owner' && removerResult.data.role !== 'admin') {
        return { success: false, error: 'Insufficient permissions to remove members' };
      }

      const { error } = await supabase
        .from('team_members')
        .update({ status: 'removed' })
        .eq('id', memberId)
        .eq('team_id', teamId);

      if (error) throw error;

      logger.info('[TeamService] Removed member', { teamId, memberId });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async updateMemberRole(
    teamId: string,
    memberId: string,
    newRole: 'admin' | 'editor' | 'viewer',
    updaterId: string
  ): Promise<TeamResult<TeamMember>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
      }

      const updaterResult = await this.getMemberByUserId(supabase, teamId, updaterId);
      if (!updaterResult.success || !updaterResult.data) {
        return { success: false, error: 'Updater not a member of this team' };
      }

      if (updaterResult.data.role !== 'owner') {
        return { success: false, error: 'Only owner can change member roles' };
      }

      const targetResult = await this.getMemberById(supabase, teamId, memberId);
      if (!targetResult.success || !targetResult.data) {
        return { success: false, error: 'Member not found' };
      }

      if (targetResult.data.role === 'owner') {
        return { success: false, error: 'Cannot change owner role' };
      }

      const { data, error } = await supabase
        .from('team_members')
        .update({ role: newRole })
        .eq('id', memberId)
        .eq('team_id', teamId)
        .select()
        .single();

      if (error) throw error;

      logger.info('[TeamService] Updated member role', { teamId, memberId, newRole });
      return { success: true, data: this.mapMemberRow(data) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getTeamMembers(teamId: string): Promise<TeamResult<TeamMember[]>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
      }

      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', teamId)
        .neq('status', 'removed')
        .order('invited_at', { ascending: false });

      if (error) throw error;

      return {
        success: true,
        data: (data || []).map((row: any) => this.mapMemberRow(row)),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async getUserTeams(userId: string): Promise<TeamResult<(Team & { role: string; memberStatus: string })[]>> {
    try {
      const supabase = this.getClient();
      if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
      }

      const { data: memberships, error: membershipError } = await supabase
        .from('team_members')
        .select('team_id, role, status')
        .eq('user_id', userId)
        .neq('status', 'removed');

      if (membershipError) throw membershipError;

      if (!memberships || memberships.length === 0) {
        return { success: true, data: [] };
      }

      const teamIds = memberships.map((m: any) => m.team_id);

      const { data: teams, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .in('id', teamIds);

      if (teamError) throw teamError;

      const membershipMap = new Map<string, { role: string; status: string }>();
      memberships.forEach((m: any) => {
        membershipMap.set(m.team_id, { role: m.role, status: m.status });
      });

      const result = (teams || []).map((team: any) => {
        const membership = membershipMap.get(team.id)!;
        return {
          ...this.mapTeamRow(team),
          role: membership.role,
          memberStatus: membership.status,
        };
      });

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static canMemberDo(
    member: TeamMember,
    action: Permission
  ): boolean {
    if (member.status !== 'active') return false;
    const permissions = this.getRolePermissions(member.role);
    return permissions.includes(action);
  }

  static getRolePermissions(role: string): Permission[] {
    return ROLE_PERMISSIONS[role] || [];
  }

  static async getTeamSettings(teamId: string): Promise<TeamResult<Record<string, unknown>>> {
    try {
      const settings = await kvGet<Record<string, unknown>>(`team_settings:${teamId}`, true);
      return { success: true, data: settings || {} };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async updateTeamSettings(
    teamId: string,
    settings: Record<string, unknown>
  ): Promise<TeamResult<Record<string, unknown>>> {
    try {
      const supabase = this.getClient();
      if (supabase) {
        const { error } = await supabase
          .from('teams')
          .update({ settings, updated_at: new Date().toISOString() })
          .eq('id', teamId);

        if (error) throw error;
      }

      await kvSet(`team_settings:${teamId}`, settings);

      logger.info('[TeamService] Updated team settings', { teamId });
      return { success: true, data: settings };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private static async addMemberInternal(
    supabase: any,
    teamId: string,
    userId: string,
    email: string,
    role: string,
    status: string,
    now: string
  ): Promise<TeamResult<TeamMember>> {
    try {
      const id = this.generateId();

      const { data, error } = await supabase.from('team_members').insert({
        id,
        team_id: teamId,
        user_id: userId,
        email,
        role,
        status,
        invited_at: now,
        joined_at: status === 'active' ? now : null,
      }).select().single();

      if (error) throw error;

      return { success: true, data: this.mapMemberRow(data) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private static async getMemberByUserId(
    supabase: any,
    teamId: string,
    userId: string
  ): Promise<TeamResult<TeamMember>> {
    try {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', teamId)
        .eq('user_id', userId)
        .neq('status', 'removed')
        .single();

      if (error || !data) {
        return { success: false, error: 'Member not found' };
      }

      return { success: true, data: this.mapMemberRow(data) };
    } catch {
      return { success: false, error: 'Member not found' };
    }
  }

  private static async getMemberById(
    supabase: any,
    teamId: string,
    memberId: string
  ): Promise<TeamResult<TeamMember>> {
    try {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', teamId)
        .eq('id', memberId)
        .single();

      if (error || !data) {
        return { success: false, error: 'Member not found' };
      }

      return { success: true, data: this.mapMemberRow(data) };
    } catch {
      return { success: false, error: 'Member not found' };
    }
  }

  private static async getMemberByEmail(
    supabase: any,
    teamId: string,
    email: string
  ): Promise<TeamResult<TeamMember>> {
    try {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', teamId)
        .eq('email', email)
        .neq('status', 'removed')
        .single();

      if (error || !data) {
        return { success: false, error: 'Member not found' };
      }

      return { success: true, data: this.mapMemberRow(data) };
    } catch {
      return { success: false, error: 'Member not found' };
    }
  }
}
