/**
 * Test utilities for creating mock requests and responses
 */

import { NextRequest } from 'next/server';

export function createMockRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: any;
  userId?: string;
}): NextRequest {
  const url = options.url || 'http://localhost:3000/test';
  const method = options.method || 'GET';
  
  const requestInit: RequestInit = {
    method,
    headers: options.headers || {},
  };
  
  if (options.body) {
    requestInit.body = JSON.stringify(options.body);
    requestInit.headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
  }
  
  if (options.userId) {
    requestInit.headers = {
      'x-user-id': options.userId,
      ...requestInit.headers,
    };
  }
  
  // Create a mock NextRequest
  const mockRequest = {
    method,
    url,
    headers: new Headers(requestInit.headers),
    nextUrl: {
      pathname: new URL(url).pathname,
      origin: new URL(url).origin,
      href: url,
    },
    json: async () => options.body || {},
    text: async () => JSON.stringify(options.body) || '',
  } as unknown as NextRequest;
  
  return mockRequest;
}

export function createMockResponse(
  data: any,
  status: number = 200,
  headers: Record<string, string> = {}
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

export function mockServiceMethod<T>(result: T, error?: Error) {
  return error 
    ? async () => { throw error; }
    : async () => result;
}

export function createMockContext(context: any = {}) {
  return {
    userId: 'test-user',
    isAuthenticated: true,
    ...context,
  };
}
