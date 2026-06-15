import { mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { SubtitleJobData, SubtitleSegmentData, saveMetadata, generateSegmentAudio } from '../subtitle.js';
import { isValidKhmerVoice } from '../voices.js';
import { asyncPool, TTS_CONCURRENCY } from '../utils/asyncPool.js';
import { logger } from '../logger.js';
import { subtitleRepository } from '../repositories/subtitle.repository.js';

export function getSubtitleJob(id: string): SubtitleJobData | undefined {
  return subtitleRepository.findById(id);
}

export function buildSegmentFromInput(input: any, index: number): SubtitleSegmentData {
  return {
    index,
    startTime: input.startTime ?? 0,
    endTime: input.endTime ?? 0,
    text: input.text ?? '',
    voice: isValidKhmerVoice(input.voice) ? input.voice : 'km-KH-PisethNeural',
    status: 'pending',
    generatedDuration: null,
    speedRatio: null,
    error: null,
  };
}

export async function createSubtitleJobInStore(
  id: string,
  segmentsInput: any[],
  jobDir: string,
): Promise<SubtitleJobData> {
  await mkdir(join(jobDir, 'segments'), { recursive: true });
  await mkdir(join(jobDir, 'adjusted'), { recursive: true });

  const now = new Date().toISOString();
  const segs: SubtitleSegmentData[] = segmentsInput.map((s, i) => buildSegmentFromInput(s, i));

  const jobData: SubtitleJobData = { id, status: 'pending', segments: segs, createdAt: now, version: 1 };
  subtitleRepository.save(jobData);
  await saveMetadata(jobDir, jobData);

  logger.info({ subtitleJobId: id, segmentCount: segs.length }, 'Subtitle job created');
  return jobData;
}

export function applySegmentUpdates(
  job: SubtitleJobData,
  updates: Array<{ index: number; text?: string; voice?: string }>,
): void {
  for (const us of updates) {
    const target = job.segments.find((s) => s.index === us.index);
    if (target) {
      if (us.text !== undefined) target.text = us.text;
      if (us.voice !== undefined && isValidKhmerVoice(us.voice)) target.voice = us.voice;
    }
  }
}

export async function processSubtitleSegments(jobId: string, indices: number[], jobDir: string): Promise<void> {
  const job = subtitleRepository.findById(jobId);
  if (!job) return;

  const segmentsDir = join(jobDir, 'segments');
  const adjustedDir = join(jobDir, 'adjusted');

  logger.info({ subtitleJobId: jobId, indicesCount: indices.length }, 'Subtitle segment generation started');

  const pending = indices.filter(idx => {
    const seg = job.segments[idx];
    return seg && (seg.status === 'pending' || seg.status === 'failed' || seg.status === 'generating');
  });

  if (pending.length > 0) {
    await asyncPool(pending, TTS_CONCURRENCY, async (idx) => {
      const seg = job.segments[idx];
      if (!seg) return;

      seg.status = 'generating';
      seg.error = null;
      subtitleRepository.save(job);
      await saveMetadata(jobDir, job).catch(() => {});

      const targetDuration = seg.endTime - seg.startTime;

      try {
        const result = await generateSegmentAudio(
          seg.text, seg.voice, targetDuration,
          segmentsDir, adjustedDir, idx,
        );
        seg.status = result.status;
        seg.generatedDuration = result.generatedDuration;
        seg.speedRatio = result.speedRatio;
        seg.error = result.error;
      } catch (err: any) {
        seg.status = 'failed';
        seg.error = err.message;
      }

      subtitleRepository.save(job);
      await saveMetadata(jobDir, job).catch(() => {});
    });
  }

  const allDone = job.segments.every((s) => s.status === 'completed' || s.status === 'failed');
  if (allDone) {
    const anyFailed = job.segments.some((s) => s.status === 'failed');
    job.status = anyFailed ? 'failed' : 'completed';
    const completedCount = job.segments.filter(s => s.status === 'completed').length;
    const failedCount = job.segments.filter(s => s.status === 'failed').length;
    logger.info({ subtitleJobId: jobId, status: job.status, completedCount, failedCount, totalCount: job.segments.length }, 'Subtitle segment generation finished');
  } else {
    job.status = 'processing';
  }
  subtitleRepository.save(job);
  await saveMetadata(jobDir, job).catch(() => {});
}

export function cleanupSubtitleJobs(maxAgeMs: number, subtitleJobsDir: string): void {
  const oldIds = subtitleRepository.findOldIds(maxAgeMs);
  for (const id of oldIds) {
    unlink(join(subtitleJobsDir, id, 'final.mp3')).catch(() => {});
  }
  subtitleRepository.cleanup(maxAgeMs);
}
