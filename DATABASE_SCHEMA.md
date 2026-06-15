# Database Schema

## Database

- **Engine**: SQLite 3 (via `better-sqlite3`)
- **File location**: `output/khmer-tts.db` (configurable via `DATABASE_PATH` env var)
- **Journal mode**: WAL (Write-Ahead Logging) for concurrent read performance
- **Foreign keys**: Enabled

## Tables

### `jobs`

Stores TTS generation jobs created via `POST /api/jobs`.

```sql
CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,       -- UUID
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | completed | failed
  voice         TEXT NOT NULL,           -- TTS voice name (e.g. km-KH-PisethNeural)
  text_content  TEXT NOT NULL,           -- Full input text (for display and dedup)
  text_hash     TEXT,                    -- Hash for resume support (nullable)
  progress      INTEGER NOT NULL DEFAULT 0,   -- 0–100
  current_chunk INTEGER NOT NULL DEFAULT 0,   -- 0-based chunk index
  total_chunks  INTEGER NOT NULL DEFAULT 0,   -- Total number of chunks
  error         TEXT,                    -- Error message if status = 'failed' (nullable)
  output_path   TEXT,                    -- Path to the final merged MP3 (nullable)
  created_at    TEXT NOT NULL,           -- ISO 8601 timestamp
  updated_at    TEXT NOT NULL            -- ISO 8601 timestamp
);
```

**Indexes**: Primary key only (lookups are by `id`).

**Cleanup**: Rows older than 1 hour are deleted periodically (every 5 minutes) by `cleanupJobs()`.

### `subtitle_projects`

Stores subtitle projects created via `POST /api/subtitles/jobs`.

```sql
CREATE TABLE IF NOT EXISTS subtitle_projects (
  id          TEXT PRIMARY KEY,       -- UUID
  data        TEXT NOT NULL,           -- Full SubtitleJobData serialized as JSON
  created_at  TEXT NOT NULL            -- ISO 8601 timestamp
);
```

**`data` column format** (JSON):
```json
{
  "id": "uuid",
  "status": "pending | processing | completed | failed",
  "segments": [
    {
      "index": 0,
      "startTime": 0,
      "endTime": 5000,
      "text": "...",
      "voice": "km-KH-PisethNeural",
      "status": "pending | generating | completed | failed",
      "generatedDuration": null,
      "speedRatio": null,
      "error": null
    }
  ],
  "createdAt": "2026-06-12T12:00:00.000Z"
}
```

**Indexes**: Primary key only.

**Cleanup**: Rows older than 1 hour are deleted periodically (every 5 minutes) by `cleanupSubtitleJobs()`. The corresponding `final.mp3` on disk is also removed.

## Migration Notes

This schema is the **initial version** (v1). Since `CREATE TABLE IF NOT EXISTS` is used, the schema bootstrap is idempotent. Future migrations should be applied as sequential SQL files in a `migrations/` directory with a `_migrations` tracking table.

## Connection Details

```ts
import { getDb } from './database/index.js';

const db = getDb();

// Prepared statement (recommended)
const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);

// Direct exec for DDL
db.exec('CREATE TABLE IF NOT EXISTS ...');
```
