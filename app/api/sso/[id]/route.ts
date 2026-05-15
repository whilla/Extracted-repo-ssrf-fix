import { NextRequest, NextResponse } from 'next/server';
import { deleteSSOProvider, updateSSOProvider, getServerSession } from '@/lib/services/ssoService';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const provider = await updateSSOProvider(params.id, body);

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider not found or update failed' },
        { status: 404 }
      );
    }

    return NextResponse.json({ provider });
  } catch (error) {
    console.error('Error updating SSO provider:', error);
    return NextResponse.json({ error: 'Failed to update SSO provider' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const success = await deleteSSOProvider(params.id);
    if (!success) {
      return NextResponse.json(
        { error: 'Provider not found or delete failed' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting SSO provider:', error);
    return NextResponse.json({ error: 'Failed to delete SSO provider' }, { status: 500 });
  }
}
