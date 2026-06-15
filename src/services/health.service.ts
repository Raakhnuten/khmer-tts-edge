import { getDb } from '../database/index.js';
import { cacheService } from './cache.service.js';
import { queueService } from './queue.service.js';
import { config } from '../config/index.js';

let startTime = Date.now();

export const healthService = {
  resetUptime(): void {
    startTime = Date.now();
  },

  getUptime(): number {
    return Math.floor((Date.now() - startTime) / 1000);
  },

  checkDatabase(): 'ok' | 'error' {
    try {
      getDb().prepare('SELECT 1').get();
      return 'ok';
    } catch {
      return 'error';
    }
  },

  checkCache(): 'ok' | 'error' {
    try {
      const stats = cacheService.getStats();
      return typeof stats.hits === 'number' && typeof stats.misses === 'number' ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  },

  getMetrics() {
    const db = getDb();
    const cacheStats = cacheService.getStats();
    const countByStatus = db.prepare(
      `SELECT status, COUNT(*) as count FROM jobs GROUP BY status`
    ).all() as { status: string; count: number }[];
    const retryCount = db.prepare('SELECT COALESCE(SUM(attempts), 0) as total FROM jobs').get() as { total: number };
    const cacheEntries = db.prepare('SELECT COUNT(*) as count FROM jobs').get() as { count: number };

    const statusMap: Record<string, number> = {};
    for (const r of countByStatus) statusMap[r.status] = r.count;

    const mem = process.memoryUsage();

    return {
      uptime: this.getUptime(),
      timestamp: new Date().toISOString(),
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
      },
      cache: {
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        ratio: cacheStats.hits + cacheStats.misses > 0
          ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses)).toFixed(4)
          : '0.0000',
      },
      queue: {
        queued: statusMap.queued ?? 0,
        processing: statusMap.processing ?? 0,
        completed: statusMap.completed ?? 0,
        failed: statusMap.failed ?? 0,
        retries: retryCount.total,
      },
    };
  },
};
