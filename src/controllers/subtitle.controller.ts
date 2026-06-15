import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { stat } from 'fs/promises';
import { join } from 'path';
import { parseSRT, saveMetadata } from '../subtitle.js';
import {
  getSubtitleJob,
  createSubtitleJobInStore,
  applySegmentUpdates,
  processSubtitleSegments,
} from '../services/subtitle.service.js';
import { exportSubtitleFinal, previewSubtitleFinal } from '../services/export.service.js';
import { streamFile } from '../utils/stream.js';
import { sanitizeFilename } from '../utils/helpers.js';
import { AppError } from '../errors/index.js';
import { config } from '../config/index.js';

const MAX_SRT_SIZE = config.maxSrtSize;

export function importSrt(req: Request, res: Response): void {
  const { srt } = req.body;
  if (!srt || !srt.trim()) {
    throw new AppError(400, 'SRT_REQUIRED', 'SRT content is required');
  }
  if (srt.length > MAX_SRT_SIZE) {
    throw new AppError(400, 'SRT_TOO_LARGE', `SRT content too large (${(srt.length / 1024 / 1024).toFixed(1)}MB). Maximum is ${MAX_SRT_SIZE / 1024 / 1024}MB.`);
  }
  const parsed = parseSRT(srt);
  if (parsed.length === 0) {
    throw new AppError(400, 'SRT_INVALID', 'No valid subtitle blocks found in SRT. Check your format (HH:MM:SS,mmm --> HH:MM:SS,mmm).');
  }
  res.json({ segments: parsed });
}

export async function createSubtitleJobHandler(req: Request, res: Response): Promise<void> {
  const { segments } = req.body;
  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    throw new AppError(400, 'SEGMENTS_REQUIRED', 'Segments array is required');
  }

  const id = randomUUID();
  const jobDir = join(config.subtitleJobsDir, id);
  await createSubtitleJobInStore(id, segments, jobDir);

  res.status(201).json({ id });
}

export function getSubtitleJobHandler(req: Request, res: Response): void {
  const sid = req.params.id as string;
  const job = getSubtitleJob(sid);
  if (!job) throw new AppError(404, 'SUBTITLE_JOB_NOT_FOUND', 'Subtitle job not found');

  res.json(job);
}

export async function generateSegments(req: Request, res: Response): Promise<void> {
  const jobId = req.params.id as string;
  const job = getSubtitleJob(jobId);
  if (!job) throw new AppError(404, 'SUBTITLE_JOB_NOT_FOUND', 'Subtitle job not found');

  const { indices, segments: updatedSegments } = req.body;
  if (!indices || !Array.isArray(indices) || indices.length === 0) {
    throw new AppError(400, 'INDICES_REQUIRED', 'indices array is required');
  }

  if (updatedSegments && Array.isArray(updatedSegments)) {
    applySegmentUpdates(job, updatedSegments);
  }

  job.status = 'processing';
  const jobDir = join(config.subtitleJobsDir, jobId);
  await saveMetadata(jobDir, job);

  processSubtitleSegments(jobId, indices, jobDir);

  res.json({ status: 'processing', jobId });
}

export async function getSegmentAudio(req: Request, res: Response): Promise<void> {
  const jobId = req.params.id as string;
  const index = parseInt(req.query.index as string);
  if (isNaN(index) || index < 0) {
    throw new AppError(400, 'INVALID_INDEX', 'Invalid segment index');
  }
  const job = getSubtitleJob(jobId);
  if (!job) throw new AppError(404, 'SUBTITLE_JOB_NOT_FOUND', 'Subtitle job not found');

  const seg = job.segments[index];
  if (!seg || seg.status !== 'completed') {
    throw new AppError(400, 'SEGMENT_NOT_AVAILABLE', 'Segment audio not available. Generate the segment first.');
  }

  const adjustedDir = join(config.subtitleJobsDir, jobId, 'adjusted');
  const chunkName = `${String(index).padStart(4, '0')}.mp3`;
  const filePath = join(adjustedDir, chunkName);

  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat || fileStat.size === 0) {
    throw new AppError(404, 'SEGMENT_FILE_NOT_FOUND', 'Segment audio file not found or empty');
  }

  streamFile(res, filePath, `segment-${index}.mp3`, 'audio/mpeg');
}

export async function exportAudio(req: Request, res: Response): Promise<void> {
  const { jobId, filename, gapMode, smoothMerge, crossfadeMs } = req.body;
  if (!jobId) throw new AppError(400, 'JOB_ID_REQUIRED', 'jobId is required');

  const job = getSubtitleJob(jobId);
  if (!job) throw new AppError(404, 'SUBTITLE_JOB_NOT_FOUND', 'Subtitle job not found');

  const completedCount = job.segments.filter((s) => s.status === 'completed').length;
  if (completedCount === 0) {
    throw new AppError(400, 'NO_COMPLETED_SEGMENTS', 'No completed segments to export');
  }

  const result = await exportSubtitleFinal(job, { filename, gapMode, smoothMerge, crossfadeMs }, config.subtitleJobsDir);

  res.json({
    exportId: jobId,
    filename: result.filename,
    downloadUrl: result.downloadUrl,
  });
}

export async function downloadExport(req: Request, res: Response): Promise<void> {
  const jobId = req.params.id as string;
  const finalPath = join(config.subtitleJobsDir, jobId, 'final.mp3');
  const fileStat = await stat(finalPath).catch(() => {
    throw new AppError(404, 'EXPORT_NOT_FOUND', 'Export not found. Please export first.');
  });
  if (fileStat.size === 0) {
    throw new AppError(500, 'EMPTY_EXPORT', 'Exported MP3 is empty');
  }
  let filename = req.query.filename as string;
  if (!filename) filename = `subtitles-${jobId.slice(0, 8)}.mp3`;
  filename = sanitizeFilename(filename);
  res.setHeader('Content-Length', fileStat.size);
  streamFile(res, finalPath, filename, 'audio/mpeg', 'attachment');
}

export async function previewCompleted(req: Request, res: Response): Promise<void> {
  const { jobId } = req.body;
  if (!jobId) throw new AppError(400, 'JOB_ID_REQUIRED', 'jobId is required');

  const job = getSubtitleJob(jobId);
  if (!job) throw new AppError(404, 'SUBTITLE_JOB_NOT_FOUND', 'Subtitle job not found');

  const completed = job.segments
    .filter(s => s.status === 'completed')
    .sort((a, b) => a.index - b.index);

  if (completed.length === 0) {
    throw new AppError(400, 'NO_COMPLETED_SEGMENTS', 'No completed segments to preview');
  }

  const result = await previewSubtitleFinal(job, req.body, config.subtitleJobsDir);

  res.json({
    success: true,
    url: result.url,
    duration: result.duration,
    segmentCount: result.segmentCount,
  });
}

export async function getPreviewCompletedAudio(req: Request, res: Response): Promise<void> {
  const jobId = req.params.jobId as string;
  const previewFile = join(config.subtitleJobsDir, jobId, 'preview-completed.mp3');
  const fileStat = await stat(previewFile).catch(() => {
    throw new AppError(404, 'PREVIEW_NOT_FOUND', 'Preview not found. Generate completed segments first.');
  });
  if (fileStat.size === 0) {
    throw new AppError(500, 'EMPTY_PREVIEW', 'Preview audio is empty');
  }
  streamFile(res, previewFile, 'preview-completed.mp3', 'audio/mpeg');
}
