import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { logger } from '../logger.js';

export const requestLogger = pinoHttp({
  logger,
  genReqId: () => randomUUID(),
  autoLogging: {
    ignore: (req) => req.url === '/',
  },
});
