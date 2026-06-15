import { Router } from 'express';
import { getQueueStatsHandler } from '../controllers/queue.controller.js';

const router = Router();

router.get('/api/queue/stats', getQueueStatsHandler);

export default router;
