import { z } from 'zod';

const textRequired = z.string().min(1, 'Text is required');
const voiceRequired = z.string().min(1, 'Voice is required');

export const generateBodySchema = z.object({
  text: textRequired,
  voice: voiceRequired,
});

export const createJobBodySchema = z.object({
  text: textRequired,
  voice: voiceRequired,
});

export const idParamsSchema = z.object({
  id: z.string().min(1, 'id is required'),
});
