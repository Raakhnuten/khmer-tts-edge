# Phase 8 — Queue Architecture Plan

## 1. Current State Audit

### Job Flow (no queue)
```
POST /api/jobs → createJob()
  ├─ validate request
  ├─ save job as 'pending' to SQLite
  ├─ fire-and-forget processJob()  ← no await, no back-pressure
  └─ respond 201 { id }

processJob() runs concurrently:
  └─ generateAudio() → asyncPool(concurrency=5) → Edge TTS × N chunks
```

### Concurrency Controls
| Layer | Control | Limit |
|-------|---------|-------|
| HTTP jobs | None | Unlimited in-flight `processJob()` calls |
| Chunk synthesis | `asyncPool` | Default 5 concurrent Edge TTS calls per job |
| Retries | Linear backoff in `trySynthesizeChunk` | Default 3 attempts |

### Problem
100 concurrent `POST /api/jobs` → 100 `processJob()` → up to 500 concurrent Edge TTS connections. No throttling, no visibility into job execution order, no recovery on crash for in-flight jobs.

## 2. Redis/BullMQ Evaluation

| Requirement | Redis/BullMQ | SQLite-backed |
|-------------|-------------|---------------|
| Persist queued state | Yes | Yes (existing `jobs` table) |
| Worker processes jobs | Yes | `setInterval`-based polling worker |
| Retries with backoff | Built-in | Custom in worker code |
| Concurrency control | Built-in | In-process semaphore |
| Crash recovery | Delayed (Redis persistence config) | Immediate (SQLite == persistent) |
| Deployment complexity | Needs Redis server + BullMQ | Zero new dependencies |
| Single-instance TCO | Requires separate Redis process | Same process |

**Recommendation: SQLite-backed queue.** No Redis/BullMQ. The service runs on a single instance. The existing `jobs` table already has `status`, `created_at`, and `updated_at` columns — extend it with `queue_attempts` and `scheduled_at` for retry support. A polling worker in `server.ts` picks up queued jobs and processes them with a concurrency semaphore.

## 3. Architecture

```
POST /api/jobs
  ↓
createJob() → saves job with status='queued' → responds { id }
  ↓
[Worker loop — every 1s]
  ↓
Polls jobs WHERE status = 'queued' ORDER BY created_at LIMIT N
  ↓
Picks up to `concurrency` jobs
  ↓
Sets status = 'processing'
  ↓
processJob() per job
  ↓
On success: status = 'completed'
On failure: increment attempts, schedule retry or status = 'failed'
```

### Queue States
```
queued → processing → completed
                   → failed (after retries exhausted)
                   → queued (retry with backoff)
```

### Worker Design
- Single polling loop in `server.ts` (replacing the `cleanup` interval or alongside it)
- Configurable `queuePollIntervalMs` (default 1000ms)
- Configurable `queueConcurrency` (default 3 — jobs, not chunks)
- Uses the existing `asyncPool` internally per job for chunk-level concurrency
- Enforces max in-flight job count via a simple counting semaphore

### Retry
- `attempts` column tracks how many times the job has been tried (default 0)
- `max_attempts` column stores the retry limit (per-job configurable, default 3)
- On failure: `attempts++`, if `attempts < max_attempts`, set `scheduled_at = now + backoff(attempts)` and status back to `queued`
- `last_error` stores the most recent error message
- Backoff formula: `queueRetryBaseDelayMs * Math.pow(2, attempts - 1)` (exponential)
- Worker only picks jobs where `scheduled_at <= now()` or `scheduled_at IS NULL`

### Recovery on Startup
1. Query all jobs WHERE `status = 'processing'`
2. Set them to `status = 'queued'` with `scheduled_at = now()`, increment `attempts`
3. Set `last_error = 'Server restart — job requeued'`
4. Worker picks them up on next poll cycle
5. Existing chunk-level resume via `.session` file still works

## 4. Implementation Plan

### Step 1 — Database schema changes
Add columns to `jobs` table:
```sql
ALTER TABLE jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3;
ALTER TABLE jobs ADD COLUMN scheduled_at TEXT;    -- ISO 8601, nullable
ALTER TABLE jobs ADD COLUMN started_at TEXT;      -- ISO 8601, nullable
ALTER TABLE jobs ADD COLUMN completed_at TEXT;    -- ISO 8601, nullable
ALTER TABLE jobs ADD COLUMN last_error TEXT;      -- nullable
```

Add indexes:
```sql
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_at ON jobs(scheduled_at);
```

### Step 2 — Update types
- Add `queueAttempts`, `scheduledAt`, `queuedAt`, `startedAt` to `Job` interface
- Add `queued` to `Job['status']` union type

### Step 3 — Update job repository
- Add columns to `INSERT` and `UPDATE` queries
- Add `findQueued(limit, now)` and `findProcessing()` queries
- Add `resetProcessingToQueued()` for startup recovery

### Step 4 — Update job service
- Add `queueJob()` — creates job with `status = 'queued'`, `queuedAt = now`
- Add `dequeueJob(id)` — sets `status = 'processing'`, `startedAt = now`
- Add `failJob(id, error)` — handles retry/backoff logic
- Add `requeueProcessingJobs()` — startup recovery

### Step 5 — Create queue worker
New file: `src/services/queue.service.ts`
- `startWorker()` — starts the poll interval
- `stopWorker()` — clears the interval
- `pollQueue()` — fetches queued jobs, schedules processing
- Concurrency semaphore to limit in-flight job count

### Step 6 — Update controller
- `createJob()` now calls `queueJob()` then responds — no direct `processJob()` call
- Worker handles processing asynchronously

### Step 7 — Update server.ts
- Replace the cleanup interval with a single startup sequence:
  1. `initDatabase()`
  2. `cacheService.init()`
  3. `queueService.recover()` — requeues stuck processing jobs
  4. `queueService.startWorker()`
- Shutdown: `queueService.stopWorker()` before `server.close()`

### Step 8 — Monitoring endpoint
- `GET /api/queue/stats` returns:
  ```json
  {
    "queued": 0,
    "processing": 0,
    "completed": 0,
    "failed": 0,
    "retries": 0
  }
  ```

### Step 9 — Config additions
```typescript
QUEUE_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
MAX_QUEUE_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
QUEUE_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(5000),
```

### Step 10 — Tests
- Test queue insertion and status transitions
- Test retry with backoff scheduling
- Test recovery (simulate interrupted job)
- Test concurrency limit enforcement
- All existing 35 tests must pass

## 5. Files to Create / Modify

| Action | File |
|--------|------|
| Modify | `src/database/index.ts` — add columns + indexes |
| Modify | `src/types/index.ts` — add queue fields |
| Modify | `src/repositories/job.repository.ts` — add queue queries |
| Modify | `src/services/job.service.ts` — add queue/service methods |
| Modify | `src/controllers/jobs.controller.ts` — use queue |
| Create | `src/services/queue.service.ts` — worker + stats |
| Create | `src/controllers/queue.controller.ts` — stats endpoint |
| Create | `src/routes/queue.routes.ts` — stats route |
| Modify | `src/app.ts` — register queue routes |
| Modify | `src/server.ts` — worker lifecycle |
| Modify | `src/config/index.ts` — queue config vars |

## 6. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Worker polls every 1s — trivial CPU cost | Add jitter, keep query simple (indexed) |
| Worker dies silently | Error handling wraps entire poll cycle; logs failures |
| Concurrency > 1 causes SQLite contention | WAL mode already enabled; per-job writes are infrequent |
| Retry storms | Exponential backoff; `scheduled_at` gate prevents immediate retry |
| Breaking API change | `POST /api/jobs` response shape unchanged (still `{ id }`). `GET /api/jobs/:id` unchanged. |

## 7. Verification

```
npx tsc --noEmit         # TypeScript strict mode
npx tsx tests/subtitle.test.ts   # 35 existing tests pass
```
