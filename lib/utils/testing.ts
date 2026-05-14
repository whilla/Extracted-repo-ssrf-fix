/**
 * Test infrastructure and utilities
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createMockRequest } from './test-utils';

// Test setup for API routes
export function setupApiRouteTests(routeName: string, routeHandler: (request: NextRequest) => Promise<NextResponse>) {
  describe(`${routeName} API Route`, () => {
    let mockRequest: NextRequest;

    beforeEach(() => {
      // Reset all mocks before each test
      vi.restoreAllMocks();
    });

    describe('Authentication', () => {
      it('should require authentication for protected routes', async () => {
        mockRequest = createMockRequest({ method: 'POST' });
        const response = await routeHandler(mockRequest);
        expect(response.status).toBe(401);
      });

      it('should accept valid authentication', async () => {
        mockRequest = createMockRequest({ method: 'POST', userId: 'test-user' });
        const response = await routeHandler(mockRequest);
        expect(response.status).not.toBe(401);
      });
    });

    describe('Rate Limiting', () => {
      it('should enforce rate limits', async () => {
        // Mock rate limiter to return exceeded
        vi.spyOn(require('../utils/rateLimit'), 'checkRateLimit').mockReturnValue(
          NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
        );

        mockRequest = createMockRequest({ method: 'POST', userId: 'test-user' });
        const response = await routeHandler(mockRequest);
        expect(response.status).toBe(429);
      });
    });

    describe('Validation', () => {
      it('should validate request body', async () => {
        mockRequest = createMockRequest({ 
          method: 'POST', 
          userId: 'test-user',
          body: { invalid: 'data' }
        });
        const response = await routeHandler(mockRequest);
        expect(response.status).toBe(400);
      });

      it('should accept valid request body', async () => {
        mockRequest = createMockRequest({ 
          method: 'POST', 
          userId: 'test-user',
          body: { valid: 'data' }
        });
        const response = await routeHandler(mockRequest);
        expect(response.status).toBe(200);
      });
    });

    describe('Error Handling', () => {
      it('should handle internal errors gracefully', async () => {
        // Mock service to throw error
        vi.spyOn(require(`../services/${routeName}Service`), 'default').mockRejectedValue(
          new Error('Service error')
        );

        mockRequest = createMockRequest({ 
          method: 'POST', 
          userId: 'test-user',
          body: { valid: 'data' }
        });
        const response = await routeHandler(mockRequest);
        expect(response.status).toBe(500);
      });
    });
  });
}

// Test utilities
export function createTestContext() {
  return {
    userId: 'test-user-123',
    isAuthenticated: true,
  };
}

// Mock data generators
export function generateMockUser() {
  return {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
  };
}

// Integration test helpers
export async function testApiIntegration(
  route: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: any
) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const url = `${baseUrl}${route}`;
  
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  return {
    status: response.status,
    data: await response.json().catch(() => ({})),
  };
}

// Performance test helpers
export async function measurePerformance(
  fn: () => Promise<any>,
  iterations = 10
) {
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }
  
  return {
    average: times.reduce((a, b) => a + b, 0) / times.length,
    min: Math.min(...times),
    max: Math.max(...times),
    times,
  };
}
