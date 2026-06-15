import { logger } from '../logger.js';
import { Job } from '../types/index.js';
import { jobRepository } from '../repositories/job.repository.js';

export function getJob(id: string): Job | undefined {
  return jobRepository.findById(id);
}

export function queueJob(job: Job): void {
  jobRepository.save(job);
  logger.info({ jobId: job.id, status: job.status }, 'Job queued');
}

export function updateJob(id: string, updates: Partial<Job>): void {
  const job = jobRepository.findById(id);
  if (job) {
    const prevStatus = job.status;
    const merged = { ...job, ...updates, updatedAt: new Date() };
    jobRepository.save(merged);
    if (prevStatus !== merged.status) {
      logger.info({ jobId: id, fromStatus: prevStatus, toStatus: merged.status }, `Job status: ${prevStatus} → ${merged.status}`);
    }
  }
}

export function getQueueStats(): { queued: number; processing: number; completed: number; failed: number; retries: number } {
  const counts = jobRepository.countByStatus();
  const retries = jobRepository.totalAttempts();
  return {
    queued: counts['queued'] ?? 0,
    processing: counts['processing'] ?? 0,
    completed: counts['completed'] ?? 0,
    failed: counts['failed'] ?? 0,
    retries,
  };
}

export function cleanupJobs(maxAgeMs: number): void {
  jobRepository.cleanup(maxAgeMs);
}
