import { createClient } from '@/lib/supabase/server';

export interface ApprovalItem {
  id: string;
  content: string;
  platform: string;
  requestId?: string;
  priority?: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'rejected';
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export async function addToApprovalQueue(
  content: string,
  metadata: Partial<ApprovalItem>
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('approval_queue')
    .insert({
      content,
      platform: metadata.platform || 'general',
      request_id: metadata.requestId,
      priority: metadata.priority || 'medium',
      metadata: metadata.metadata || {},
    } as any)
    .select()
    .single();

  if (error) throw error;
  return (data as { id: string }).id;
}

export async function getPendingApprovals(): Promise<ApprovalItem[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('approval_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as ApprovalItem[]) || [];
}

export async function resolveApproval(
  id: string,
  decision: 'approved' | 'rejected',
  reason?: string
): Promise<void> {
  const supabase = await createClient();
  
  const updateData = {
    status: decision,
    decision_reason: reason ?? null,
    rejection_reason: decision === 'rejected' ? reason ?? null : null,
  };
  
  const { error } = await (supabase as any)
    .from('approval_queue')
    .update(updateData)
    .eq('id', id);

  if (error) throw error;
}

export const getApprovalQueue = getPendingApprovals;
export const updateApprovalStatus = resolveApproval;
