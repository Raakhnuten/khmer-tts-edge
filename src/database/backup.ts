import { copyFile, mkdir, stat, readdir, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { getDb } from './index.js';
import { config } from '../config/index.js';
import { logger } from '../logger.js';

export interface BackupResult {
  path: string;
  size: number;
  timestamp: string;
}

function defaultBackupDir(): string {
  return join(dirname(config.databasePath), 'backups');
}

export async function createBackup(destination?: string): Promise<BackupResult> {
  const db = getDb();
  const backupDir = destination || defaultBackupDir();
  await mkdir(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(backupDir, `khmer-tts-${timestamp}.db`);

  db.backup(backupPath);

  const { size } = await stat(backupPath);

  logger.info({ backupPath, size }, 'Database backup created');
  return { path: backupPath, size, timestamp };
}

export async function restoreBackup(backupPath: string): Promise<void> {
  if (!existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  const dbPath = config.databasePath;
  const tempPath = dbPath + '.restore-tmp';

  await copyFile(backupPath, tempPath);

  getDb().close();

  try {
    await copyFile(tempPath, dbPath);
    logger.info({ backupPath, dbPath }, 'Database restored from backup — server restart required');
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

export async function listBackups(backupDir?: string): Promise<string[]> {
  const dir = backupDir || defaultBackupDir();
  try {
    const files = await readdir(dir);
    return files.filter(f => f.endsWith('.db')).sort().reverse();
  } catch {
    return [];
  }
}
