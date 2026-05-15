import { NextRequest, NextResponse } from 'next/server';
import { listSSOProviders, createSSOProvider, getServerSession } from '@/lib/services/ssoService';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const providers = await listSSOProviders();
    return NextResponse.json({ providers });
  } catch (error) {
    console.error('Error listing SSO providers:', error);
    return NextResponse.json({ error: 'Failed to list SSO providers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, name, domain, metadataUrl, entityId } = body;

    if (!type || !name || !domain) {
      return NextResponse.json(
        { error: 'type, name, and domain are required' },
        { status: 400 }
      );
    }

    if (!['saml', 'oidc'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be "saml" or "oidc"' },
        { status: 400 }
      );
    }

    const provider = await createSSOProvider({
      type,
      name,
      domain,
      metadataUrl,
      entityId,
    });

    if (!provider) {
      return NextResponse.json(
        { error: 'Failed to create SSO provider' },
        { status: 500 }
      );
    }

    return NextResponse.json({ provider }, { status: 201 });
  } catch (error) {
    console.error('Error creating SSO provider:', error);
    return NextResponse.json({ error: 'Failed to create SSO provider' }, { status: 500 });
  }
}
