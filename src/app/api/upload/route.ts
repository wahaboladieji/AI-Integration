import { NextResponse } from 'next/server';
import { storageClient } from '@/server/storage/storage-client';
import { jobRepository } from '@/server/jobs/job-repository';
import { jobQueue } from '@/server/jobs/queue';
import { checkRateLimit, getClientIdentifier } from '@/server/rate-limit/rate-limiter';
import { AI_CONFIG } from '@/server/config/ai.config';

/**
 * Upload Trigger Endpoint (/api/upload)
 * 
 * Rules:
 * - Handlers in /app/api stay thin: validate request, call /server, return fast.
 * - Server-side validation of file size and type per security.md.
 * - Rate limited using shared rate limiter per rate-limiting-implementation.
 * - Creates job row with status 'pending' and returns immediately (never blocks on AI model call).
 * - Only storage key lives in DB (never file content).
 */

export async function POST(request: Request) {
  try {
    // 1. Rate Limiting Check
    const clientIp = getClientIdentifier(request);
    const rateLimit = checkRateLimit(clientIp, AI_CONFIG.rateLimit.uploadTrigger);

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

    // 2. Parse Multipart Form Data
    const formData = await request.formData();
    const rawFiles = [
      ...formData.getAll('files'),
      ...formData.getAll('file'),
    ].filter((f): f is File => f instanceof File);

    // Deduplicate in case both field names were submitted
    const files = Array.from(new Set(rawFiles));

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'No files provided in upload payload' },
        { status: 400 }
      );
    }

    // 3. Obtain demo user ID to satisfy FK constraint
    const userId = await jobRepository.getOrCreateDefaultUser();

    // 4. Save file(s) binary via storage client (server-side type/size validation)
    const storedBatch = await storageClient.saveMultipleFiles(files);

    // 5. Create a SINGLE database job record for the unified upload bundle
    const job = await jobRepository.createJob({
      userId,
      storageKey: storedBatch.storageKey,
      originalFilename: storedBatch.originalFilename,
      mimeType: storedBatch.mimeType,
      fileSizeBytes: storedBatch.fileSizeBytes,
      jobType: 'primary',
    });

    // 6. Enqueue single job for background processing (non-blocking)
    await jobQueue.enqueueJob(job.id);

    // 7. Return fast response with job ID
    return NextResponse.json(
      {
        success: true,
        jobId: job.id,
        status: job.status,
        message: `${files.length} file(s) upload accepted. Unified job created and queued for processing.`,
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
    const message = error?.message || 'Failed to process file upload';
    const isValidationError = message.includes('exceeds') || message.includes('not supported') || message.includes('empty');
    
    return NextResponse.json(
      { error: isValidationError ? 'Validation Error' : 'Internal Server Error', message },
      { status: isValidationError ? 400 : 500 }
    );
  }
}
