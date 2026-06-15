import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getVoices, generateHandler } from '../controllers/tts.controller.js';
import { validate } from '../middleware/validation.js';
import { generateBodySchema } from '../validators/generate.schema.js';
import { config } from '../config/index.js';

const generateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitGenerateMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many generation requests, please try again later' } },
});

const router = Router();

router.get('/api/voices', getVoices);
router.post('/api/generate', generateLimiter, validate({ body: generateBodySchema }), generateHandler);

export default router;
