import { Request, Response } from 'express';
import { listAllVoices, isValidKhmerVoice, validateText, SHORT_TEXT_LIMIT } from '../voices.js';
import { generateDirectAudio } from '../services/tts.service.js';
import { AppError } from '../errors/index.js';
import { config } from '../config/index.js';

export async function getVoices(_req: Request, res: Response): Promise<void> {
  const voices = await listAllVoices();
  res.json(voices);
}

export async function generateHandler(req: Request, res: Response): Promise<void> {
  const { text, voice } = req.body;

  const textErr = validateText(text);
  if (textErr) throw new AppError(400, 'INVALID_TEXT', textErr);

  if (!voice) throw new AppError(400, 'VOICE_REQUIRED', 'Voice is required');

  if (!isValidKhmerVoice(voice)) {
    throw new AppError(400, 'INVALID_VOICE', `Invalid voice "${voice}". Use km-KH-PisethNeural or km-KH-SreymomNeural.`);
  }

  const trimmed = text.trim();
  if (trimmed.length > SHORT_TEXT_LIMIT) {
    throw new AppError(400, 'TEXT_TOO_LONG', `Text too long (${trimmed.length} characters) for direct generation. Use POST /api/jobs for long audio.`);
  }

  const audioBuffer = await generateDirectAudio(trimmed, voice, config.tempDir);

  res.set('Content-Type', 'audio/mpeg');
  res.set('Content-Disposition', 'inline; filename="khmer-tts.mp3"');
  res.send(audioBuffer);
}
