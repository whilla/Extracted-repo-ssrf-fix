// Orchestrator Service Entrypoint
// This wraps the orchestration engine into a standalone Vercel Service.

import { orchestrate, type OrchestrationOptions } from './orchestrationEngine';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default async function handler(request: NextRequest) {
  if (request.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { userRequest, options } = body;

    if (!userRequest) {
      return NextResponse.json({ error: 'userRequest is required' }, { status: 400 });
    }

    const result = await orchestrate(userRequest, options || { requestType: 'content' });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Orchestration Error' }, { status: 500 });
  }
}
