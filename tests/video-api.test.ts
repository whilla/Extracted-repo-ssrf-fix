import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/services/puterService', () => ({
  kvGet: vi.fn(async () => null),
  kvSet: vi.fn(async () => {}),
}));

vi.mock('@/lib/services/videoRenderingService', () => ({
  videoRenderingService: {
    renderCanvas: vi.fn(async () => ({ success: true, outputUrl: 'blob:test' })),
    getPreset: vi.fn((preset: string) => ({ width: 1080, height: 1920, fps: 30 })),
  },
}));

vi.mock('@/lib/services/videoEditingService', () => ({
  VideoEditingService: {
    createTimeline: vi.fn(),
    addTrack: vi.fn(),
    addTransition: vi.fn(),
    renderTimeline: vi.fn(async () => ({ success: true, outputUrl: 'blob:test' })),
    getTimeline: vi.fn(() => null),
  },
}));

vi.mock('@/lib/utils/apiMiddleware', () => ({
  withApiMiddleware: vi.fn(async (_req: any, handler: any) => handler()),
}));

describe('Video API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/video', () => {
    it('returns presets for get_preset action', async () => {
      const { POST, GET } = await import('@/app/api/video/route');

      const mockRequest = {
        json: async () => ({ action: 'get_preset', preset: 'social' }),
      } as any;

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.options).toBeDefined();
    });

    it('returns error for unknown action', async () => {
      const { POST } = await import('@/app/api/video/route');

      const mockRequest = {
        json: async () => ({ action: 'unknown' }),
      } as any;

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toBe('Unknown action');
    });
  });

  describe('GET /api/video', () => {
    it('returns available presets', async () => {
      const { GET } = await import('@/app/api/video/route');

      const mockRequest = {
        nextUrl: { searchParams: { get: () => null } },
      } as any;

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.presets).toBeDefined();
      expect(data.presets.social).toBeDefined();
      expect(data.presets.youtube).toBeDefined();
      expect(data.presets.square).toBeDefined();
    });

    it('returns 404 for non-existent job', async () => {
      const { GET } = await import('@/app/api/video/route');

      const mockRequest = {
        nextUrl: {
          searchParams: {
            get: (key: string) => key === 'action' ? 'status' : key === 'jobId' ? 'nonexistent' : null,
          },
        },
      } as any;

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });
});
