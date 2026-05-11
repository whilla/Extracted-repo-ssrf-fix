// Orchestrator Service Entrypoint
// This is a standalone Vercel Service handler.

import { orchestrate } from './orchestrationEngine';

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
    const { userRequest, options } = parsedBody;

    if (!userRequest) {
      response.statusCode = 400;
      return response.end(JSON.stringify({ error: 'userRequest is required' }));
    }

    const result = await orchestrate(userRequest, options || { requestType: 'content' });
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json');
    return response.end(JSON.stringify(result));
  } catch (error) {
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json');
    return response.end(JSON.stringify({ error: (error as any).message || 'Internal Orchestration Error' }));
  }
}
