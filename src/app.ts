import express from 'express';
import { readFile } from 'fs/promises';
import { resolve, join } from 'path';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import ttsRoutes from './routes/tts.routes.js';
import jobsRoutes from './routes/jobs.routes.js';
import subtitleRoutes from './routes/subtitle.routes.js';
import cacheRoutes from './routes/cache.routes.js';
import queueRoutes from './routes/queue.routes.js';
import healthRoutes from './routes/health.routes.js';
import { openApiSpec } from './openapi.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { config } from './config/index.js';

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", "'unsafe-inline'"],
      'script-src-attr': ["'unsafe-inline'"],
    },
  },
}));
app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') }));

app.use(express.json({ limit: '1mb' }));
app.use(express.static(resolve('public'), {
  maxAge: '1h',
  etag: true,
  lastModified: true,
}));

app.use(requestLogger);

app.use(healthRoutes);

const globalLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later' } },
});
app.use(globalLimiter);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.get('/openapi.json', (_req, res) => {
  res.json(openApiSpec);
});

app.get('/', async (_req, res) => {
  const htmlPath = join(resolve(), 'public', 'index.html');
  try {
    const html = await readFile(htmlPath, 'utf-8');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch {
    res.status(500).send('index.html not found');
  }
});

app.use(ttsRoutes);
app.use(jobsRoutes);
app.use(subtitleRoutes);
app.use(cacheRoutes);
app.use(queueRoutes);

app.use(errorHandler);

export default app;
