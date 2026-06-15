import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { jobRepository } from '../repositories/job.repository.js';
import { processJob } from './tts.service.js';

let pollTimer: ReturnType<typeof setInterval> | null = null;
let inFlight = 0;

function computeBackoff(attempt: number): number {
  return config.queueRetryBaseDelayMs * Math.pow(2, attempt - 1);
}

function scheduleRetry(id: string, attempts: number, errorMsg: string): void {
  const delay = computeBackoff(attempts);
  const scheduledAt = new Date(Date.now() + delay);
  jobRepository.update(id, {
    status: 'queued',
    attempts,
    scheduledAt,
    lastError: errorMsg,
  });
  logger.warn({ jobId: id, attempt: attempts, delayMs: delay, scheduledAt }, 'Retry scheduled');
}

function markFailed(id: string, attempts: number, errorMsg: string): void {
  jobRepository.update(id, {
    status: 'failed',
    attempts,
    lastError: errorMsg,
  });
  logger.error({ jobId: id, attempts, error: errorMsg }, 'Retry exhausted — job failed');
}

async function handleJobCompletion(id: string): Promise<void> {
  const job = jobRepository.findById(id);
  if (!job) return;

  if (job.status === 'completed') {
    jobRepository.update(id, { completedAt: new Date() });
    logger.info({ jobId: id }, 'Job completed');
  } else if (job.status === 'failed') {
    const attempts = job.attempts + 1;
    const errorMsg = job.error || job.lastError || 'Unknown error';
    if (attempts < config.maxQueueRetries) {
      scheduleRetry(id, attempts, errorMsg);
    } else {
      markFailed(id, attempts, errorMsg);
    }
  }
}

async function pollQueue(): Promise<void> {
  if (inFlight >= config.queueConcurrency) return;

  const available = config.queueConcurrency - inFlight;
  const now = new Date().toISOString();
  const jobs = jobRepository.findQueued(available, now);

  if (jobs.length === 0) return;

  inFlight += jobs.length;
  logger.debug({ picked: jobs.length, inFlight }, 'Queue worker picked jobs');

  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      const jobDir = `${config.jobsDir}/${job.id}`;
      try {
        jobRepository.update(job.id, {
          status: 'processing',
          startedAt: new Date(),
        });
        logger.info({ jobId: job.id }, 'Job started');

        await processJob(job.id, job.text, job.voice, jobDir);

        await handleJobCompletion(job.id);
      } catch (err: any) {
        logger.error({ jobId: job.id, err }, `Job processing error: ${err.message}`);
        const attempts = job.attempts + 1;
        if (attempts < config.maxQueueRetries) {
          scheduleRetry(job.id, attempts, err.message);
        } else {
          markFailed(job.id, attempts, err.message);
        }
      }
    })
  );

  inFlight -= jobs.length;

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    logger.error({ failed }, `${failed} queue worker(s) failed`);
  }
}

export const queueService = {
  start(): void {
    if (pollTimer) return;
    logger.info({ intervalMs: config.queuePollIntervalMs, concurrency: config.queueConcurrency }, 'Queue worker starting');
    pollTimer = setInterval(pollQueue, config.queuePollIntervalMs);
    pollTimer.unref();
    pollQueue();
  },

  stop(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    logger.info('Queue worker stopped');
  },

  async recover(): Promise<void> {
    const stuck = jobRepository.findProcessing();
    if (stuck.length > 0) {
      logger.warn({ count: stuck.length }, `Recovering ${stuck.length} stuck job(s)`);
      jobRepository.resetProcessingToQueued();
    }
  },
};
