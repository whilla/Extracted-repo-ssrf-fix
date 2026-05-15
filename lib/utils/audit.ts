/**
 * Audit trail system for compliance and debugging
 * Tracks all critical operations: publishes, content changes, settings updates
 */

import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { logger } from './logger';

export interface AuditEvent {
  id?: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp?: string;
}

/**
 * Log an audit event to Supabase
 */
export async function logAudit(event: AuditEvent): Promise<void> {
  try {
    const supabase = await getSupabaseAdminClient();
    if (!supabase) {
      logger.warn('[Audit] Supabase not available, audit event dropped', { action: event.action });
      return;
    }

    await (supabase.from('audit_log') as any).insert({
      user_id: event.userId,
      action: event.action,
      resource_type: event.resourceType,
      resource_id: event.resourceId,
      old_value: event.oldValue || null,
      new_value: event.newValue || null,
      metadata: event.metadata || null,
      ip_address: event.ipAddress || null,
      user_agent: event.userAgent || null,
      created_at: event.timestamp || new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[Audit] Failed to log audit event', { error, event });
  }
}

/**
 * Get audit trail for a resource
 */
export async function getAuditTrail(
  resourceType: string,
  resourceId: string,
  limit = 50
): Promise<AuditEvent[]> {
  try {
    const supabase = await getSupabaseAdminClient();
    if (!supabase) return [];

    const { data, error } = await (supabase.from('audit_log') as any)
      .select('*')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      oldValue: row.old_value,
      newValue: row.new_value,
      metadata: row.metadata,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      timestamp: row.created_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Get user's activity log
 */
export async function getUserActivity(
  userId: string,
  limit = 100
): Promise<AuditEvent[]> {
  try {
    const supabase = await getSupabaseAdminClient();
    if (!supabase) return [];

    const { data, error } = await (supabase.from('audit_log') as any)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      oldValue: row.old_value,
      newValue: row.new_value,
      metadata: row.metadata,
      timestamp: row.created_at,
    }));
  } catch {
    return [];
  }
}

// Preset audit actions
export const AUDIT_ACTIONS = {
  CONTENT_CREATED: 'content:created',
  CONTENT_UPDATED: 'content:updated',
  CONTENT_DELETED: 'content:deleted',
  CONTENT_PUBLISHED: 'content:published',
  CONTENT_SCHEDULED: 'content:scheduled',
  BRAND_KIT_UPDATED: 'brand_kit:updated',
  SETTINGS_CHANGED: 'settings:changed',
  API_KEY_ADDED: 'api_key:added',
  API_KEY_REMOVED: 'api_key:removed',
  USER_LOGIN: 'user:login',
  USER_LOGOUT: 'user:logout',
  SUBSCRIPTION_CREATED: 'subscription:created',
  SUBSCRIPTION_CANCELLED: 'subscription:cancelled',
  TEAM_MEMBER_INVITED: 'team:member_invited',
  TEAM_MEMBER_REMOVED: 'team:member_removed',
  CRM_CUSTOMER_CREATED: 'crm:customer_created',
  CRM_CUSTOMER_UPDATED: 'crm:customer_updated',
  WORKER_JOB_STARTED: 'worker:job_started',
  WORKER_JOB_COMPLETED: 'worker:job_completed',
  WORKER_JOB_FAILED: 'worker:job_failed',
} as const;

// Preset resource types
export const AUDIT_RESOURCES = {
  CONTENT: 'content',
  BRAND_KIT: 'brand_kit',
  SETTINGS: 'settings',
  USER: 'user',
  SUBSCRIPTION: 'subscription',
  TEAM: 'team',
  API_KEY: 'api_key',
  CRM: 'crm',
  WORKER: 'worker',
  AUDIT: 'audit',
} as const;
