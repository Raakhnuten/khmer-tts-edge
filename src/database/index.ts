import Database from 'better-sqlite3';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { logger } from '../logger.js';
import { runMigrations, getAllMigrations } from './migrations/runner.js';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export async function initDatabase(dbPath: string): Promise<void> {
  await mkdir(dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db, getAllMigrations());

  logger.info({ dbPath }, 'Database initialized');
}

export function closeDatabase(): void {
  if (db) {
    db.close();
  }
}
