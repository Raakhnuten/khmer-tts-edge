import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createJob, getJobHandler, downloadJob } from '../controllers/jobs.controller.js';
import { validate } from '../middleware/validation.js';
import { createJobBodySchema, idParamsSchema } from '../validators/generate.schema.js';
import { config } from '../config/index.js';

const jobLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitQueueMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many job requests, please try again later' } },
});

const router = Router();

router.post('/api/jobs', jobLimiter, validate({ body: createJobBodySchema }), createJob);
router.get('/api/jobs/:id', validate({ params: idParamsSchema }), getJobHandler);
router.get('/api/download/:id', validate({ params: idParamsSchema }), downloadJob);

export default router;
