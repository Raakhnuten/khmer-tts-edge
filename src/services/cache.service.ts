import { mkdir, readFile, writeFile, unlink, readdir, copyFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { computeTextHash } from '../utils/helpers.js';
import { config } from '../config/index.js';
import { logger } from '../logger.js';

interface CacheStats {
  hits: number;
  misses: number;
}

const stats: CacheStats = { hits: 0, misses: 0 };
const pending = new Set<string>();

function buildKey(text: string, voice: string, speed: number = 1.0): string {
  return computeTextHash(text + voice + String(speed));
}

function filePath(key: string): string {
  return join(config.cacheDir, `${key}.mp3`);
}

export const cacheService = {
  async init(): Promise<void> {
    await mkdir(config.cacheDir, { recursive: true });
  },

  getStats(): CacheStats {
    return { ...stats };
  },

  async getBuffer(text: string, voice: string, speed: number = 1.0): Promise<Buffer | null> {
    const key = buildKey(text, voice, speed);
    if (pending.has(key)) return null;
    const path = filePath(key);
    try {
      const buf = await readFile(path);
      stats.hits++;
      logger.debug({ cacheKey: key, cacheHit: true }, 'Audio cache hit');
      return buf;
    } catch {
      stats.misses++;
      return null;
    }
  },

  async saveBuffer(text: string, voice: string, buffer: Buffer, speed: number = 1.0): Promise<void> {
    const key = buildKey(text, voice, speed);
    pending.add(key);
    try {
      const path = filePath(key);
      await writeFile(path, buffer);
      logger.debug({ cacheKey: key, size: buffer.length }, 'Audio cached');
    } finally {
      pending.delete(key);
    }
  },

  async getPath(text: string, voice: string, speed: number = 1.0): Promise<string | null> {
    const key = buildKey(text, voice, speed);
    if (pending.has(key)) return null;
    const path = filePath(key);
    try {
      await stat(path);
      stats.hits++;
      logger.debug({ cacheKey: key, cacheHit: true }, 'Audio cache hit (path)');
      return path;
    } catch {
      stats.misses++;
      return null;
    }
  },

  async saveFromPath(text: string, voice: string, srcPath: string, speed: number = 1.0): Promise<void> {
    const key = buildKey(text, voice, speed);
    pending.add(key);
    try {
      const dest = filePath(key);
      await copyFile(srcPath, dest);
      const { size } = await stat(dest);
      logger.debug({ cacheKey: key, size }, 'Audio cached from path');
    } finally {
      pending.delete(key);
    }
  },

  async cleanup(): Promise<void> {
    const dir = config.cacheDir;
    const maxAge = config.cacheMaxAgeMs;
    const maxEntries = config.cacheMaxEntries;
    const now = Date.now();

    try {
      const files = await readdir(dir);
      const entries: Array<{ name: string; mtime: Date; size: number }> = [];

      for (const name of files) {
        if (extname(name) !== '.mp3') continue;
        const fullPath = join(dir, name);
        try {
          const s = await stat(fullPath);
          entries.push({ name, mtime: s.mtime, size: s.size });
        } catch { }
      }

      let removed = 0;
      for (const e of entries) {
        if (now - e.mtime.getTime() > maxAge) {
          await unlink(join(dir, e.name)).catch(() => {});
          removed++;
        }
      }

      if (entries.length - removed > maxEntries) {
        const sorted = entries
          .filter(e => now - e.mtime.getTime() <= maxAge)
          .sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

        const toRemove = sorted.slice(0, sorted.length - maxEntries);
        for (const e of toRemove) {
          await unlink(join(dir, e.name)).catch(() => {});
          removed++;
        }
      }

      if (removed > 0) {
        logger.debug({ removed }, 'Cache cleanup removed expired entries');
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        logger.error({ err }, 'Cache cleanup failed');
      }
    }
  },
};
