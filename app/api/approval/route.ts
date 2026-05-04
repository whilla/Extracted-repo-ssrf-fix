import { NextResponse, type NextRequest } from 'next/server';
import { getPendingApprovals, updateApprovalStatus, getApprovalQueue } from '@/lib/services/approvalQueueService';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view');

  if (view === 'all') {
    const queue = await getApprovalQueue();
    return NextResponse.json(queue);
  }

  const pending = await getPendingApprovals();
  return NextResponse.json(pending);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, feedback } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const success = await updateApprovalStatus(id, status, feedback);
    if (!success) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
