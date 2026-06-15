import { Request, Response } from 'express';
import { getQueueStats } from '../services/job.service.js';

export function getQueueStatsHandler(_req: Request, res: Response): void {
  res.json(getQueueStats());
}
