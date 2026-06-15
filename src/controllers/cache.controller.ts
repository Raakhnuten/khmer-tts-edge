import { Request, Response } from 'express';
import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { cacheService } from '../services/cache.service.js';
import { config } from '../config/index.js';

export async function getCacheStats(_req: Request, res: Response): Promise<void> {
  const s = cacheService.getStats();
  let entryCount = 0;
  let totalSize = 0;

  try {
    const files = await readdir(config.cacheDir);
    for (const name of files) {
      if (extname(name) !== '.mp3') continue;
      const { size } = await stat(join(config.cacheDir, name));
      totalSize += size;
      entryCount++;
    }
  } catch { }

  res.json({
    hits: s.hits,
    misses: s.misses,
    size: totalSize,
    entries: entryCount,
  });
}
