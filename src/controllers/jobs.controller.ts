import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { stat } from 'fs/promises';
import { join } from 'path';
import { validateText, isValidKhmerVoice } from '../voices.js';
import { getJob, queueJob } from '../services/job.service.js';
import { streamFile } from '../utils/stream.js';
import { AppError } from '../errors/index.js';
import { config } from '../config/index.js';
import { Job } from '../types/index.js';

export function createJob(req: Request, res: Response): void {
  const { text, voice } = req.body;

  const textErr = validateText(text);
  if (textErr) throw new AppError(400, 'INVALID_TEXT', textErr);

  if (!voice) throw new AppError(400, 'VOICE_REQUIRED', 'Voice is required');

  if (!isValidKhmerVoice(voice)) {
    throw new AppError(400, 'INVALID_VOICE', `Invalid voice "${voice}". Use km-KH-PisethNeural or km-KH-SreymomNeural.`);
  }

  const id = randomUUID();
  const trimmed = text.trim();
  const now = new Date();
  const job: Job = {
    id,
    status: 'queued',
    voice,
    text: trimmed,
    progress: 0,
    currentChunk: 0,
    totalChunks: 0,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    maxAttempts: config.maxQueueRetries,
    scheduledAt: now,
  };
  queueJob(job);

  res.status(201).json({ id });
}

export function getJobHandler(req: Request, res: Response): void {
  const jobId = req.params.id as string;
  const job = getJob(jobId);
  if (!job) throw new AppError(404, 'JOB_NOT_FOUND', 'Job not found');

  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    currentChunk: job.currentChunk,
    totalChunks: job.totalChunks,
    error: job.error || null,
    createdAt: job.createdAt,
  });
}

export async function downloadJob(req: Request, res: Response): Promise<void> {
  const jobId = req.params.id as string;
  const job = getJob(jobId);
  if (!job) throw new AppError(404, 'JOB_NOT_FOUND', 'Job not found');
  if (job.status !== 'completed' || !job.outputPath) {
    throw new AppError(400, 'JOB_NOT_COMPLETED', 'Job is not completed yet');
  }
  const fileStat = await stat(job.outputPath);
  if (fileStat.size === 0) throw new AppError(500, 'EMPTY_FILE', 'Generated audio file is empty');

  streamFile(res, job.outputPath, `khmer-tts-${job.id.slice(0, 8)}.mp3`, 'audio/mpeg', 'attachment');
}
