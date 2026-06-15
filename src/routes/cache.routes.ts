import { Router } from 'express';
import { getCacheStats } from '../controllers/cache.controller.js';

const router = Router();

router.get('/api/cache/stats', getCacheStats);

export default router;
