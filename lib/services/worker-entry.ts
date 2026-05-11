// Worker Service Entrypoint
// This is a standalone Vercel Service handler for heavy computation.

import { runSandboxedCode } from './sandboxRunner';

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    response.statusCode = 405;
    return response.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
    }
    const parsedBody = JSON.parse(body);
    const { code, input, timeoutMs } = parsedBody;

    if (!code) {
      response.statusCode = 400;
      return response.end(JSON.stringify({ error: 'Code is required' }));
    }

    const result = await runSandboxedCode(code, input, timeoutMs);
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json');
    return response.end(JSON.stringify(result));
  } catch (error) {
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json');
    return response.end(JSON.stringify({ error: (error as Error).message || 'Worker Execution Error' }));
  }
}
