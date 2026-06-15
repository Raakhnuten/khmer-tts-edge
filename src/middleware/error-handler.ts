import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/index.js';
import { logger } from '../logger.js';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    logger.warn({ err, requestId: req.id, code: err.code, statusCode: err.statusCode }, err.message);
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  if (err instanceof z.ZodError) {
    logger.warn({ err, requestId: req.id }, 'Validation failed');
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.issues.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
    });
    return;
  }

  logger.error({ err, requestId: req.id }, 'Unhandled error');
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
    },
  });
}
