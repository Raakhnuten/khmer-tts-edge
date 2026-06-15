import type Database from 'better-sqlite3';
import { logger } from '../../logger.js';

interface Migration {
  id: string;
  description: string;
  up: (db: Database.Database) => void;
  down?: (db: Database.Database) => void;
}

interface MigrationRecord {
  id: string;
  description: string;
  applied_at: string;
}

export function createMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
}

export function getAppliedMigrations(db: Database.Database): string[] {
  const rows = db.prepare('SELECT id FROM _migrations ORDER BY id').all() as Pick<MigrationRecord, 'id'>[];
  return rows.map((r) => r.id);
}

export function getPendingMigrations(db: Database.Database, migrations: Migration[]): Migration[] {
  const applied = new Set(getAppliedMigrations(db));
  return migrations.filter((m) => !applied.has(m.id));
}

export function runMigrations(db: Database.Database, migrations: Migration[]): void {
  createMigrationsTable(db);

  const pending = getPendingMigrations(db, migrations);
  if (pending.length === 0) {
    logger.info('Database is up to date');
    return;
  }

  const apply = db.transaction(() => {
    for (const m of pending) {
      logger.info({ migration: m.id }, `Applying migration: ${m.description}`);
      m.up(db);
      db.prepare(
        'INSERT INTO _migrations (id, description, applied_at) VALUES (?, ?, ?)'
      ).run(m.id, m.description, new Date().toISOString());
      logger.info({ migration: m.id }, 'Migration applied');
    }
  });

  apply();
  logger.info({ count: pending.length }, `${pending.length} migration(s) applied`);
}

import { up as baselineUp, down as baselineDown, id as baselineId, description as baselineDescription } from './001-baseline.js';

export function getAllMigrations(): Migration[] {
  return [
    { id: baselineId, description: baselineDescription, up: baselineUp, down: baselineDown },
  ];
}
