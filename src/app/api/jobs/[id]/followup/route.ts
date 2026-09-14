import { NextResponse } from 'next/server';
import { jobRepository } from '@/server/jobs/job-repository';
import { jobQueue } from '@/server/jobs/queue';
import { checkRateLimit, getClientIdentifier } from '@/server/rate-limit/rate-limiter';
import { AI_CONFIG } from '@/server/config/ai.config';

/**
 * Follow-up Action Endpoint (/api/jobs/[id]/followup)
 * 
 * Rules:
 * - Triggers single follow-up action: "Summarise".
 * - Must be rate limited per security.md & rate-limiting-implementation.
 * - Creates a distinct job row with jobType='followup' & parentJobId linked.
 * - Hands off to background queue without blocking.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: parentJobId } = await params;

    // 1. Rate Limiting Check
    const clientIp = getClientIdentifier(request);
    const rateLimit = checkRateLimit(clientIp, AI_CONFIG.rateLimit.followupAction);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Please try again in ${rateLimit.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
            'X-RateLimit-Limit': String(rateLimit.limit),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
          },
        }
      );
    }

    // 2. Validate parent job existence and status
    const parentJob = await jobRepository.findJobById(parentJobId);

    if (!parentJob) {
      return NextResponse.json(
        { error: 'Not Found', message: `Parent job '${parentJobId}' not found` },
        { status: 404 }
      );
    }

    if (parentJob.status !== 'done') {
      return NextResponse.json(
        { error: 'Bad Request', message: `Parent job must be 'done' to trigger follow-up action` },
        { status: 400 }
      );
    }

    // 3. Create follow-up job record in DB
    const followupJob = await jobRepository.createJob({
      userId: parentJob.userId,
      storageKey: parentJob.storageKey,
      originalFilename: parentJob.originalFilename,
      mimeType: parentJob.mimeType,
      fileSizeBytes: parentJob.fileSizeBytes,
      jobType: 'followup',
      parentJobId: parentJob.id,
    });

    // 4. Enqueue follow-up job into background queue
    await jobQueue.enqueueJob(followupJob.id);

    // 5. Return fast response
    return NextResponse.json(
      {
        success: true,
        followupJobId: followupJob.id,
        status: followupJob.status,
        message: 'Follow-up summary action triggered and queued for background processing.',
      },
      {
        status: 201,
        headers: {
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': String(rateLimit.remaining),
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', message: error?.message || 'Failed to trigger follow-up' },
      { status: 500 }
    );
  }
}
