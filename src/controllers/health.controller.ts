import { Request, Response } from 'express';
import { healthService } from '../services/health.service.js';

export function healthCheck(_req: Request, res: Response): void {
  res.json({
    status: 'ok',
    uptime: healthService.getUptime(),
    timestamp: new Date().toISOString(),
  });
}

export function readinessCheck(_req: Request, res: Response): void {
  const db = healthService.checkDatabase();
  const cache = healthService.checkCache();

  const allOk = db === 'ok' && cache === 'ok';
  const overall = allOk ? 'ok' : db === 'error' ? 'down' : 'degraded';
  const statusCode = allOk ? 200 : db === 'error' ? 503 : 200;

  res.status(statusCode).json({
    status: overall,
    checks: { database: db, cache },
    uptime: healthService.getUptime(),
    timestamp: new Date().toISOString(),
  });
}

export function metricsHandler(_req: Request, res: Response): void {
  res.json(healthService.getMetrics());
}
