import { prisma } from '@/server/db/prisma';
import { JobStatus, UploadJob, Prisma } from '@prisma/client';

/**
 * Job Repository Implementation
 * 
 * Rules from AGENTS.md Section 4:
 * - All Prisma reads/writes for job rows live HERE and nowhere else.
 * - Route handlers and worker NEVER call prisma.uploadJob directly.
 */

export interface CreateJobInput {
  userId: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  jobType?: string;
  parentJobId?: string;
}

export type UploadJobWithRelations = Prisma.UploadJobGetPayload<{
  include: {
    parentJob: true;
    followupJobs: true;
  };
}>;

export const jobRepository = {
  /**
   * Create a new job row with status 'pending'
   */
  async createJob(input: CreateJobInput): Promise<UploadJob> {
    return prisma.uploadJob.create({
      data: {
        userId: input.userId,
        storageKey: input.storageKey,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        jobType: input.jobType ?? 'primary',
        parentJobId: input.parentJobId ?? null,
        status: JobStatus.pending,
        attempts: 0,
      },
    });
  },

  /**
   * Find a job by ID with relations
   */
  async findJobById(jobId: string): Promise<UploadJobWithRelations | null> {
    return prisma.uploadJob.findUnique({
      where: { id: jobId },
      include: {
        parentJob: true,
        followupJobs: true,
      },
    });
  },

  /**
   * Mark a job as processing and increment attempt count
   */
  async markJobProcessing(jobId: string): Promise<UploadJob> {
    return prisma.uploadJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.processing,
        attempts: { increment: 1 },
      },
    });
  },

  /**
   * Mark a job as done with result payload
   */
  async markJobDone(
    jobId: string,
    resultData: Prisma.InputJsonValue,
    rawOutput?: string
  ): Promise<UploadJob> {
    return prisma.uploadJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.done,
        resultData,
        rawOutput: rawOutput ?? null,
        errorMessage: null,
      },
    });
  },

  /**
   * Mark a job as failed with an error message
   */
  async markJobFailed(jobId: string, errorMessage: string): Promise<UploadJob> {
    return prisma.uploadJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.failed,
        errorMessage,
      },
    });
  },

  /**
   * Retrieve pending jobs for queue worker processing
   */
  async getPendingJobs(limit: number = 5): Promise<UploadJob[]> {
    return prisma.uploadJob.findMany({
      where: { status: JobStatus.pending },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  },

  /**
   * Count currently processing jobs for concurrency bounding
   */
  async getProcessingJobCount(): Promise<number> {
    return prisma.uploadJob.count({
      where: { status: JobStatus.processing },
    });
  },

  /**
   * Ensure a default user exists for scaffolding/seeding
   */
  async getOrCreateDefaultUser(email: string = 'demo@example.com'): Promise<string> {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return existing.id;
    const user = await prisma.user.create({
      data: { email },
    });
    return user.id;
  },
};
