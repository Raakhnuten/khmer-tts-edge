import app from './app.js';
import { config } from './config/index.js';
import { logger } from './logger.js';
import { initDatabase, closeDatabase } from './database/index.js';
import { cleanupJobs } from './services/job.service.js';
import { cleanupSubtitleJobs } from './services/subtitle.service.js';
import { cacheService } from './services/cache.service.js';
import { queueService } from './services/queue.service.js';

await initDatabase(config.databasePath);
await cacheService.init();
await queueService.recover();
queueService.start();

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, `Khmer TTS Server running at http://localhost:${config.port}`);
});

server.timeout = 30 * 60 * 1000;
server.headersTimeout = 30 * 60 * 1000;
server.requestTimeout = 30 * 60 * 1000;

const ONE_HOUR = 60 * 60 * 1000;
setInterval(() => {
  cleanupSubtitleJobs(ONE_HOUR, config.subtitleJobsDir);
  cleanupJobs(ONE_HOUR);
  cacheService.cleanup();
}, 5 * 60 * 1000);

function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutting down...');
  queueService.stop();
  server.close(() => {
    closeDatabase();
    logger.info('Server stopped');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
