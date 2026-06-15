import { z } from 'zod';

const segmentSchema = z.object({
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  text: z.string().optional(),
  voice: z.string().optional(),
});

const updateSegmentSchema = z.object({
  index: z.number(),
  text: z.string().optional(),
  voice: z.string().optional(),
});

export const importSrtBodySchema = z.object({
  srt: z.string().min(1, 'SRT content is required'),
});

export const createSubtitleJobBodySchema = z.object({
  segments: z.array(segmentSchema).min(1, 'Segments array is required'),
});

export const generateSegmentsBodySchema = z.object({
  indices: z.array(z.number()).min(1, 'indices array is required'),
  segments: z.array(updateSegmentSchema).optional(),
});

export const exportAudioBodySchema = z.object({
  jobId: z.string().min(1, 'jobId is required'),
  filename: z.string().optional(),
  gapMode: z.literal('subtitle').optional(),
  smoothMerge: z.boolean().optional(),
  crossfadeMs: z.number().int().min(0).optional(),
});

export const previewCompletedBodySchema = z.object({
  jobId: z.string().min(1, 'jobId is required'),
  gapMode: z.literal('subtitle').optional(),
  smoothMerge: z.boolean().optional(),
  crossfadeMs: z.number().int().min(0).optional(),
});

export const jobIdParamsSchema = z.object({
  jobId: z.string().min(1, 'jobId is required'),
});

export const segmentAudioQuerySchema = z.object({
  index: z.coerce.number().int().min(0, 'Invalid segment index'),
});

export const exportDownloadQuerySchema = z.object({
  filename: z.string().optional(),
});
