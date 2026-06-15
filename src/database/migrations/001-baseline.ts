import type Database from 'better-sqlite3';

export const id = '001-baseline';
export const description = 'Initial schema - jobs and subtitle_projects tables';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'queued',
      voice TEXT NOT NULL,
      text_content TEXT NOT NULL,
      text_hash TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      current_chunk INTEGER NOT NULL DEFAULT 0,
      total_chunks INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      output_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      scheduled_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS subtitle_projects (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_at ON jobs(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_subtitle_projects_created_at ON subtitle_projects(created_at);
  `);
}

export function down(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS jobs;
    DROP TABLE IF EXISTS subtitle_projects;
  `);
}
