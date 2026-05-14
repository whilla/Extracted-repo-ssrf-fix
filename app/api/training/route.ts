import { NextRequest, NextResponse } from 'next/server';
import { ModelFineTuningService } from '@/lib/services/modelFineTuningService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * API endpoint for model fine-tuning (LoRA training)
 * 
 * POST /api/training
 * - Create a new fine-tuning job
 * 
 * GET /api/training
 * - List all training jobs
 * - ?jobId=xxx to get a specific job
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { 
        modelType = 'llm',
        baseModel, 
        trainingData, 
        epochs = 3,
        batchSize = 4,
        learningRate = 0.0001,
        loraRank = 8,
        loraAlpha = 16,
        targetModules 
      } = body;

      if (!baseModel || !trainingData || !trainingData.length) {
        return NextResponse.json(
          { success: false, error: 'baseModel and trainingData array are required' },
          { status: 400 }
        );
      }

      const result = await ModelFineTuningService.createLoRAJob({
        modelType,
        baseModel,
        trainingData,
        epochs,
        batchSize,
        learningRate,
        loraRank,
        loraAlpha,
        targetModules
      });

      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to create training job' },
        { status: 500 }
      );
    }
  });
}

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const jobId = searchParams.get('jobId');

      if (jobId) {
        const job = await ModelFineTuningService.getJob(jobId);
        if (!job) {
          return NextResponse.json(
            { success: false, error: 'Job not found' },
            { status: 404 }
          );
        }
        return NextResponse.json({ success: true, job });
      }

      // List all jobs
      const jobs = await ModelFineTuningService.listJobs();
      return NextResponse.json({ success: true, jobs });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to get training jobs' },
        { status: 500 }
      );
    }
  });
}