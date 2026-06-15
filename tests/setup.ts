import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let testDir: string | null = null;

export function getTestDir(): string {
  if (!testDir) {
    testDir = mkdtempSync(join(tmpdir(), 'khmer-tts-test-'));
  }
  return testDir;
}

export function setTestEnv(): void {
  const dir = getTestDir();
  process.env.DATABASE_PATH = join(dir, 'test.db');
  process.env.OUTPUT_DIR = dir;
  process.env.CACHE_DIR = join(dir, 'cache');
  process.env.QUEUE_POLL_INTERVAL_MS = '100';
  process.env.NODE_ENV = 'development';
}

export function cleanupTestDir(): void {
  if (testDir) {
    rmSync(testDir, { recursive: true, force: true });
    testDir = null;
  }
}
