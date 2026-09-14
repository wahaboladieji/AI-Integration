import { NextResponse } from 'next/server';
import { jobRepository } from '@/server/jobs/job-repository';

/**
 * Job Status Endpoint (/api/jobs/[id])
 * 
 * Returns the truthful database status of a job:
 * pending | processing | done | failed
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    if (!jobId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Job ID is required' },
        { status: 400 }
      );
    }

    const job = await jobRepository.findJobById(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Not Found', message: `Job with ID '${jobId}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      attempts: job.attempts,
      errorMessage: job.errorMessage,
      jobType: job.jobType,
      parentJobId: job.parentJobId,
      originalFilename: job.originalFilename,
      mimeType: job.mimeType,
      fileSizeBytes: job.fileSizeBytes,
      storageKey: job.storageKey,
      resultData: job.resultData,
      rawOutput: job.rawOutput,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      followupJobs: job.followupJobs.map((f) => ({
        id: f.id,
        status: f.status,
        jobType: f.jobType,
        createdAt: f.createdAt,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', message: error?.message || 'Failed to fetch job' },
      { status: 500 }
    );
  }
}
