// Approval Queue Service
// Manages content that is ready for CEO review before final publication.

import { kvGet, kvSet } from './puterService';
import { generateId } from './memoryService';

export interface ApprovalItem {
  id: string;
  content: string;
  metadata: {
    platform: string;
    agentRole: string;
    modelUsed: string;
    score: number;
    createdAt: string;
    orchestrationPlanId: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  ceoFeedback?: string;
  approvedAt?: string;
}

const APPROVAL_QUEUE_KEY = 'nexus_approval_queue';

export async function addToApprovalQueue(
  content: string, 
  metadata: ApprovalItem['metadata']
): Promise<string> {
  const id = generateId();
  const item: ApprovalItem = {
    id,
    content,
    metadata,
    status: 'pending',
  };

  const queue = await getApprovalQueue();
  queue.push(item);
  await saveApprovalQueue(queue);
  
  return id;
}

export async function getApprovalQueue(): Promise<ApprovalItem[]> {
  try {
    const data = await kvGet(APPROVAL_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function updateApprovalStatus(
  id: string, 
  status: 'approved' | 'rejected', 
  feedback?: string
): Promise<boolean> {
  const queue = await getApprovalQueue();
  const index = queue.findIndex(item => item.id === id);
  
  if (index === -1) return false;
  
  queue[index].status = status;
  queue[index].ceoFeedback = feedback;
  queue[index].approvedAt = status === 'approved' ? new Date().toISOString() : undefined;
  
  await saveApprovalQueue(queue);
  return true;
}

export async function getPendingApprovals(): Promise<ApprovalItem[]> {
  const queue = await getApprovalQueue();
  return queue.filter(item => item.status === 'pending');
}

async function saveApprovalQueue(queue: ApprovalItem[]): Promise<void> {
  await kvSet(APPROVAL_QUEUE_KEY, JSON.stringify(queue));
}
