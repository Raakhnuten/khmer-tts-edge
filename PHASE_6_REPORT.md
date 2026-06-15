# Phase 6: SQLite Persistence — Complete

## Goal
Replace in-memory `Map`-based job/subtitle storage with SQLite, introducing a proper repository layer that persists data across restarts.

## Tables Created

### `jobs`
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `status` | TEXT | `pending`, `processing`, `completed`, `failed` |
| `voice` | TEXT | TTS voice name |
| `text_content` | TEXT | Full input text |
| `text_hash` | TEXT | Hash for resume support (nullable) |
| `progress` | INTEGER | 0–100 |
| `current_chunk` | INTEGER | 0-based |
| `total_chunks` | INTEGER | Total chunk count |
| `error` | TEXT | Error message if failed (nullable) |
| `output_path` | TEXT | Path to final MP3 (nullable) |
| `created_at` | TEXT | ISO 8601 |
| `updated_at` | TEXT | ISO 8601 |

### `subtitle_projects`
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `data` | TEXT | Full `SubtitleJobData` as JSON (segments, status, timestamps) |
| `created_at` | TEXT | ISO 8601 |

## Repository Design

```
src/repositories/
├── job.repository.ts        # JobRepository — findById, save, update, cleanup
└── subtitle.repository.ts   # SubtitleRepository — findById, save, findOldIds, cleanup
```

Both repositories follow the same pattern:
- Import `getDb()` from `src/database/index.ts` (lazy-initialized singleton)
- Use prepared statements for all queries
- Return domain types (not raw rows) to services
- Serialize/deserialize Date ↔ ISO string automatically

## Services Migrated

| Service | Before | After |
|---------|--------|-------|
| `job.service.ts` | `Map<string, Job>` in-memory | Delegates all CRUD to `jobRepository` |
| `subtitle.service.ts` | `Map<string, SubtitleJobData>` in-memory | Delegates all CRUD to `subtitleRepository` |

### How services use repositories

**job.service.ts** — every function now delegates:
- `getJob(id)` → `jobRepository.findById(id)`
- `setJob(id, job)` → `jobRepository.save(job)`
- `updateJob(id, updates)` → reads current, merges, calls `jobRepository.save(merged)`
- `cleanupJobs(maxAgeMs)` → `jobRepository.cleanup(maxAgeMs)`

**subtitle.service.ts** — same pattern:
- `getSubtitleJob(id)` → `subtitleRepository.findById(id)`
- `createSubtitleJobInStore(...)` → `subtitleRepository.save(job)`
- `processSubtitleSegments(...)` → calls `subtitleRepository.save(job)` after each segment mutation
- `cleanupSubtitleJobs(maxAgeMs, dir)` → `subtitleRepository.findOldIds(maxAgeMs)` then deletes files, then `subtitleRepository.cleanup(maxAgeMs)`

## Remaining In-Memory State

✅ Jobs — fully migrated to SQLite (zero in-memory state)
✅ Subtitle projects — fully migrated to SQLite (zero in-memory state)

No remaining in-memory state for persistence. The `cleanup` functions in both repositories delete rows older than the retention window.

## Data Flow Diagrams

### Job Lifecycle
```
POST /api/jobs  →  createJob (controller)
                     │
                     ▼
              JobRepository.save(job)
                     │
                     ▼
              processJob (tts.service)
                     │
                     ├─ updateJob({ status: 'processing' })
                     │     → JobRepository.save(merged)
                     │
                     ├─ [per chunk] updateJob({ progress, ... })
                     │     → JobRepository.save(merged)
                     │
                     └─ updateJob({ status: 'completed'|'failed' })
                           → JobRepository.save(merged)

GET /api/jobs/:id  →  getJobHandler (controller)
                        │
                        ▼
                 JobRepository.findById(id)  →  response JSON
```

### Subtitle Lifecycle
```
POST /api/subtitles/jobs  →  createSubtitleJobHandler
                              │
                              ▼
                       subtitleRepository.save(job)
                       saveMetadata (disk)

POST /api/subtitles/segments/:id/generate  →  generateSegments
                                              │
                                              ▼
                                       processSubtitleSegments
                                              │
                                              ├─ [per segment]
                                              │     subtitleRepository.save(job)
                                              │     saveMetadata (disk)
                                              │
                                              └─ subtitleRepository.save(final)
                                                  saveMetadata (disk)

POST /api/subtitles/export  →  exportAudio
                                │
                                ▼
                         exportSubtitleFinal (export.service)
                                │
                                ▼
                         exportFinalAudio (subtitle.ts)
                         logger.info (logged, not stored)
```

### Cleanup (periodic, every 5 min)
```
server.ts setInterval
     │
     ├─ cleanupSubtitleJobs(maxAgeMs, dir)
     │     ├─ subtitleRepository.findOldIds(maxAgeMs)  →  [ids]
     │     ├─ [for each id] unlink(final.mp3)
     │     └─ subtitleRepository.cleanup(maxAgeMs)
     │
     └─ cleanupJobs(maxAgeMs)
           └─ jobRepository.cleanup(maxAgeMs)
```

## Database Initialization

On startup, `server.ts` calls:
```ts
await initDatabase(config.databasePath);
```

This:
1. Creates the `output/` directory (or custom path)
2. Opens/creates the SQLite file (`output/khmer-tts.db` by default)
3. Enables WAL mode for concurrent read performance
4. Creates `jobs` and `subtitle_projects` tables via `CREATE TABLE IF NOT EXISTS`

## Config

New env var: `DATABASE_PATH` (default: `output/khmer-tts.db`)

## Verification
- `npx tsc --noEmit` — passes
- `npx tsx tests/subtitle.test.ts` — all 35 tests pass
