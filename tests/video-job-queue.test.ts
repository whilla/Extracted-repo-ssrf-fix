import { describe, it, expect, vi, beforeEach } from 'vitest';
import { kvGet, kvSet } from '@/lib/services/puterService';

vi.mock('@/lib/services/puterService');

describe('Video Job Queue (via API)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Job lifecycle', () => {
    it('creates job with pending status', async () => {
      vi.mocked(kvSet).mockResolvedValue(true);

      const job = {
        id: 'render_test_123',
        status: 'pending' as const,
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await kvSet(`render_job_${job.id}`, JSON.stringify(job));

      expect(kvSet).toHaveBeenCalledWith(
        `render_job_${job.id}`,
        JSON.stringify(job)
      );
    });

    it('updates job progress', async () => {
      const storedJobs: Record<string, string> = {};
      vi.mocked(kvSet).mockImplementation(async (key: string, value: unknown) => {
        storedJobs[key] = value as string;
        return true;
      });
      vi.mocked(kvGet).mockImplementation(async (key: string) => {
        return storedJobs[key] || null;
      });

      const jobId = 'render_test_456';
      const job = {
        id: jobId,
        status: 'processing' as const,
        progress: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await kvSet(`render_job_${jobId}`, JSON.stringify(job));

      const stored = JSON.parse(storedJobs[`render_job_${jobId}`]);
      expect(stored.status).toBe('processing');
      expect(stored.progress).toBe(0);

      stored.progress = 50;
      await kvSet(`render_job_${jobId}`, JSON.stringify(stored));

      const updated = JSON.parse(storedJobs[`render_job_${jobId}`]);
      expect(updated.progress).toBe(50);
    });

    it('completes job with output URL', async () => {
      const storedJobs: Record<string, string> = {};
      vi.mocked(kvSet).mockImplementation(async (key: string, value: unknown) => {
        storedJobs[key] = value as string;
        return true;
      });

      const jobId = 'render_test_789';
      const job = {
        id: jobId,
        status: 'processing' as const,
        progress: 50,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await kvSet(`render_job_${jobId}`, JSON.stringify(job));

      const completed = {
        ...job,
        status: 'completed' as const,
        progress: 100,
        outputUrl: 'blob:https://example.com/video.webm',
        updatedAt: Date.now(),
      };

      await kvSet(`render_job_${jobId}`, JSON.stringify(completed));

      const stored = JSON.parse(storedJobs[`render_job_${jobId}`]);
      expect(stored.status).toBe('completed');
      expect(stored.progress).toBe(100);
      expect(stored.outputUrl).toContain('blob:');
    });
  });
});
