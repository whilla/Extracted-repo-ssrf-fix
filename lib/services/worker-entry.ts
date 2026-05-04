// Worker Service Entrypoint
// This wraps the Sandbox Runner into a standalone Vercel Service for heavy computation.

import { runSandboxedCode } from './sandboxRunner';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default async function handler(request: NextRequest) {
  if (request.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { code, input, timeoutMs } = body;

    if (!code) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    const result = await runSandboxedCode(code, input, timeoutMs);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Worker Execution Error' }, { status: 500 });
  }
}
