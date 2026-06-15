import { stat } from 'fs/promises';
import { join } from 'path';
import { SubtitleJobData, exportFinalAudio, buildTimelineAudio } from '../subtitle.js';
import { sanitizeFilename } from '../utils/helpers.js';
import { logger } from '../logger.js';

export interface ExportResult {
  filename: string;
  downloadUrl: string;
  finalPath: string;
}

export interface PreviewResult {
  url: string;
  duration: number;
  segmentCount: number;
}

export async function exportSubtitleFinal(
  job: SubtitleJobData,
  options: { filename?: string; gapMode?: 'subtitle'; smoothMerge?: boolean; crossfadeMs?: number },
  subtitleJobsDir: string,
): Promise<ExportResult> {
  const jobId = job.id;
  const filename = options.filename
    ? sanitizeFilename(options.filename)
    : `subtitles-${jobId.slice(0, 8)}.mp3`;

  const jobDir = join(subtitleJobsDir, jobId);
  const adjustedDir = join(jobDir, 'adjusted');

  const { gapMode = 'subtitle', smoothMerge = true, crossfadeMs = 20 } = options;
  const finalPath = await exportFinalAudio(jobDir, job.segments, adjustedDir, { gapMode, smoothMerge, crossfadeMs });

  const fileStat = await stat(finalPath);
  if (fileStat.size === 0) throw new Error('Exported MP3 is empty');

  logger.info({ subtitleJobId: jobId, filename, size: fileStat.size }, 'Subtitle export completed');
  return {
    filename,
    downloadUrl: `/api/subtitles/export/${jobId}/download?filename=${encodeURIComponent(filename)}`,
    finalPath,
  };
}

export async function previewSubtitleFinal(
  job: SubtitleJobData,
  options: { gapMode?: 'subtitle'; smoothMerge?: boolean; crossfadeMs?: number },
  subtitleJobsDir: string,
): Promise<PreviewResult> {
  const jobId = job.id;
  const jobDir = join(subtitleJobsDir, jobId);
  const adjustedDir = join(jobDir, 'adjusted');
  const previewFile = join(jobDir, 'preview-completed.mp3');

  const { gapMode = 'subtitle', smoothMerge = true, crossfadeMs = 20 } = options;

  const result = await buildTimelineAudio(
    job.segments,
    adjustedDir,
    previewFile,
    { gapMode, smoothMerge, crossfadeMs },
  );

  return {
    url: `/api/subtitles/preview-completed/${jobId}`,
    duration: result.durationMs / 1000,
    segmentCount: result.segmentCount,
  };
}
