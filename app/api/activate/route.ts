import { NextResponse, type NextRequest } from 'next/server';
import { activateFullSystem } from '@/lib/services/systemActivation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { goal } = body;

    if (!goal) {
      return NextResponse.json({ error: 'A North Star goal is required for activation.' }, { status: 400 });
    }

    const result = await activateFullSystem(goal);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Activation failed' }, { status: 500 });
  }
}
