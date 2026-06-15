# Phase 8 — Queue System — Complete

## Goal

Replace the fire-and-forget job processing with a production-grade SQLite-backed queue that separates HTTP request handling from TTS processing.

## Changes Made

### Database

**New columns on `jobs` table:**

| Column | Type | Purpose |
|--------|------|---------|
| `attempts` | INTEGER (0) | Current retry attempt count |
| `max_attempts` | INTEGER (3) | Maximum retry attempts |
| `scheduled_at` | TEXT (nullable) | When this job is eligible for processing |
| `started_at` | TEXT (nullable) | When processing started |
| `completed_at` | TEXT (nullable) | When processing completed |
| `last_error` | TEXT (nullable) | Most recent error message |

**New indexes:**
- `idx_jobs_status ON jobs(status)` — fast status-based queries
- `idx_jobs_scheduled_at ON jobs(scheduled_at)` — fast scheduled-job polling

### Types (`src/types/index.ts`)

- Status union now: `'queued' | 'processing' | 'completed' | 'failed'`
- Added `attempts`, `maxAttempts`, `scheduledAt`, `startedAt`, `completedAt`, `lastError`

### Repository (`src/repositories/job.repository.ts`)

New query methods:
| Method | SQL |
|--------|-----|
| `findQueued(limit, now)` | `SELECT * FROM jobs WHERE status='queued' AND (scheduled_at IS NULL OR scheduled_at <= ?) ORDER BY created_at LIMIT ?` |
| `findProcessing()` | `SELECT * FROM jobs WHERE status='processing'` |
| `countByStatus()` | `SELECT status, COUNT(*) FROM jobs GROUP BY status` |
| `totalAttempts()` | `SELECT COALESCE(SUM(attempts), 0) FROM jobs` |
| `resetProcessingToQueued()` | `UPDATE jobs SET status='queued', last_error='...' WHERE status='processing'` |

`save()` changed from `INSERT INTO` to `INSERT OR REPLACE INTO` to safely update existing rows.

### Job Service (`src/services/job.service.ts`)

- `queueJob(job)` — saves job with `status='queued'`, logs event
- `getQueueStats()` — returns `{ queued, processing, completed, failed, retries }`
- `setJob()` removed (replaced by `queueJob`)

### Queue Service (`src/services/queue.service.ts`) — NEW

The queue worker runs as an in-process polling loop:

```
start() → setInterval(pollQueue, queuePollIntervalMs)
            ↓
pollQueue() → if inFlight < queueConcurrency
                ↓
              findQueued(available, now)
                ↓
              for each job:
                update status = 'processing', startedAt = now
                await processJob(...)
                handleJobCompletion(...)
                  ├─ completed → set completedAt
                  └─ failed → retry or final-failure
```

- `config.queueConcurrency` (default 3) limits concurrent in-flight jobs
- `config.queuePollIntervalMs` (default 1000ms) controls poll frequency
- `config.maxQueueRetries` (default 3) controls retry limit
- `config.queueRetryBaseDelayMs` (default 5000ms) with exponential backoff

### Controller (`src/controllers/jobs.controller.ts`)

- `createJob()` now sets `status: 'queued'` and calls `queueJob()`
- No longer directly imports or calls `processJob()`
- API contract unchanged: still returns `{ id }` with HTTP 201

### Server (`src/server.ts`)

Startup sequence:
1. `initDatabase()`
2. `cacheService.init()`
3. `queueService.recover()` — requeues any jobs stuck in 'processing'
4. `queueService.start()` — begins polling

Shutdown: `queueService.stop()` called before `server.close()`

### Monitoring

```
GET /api/queue/stats
→ { queued: 0, processing: 0, completed: 0, failed: 0, retries: 0 }
```

## Architecture

```
POST /api/jobs
  ↓
createJob() → saves status='queued' → responds { id }
  ↓
[Worker poll every 1s]
  ↓
findQueued() → up to queueConcurrency jobs
  ↓
status = 'processing' → processJob() → status = 'completed' / 'failed'
                                            ↓
                              attempts < max_attempts → retry (backoff)
                              attempts >= max_attempts → failed
```

## Recovery on Startup

- Any jobs with `status='processing'` are reset to `status='queued'`
- `last_error` set to `'Server restart - job requeued'`
- `scheduled_at` set to now (immediately eligible)
- Worker picks them up on next poll cycle

## Verification

- `npx tsc --noEmit`: clean (0 errors)
- `npx tsx tests/subtitle.test.ts`: 35/35 passed
