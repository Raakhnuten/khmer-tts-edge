import { mkdir, readFile, unlink, rmdir, copyFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { generateAudio, ProgressInfo } from '../generate.js';
import { updateJob } from './job.service.js';
import { cacheService } from './cache.service.js';
import { logger } from '../logger.js';

const DEFAULT_SPEED = 1.0;

export async function processJob(id: string, text: string, voice: string, jobDir: string): Promise<void> {
  try {
    const cachedPath = await cacheService.getPath(text, voice, DEFAULT_SPEED);
    if (cachedPath) {
      await mkdir(jobDir, { recursive: true });
      const outputPath = join(jobDir, 'output.mp3');
      await copyFile(cachedPath, outputPath);
      logger.info({ jobId: id, cacheHit: true }, 'Job completed from cache');
      updateJob(id, { status: 'completed', progress: 100, outputPath, updatedAt: new Date() });
      return;
    }

    logger.info({ jobId: id, voice, textLength: text.length }, 'Job started');
    await mkdir(jobDir, { recursive: true });
    updateJob(id, { status: 'processing', updatedAt: new Date() });

    const outputPath = await generateAudio(text, voice, jobDir, (info: ProgressInfo) => {
      updateJob(id, {
        currentChunk: info.currentChunk,
        totalChunks: info.totalChunks,
        progress: info.totalChunks > 0 ? Math.round((info.currentChunk / info.totalChunks) * 100) : 0,
        updatedAt: new Date(),
      });
      if (info.status === 'failed') {
        logger.error({ jobId: id, chunk: info.currentChunk, error: info.error }, 'Job chunk failed');
        updateJob(id, { status: 'failed', error: info.error, updatedAt: new Date() });
      }
    });

    await cacheService.saveFromPath(text, voice, outputPath, DEFAULT_SPEED);
    logger.info({ jobId: id, outputPath }, 'Job completed');
    updateJob(id, { status: 'completed', progress: 100, outputPath, updatedAt: new Date() });
  } catch (err: any) {
    logger.error({ jobId: id, err }, `Job failed: ${err.message}`);
    updateJob(id, { status: 'failed', error: err.message, updatedAt: new Date() });
  }
}

export async function generateDirectAudio(text: string, voice: string, tempDir: string): Promise<Buffer> {
  const cached = await cacheService.getBuffer(text, voice, DEFAULT_SPEED);
  if (cached) return cached;

  const sessionId = randomUUID();
  const sessionDir = join(tempDir, sessionId);
  await mkdir(sessionDir, { recursive: true });
  try {
    const outputPath = await generateAudio(text, voice, sessionDir);
    const audioBuffer = await readFile(outputPath);
    await cacheService.saveBuffer(text, voice, audioBuffer, DEFAULT_SPEED);
    await unlink(outputPath).catch(() => {});
    await rmdir(sessionDir).catch(() => {});
    return audioBuffer;
  } catch (err) {
    await rmdir(sessionDir).catch(() => {});
    throw err;
  }
}
