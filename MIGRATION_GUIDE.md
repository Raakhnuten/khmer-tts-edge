# Migration Guide

## From Phase 5 (in-memory) to Phase 6 (SQLite)

This migration is automatic and lossless — the application creates the SQLite database file on startup. However, in-memory data from previous runs is **not** migrated because it was never persisted.

### What Changes

| Aspect | Before (Phase 5) | After (Phase 6) |
|--------|------------------|-----------------|
| Job storage | `Map<string, Job>` in `job.service.ts` | SQLite `jobs` table via `job.repository.ts` |
| Subtitle storage | `Map<string, SubtitleJobData>` in `subtitle.service.ts` | SQLite `subtitle_projects` table via `subtitle.repository.ts` |
| Startup data | Empty maps | Empty tables (data persists across restarts) |
| Cleanup | Iterates Map and deletes | SQL `DELETE WHERE created_at < ?` |
| Recovery | None | Job/subtitle state survives server restart |

### Steps for Existing Deployments

1. **Stop the server** — no special shutdown needed.
2. **Upgrade code** — pull the new Phase 6 code.
3. **Start the server** — the database file is automatically created at `output/khmer-tts.db` (or custom `DATABASE_PATH`).
4. **Verify** — old in-memory jobs are gone (they were never saved). New jobs will persist across restarts.

> No manual migration script is needed. The database is empty initially. All future data persists automatically.

### Rollback

If you need to revert to Phase 5:
1. Stop the server.
2. Revert code to Phase 5.
3. Restart — the SQLite file is ignored by Phase 5 code.

## Adding Future Migrations

When the schema needs to change (e.g. adding a column):

### Recommended approach:
1. Create `src/database/migrations/` directory.
2. Name files sequentially: `001_add_column_x.sql`, `002_create_table_y.sql`.
3. Add a `_migrations` tracking table to record which migrations have been applied.
4. On startup, check `_migrations` and apply any unapplied migrations in order.

### Example migration runner:
```ts
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { getDb } from './index.js';

export function runMigrations(): void {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r: any) => r.name)
  );

  const files = readdirSync(join(__dirname, 'migrations')).sort();
  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    if (applied.has(file)) continue;

    const sql = readFileSync(join(__dirname, 'migrations', file), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
    console.log(`Migration applied: ${file}`);
  }
}
```

## Phase 5 → Phase 6 Code Changes Reference

For developers reviewing the diff between phases:

### New files
- `src/database/index.ts` — SQLite init + connection singleton
- `src/repositories/job.repository.ts` — JobRepository
- `src/repositories/subtitle.repository.ts` — SubtitleRepository

### Changed files
- `src/types/index.ts` — `Job` interface gains `voice`, `text`, `updatedAt` fields
- `src/config/index.ts` — added `DATABASE_PATH` env var
- `src/services/job.service.ts` — now delegates to `jobRepository` instead of Map
- `src/services/subtitle.service.ts` — now delegates to `subtitleRepository` instead of Map
- `src/services/tts.service.ts` — passes `updatedAt` in all updateJob calls
- `src/controllers/jobs.controller.ts` — passes `voice`, `text`, `updatedAt` when creating jobs
- `src/server.ts` — calls `await initDatabase()` before listening
- `package.json` — added `better-sqlite3` and `@types/better-sqlite3` dependencies

### Removed in-memory state
- `job.service.ts`: removed `const jobs = new Map<string, Job>()`
- `subtitle.service.ts`: removed `const subtitleJobs = new Map<string, SubtitleJobData>()`
