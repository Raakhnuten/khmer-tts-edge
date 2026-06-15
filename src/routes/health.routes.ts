import { Router } from 'express';
import { healthCheck, readinessCheck, metricsHandler } from '../controllers/health.controller.js';

const router = Router();

router.get('/api/health', healthCheck);
router.get('/api/ready', readinessCheck);
router.get('/api/metrics', metricsHandler);

export default router;
