import { NextRequest, NextResponse } from 'next/server';

export interface ApprovalItem {
  id: string;
  content: string;
  platform: string;
  author: string;
  status: 'pending' | 'approved' | 'rejected' | 'revisions_requested';
  submittedAt: string;
  reviewer?: string;
  reviewNotes?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

const APPROVAL_KEY = 'nexus_approval_queue';

async function loadApprovalQueue(): Promise<ApprovalItem[]> {
  const { kvGet } = await import('@/lib/services/puterService');
  const data = await kvGet(APPROVAL_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveApprovalQueue(items: ApprovalItem[]): Promise<void> {
  const { kvSet } = await import('@/lib/services/puterService');
  await kvSet(APPROVAL_KEY, JSON.stringify(items));
}

export async function GET() {
  const items = await loadApprovalQueue();
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const items = await loadApprovalQueue();
  
  const newItem: ApprovalItem = {
    id: `approval_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    content: body.content,
    platform: body.platform,
    author: body.author,
    status: 'pending',
    submittedAt: new Date().toISOString(),
    priority: body.priority || 'medium',
  };
  
  items.push(newItem);
  await saveApprovalQueue(items);
  
  return NextResponse.json({ item: newItem }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, action, notes, reviewer } = body;
  
  const items = await loadApprovalQueue();
  const index = items.findIndex(i => i.id === id);
  
  if (index === -1) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }
  
  switch (action) {
    case 'approve':
      items[index].status = 'approved';
      items[index].reviewer = reviewer;
      items[index].reviewNotes = notes;
      break;
    case 'reject':
      items[index].status = 'rejected';
      items[index].reviewer = reviewer;
      items[index].reviewNotes = notes;
      break;
    case 'request_revisions':
      items[index].status = 'revisions_requested';
      items[index].reviewer = reviewer;
      items[index].reviewNotes = notes;
      break;
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  
  await saveApprovalQueue(items);
  return NextResponse.json({ item: items[index] });
}
