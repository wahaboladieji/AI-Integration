import { AI_CONFIG } from '@/server/config/ai.config';
import { jobRepository } from '@/server/jobs/job-repository';
import { processJob } from '@/server/jobs/worker';

/**
 * Concurrency Cap & Queue Management
 * 
 * Rules from background-job-and-queue-implementation/SKILL.md:
 * - Real queue/concurrency cap that bounds in-flight processing.
 * - Reads cap limit directly from AI_CONFIG.concurrency.maxConcurrentJobs.
 * - Queued jobs wait when in-flight jobs reach the limit.
 */

let isProcessingQueue = false;

export const jobQueue = {
  /**
   * Enqueue a job for background execution and trigger queue processing loop
   */
  async enqueueJob(jobId: string): Promise<void> {
    // Non-blocking trigger of queue execution
    setImmediate(() => {
      this.processQueue().catch((err) => {
        console.error(`Error processing queue after enqueuing job ${jobId}:`, err);
      });
    });
  },

  /**
   * Process pending jobs while holding concurrency cap
   */
  async processQueue(): Promise<void> {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    try {
      const maxConcurrent = AI_CONFIG.concurrency.maxConcurrentJobs;

      while (true) {
        // Check current in-flight processing count from DB & local memory
        const activeCount = await jobRepository.getProcessingJobCount();
        if (activeCount >= maxConcurrent) {
          // Concurrency cap reached! Bounded processing enforced.
          break;
        }

        const availableSlots = maxConcurrent - activeCount;
        const pendingJobs = await jobRepository.getPendingJobs(availableSlots);

        if (pendingJobs.length === 0) {
          // No more pending jobs
          break;
        }

        // Process batch within concurrency cap limit
        const processPromises = pendingJobs.map(async (job) => {
          try {
            await processJob(job.id);
          } catch (error) {
            console.error(`Worker failed processing job ${job.id}:`, error);
          }
        });

        await Promise.all(processPromises);
      }
    } finally {
      isProcessingQueue = false;
    }
  },
};
