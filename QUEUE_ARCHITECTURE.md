# Queue Architecture

## Overview

The queue system is a SQLite-backed, in-process job queue for the Khmer TTS service. It replaces the previous fire-and-forget `processJob()` call with a controlled polling worker that limits concurrency, supports retries with exponential backoff, and survives server restarts.

## Design Decision: SQLite over Redis/BullMQ

| Criteria | SQLite-backed | Redis/BullMQ |
|----------|---------------|--------------|
| Single-instance suitability | Native fit | Overkill |
| New dependencies | Zero | Redis server + `bullmq` npm package |
| Persistence | Built-in (WAL mode) | Requires AOF/RDB config |
| Crash recovery | Immediate (same DB) | Delayed (reconnect + replay) |
| Concurrency control | In-process semaphore | Built-in worker sandbox |
| Operational complexity | None | Must manage Redis process |

**Chosen: SQLite-backed.** The service runs on a single instance. The existing `better-sqlite3` database already has the `jobs` table. Adding queue columns avoids any new infrastructure.

## Job States

```
                ┌──────────┐
                │  queued   │
                └────┬─────┘
                     │ worker picks up
                     ▼
                ┌──────────┐
                │processing│
                └────┬─────┘
                     │
           ┌─────────┴──────────┐
           ▼                    ▼
     ┌──────────┐         ┌──────────┐
     │completed │         │  failed   │
     └──────────┘         └──────────┘
                                │
                     attempts < max_attempts
                                │
                    ┌───────────┴──────────┐
                    ▼                      ▼
              ┌──────────┐           ┌──────────┐
              │  queued   │           │  failed   │
              │(backoff)  │           │(exhausted)│
              └──────────┘           └──────────┘
```

## Database Schema

```sql
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

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_at ON jobs(scheduled_at);
```

## Worker Loop

```typescript
setInterval(async () => {
  if (inFlight >= concurrency) return;

  const available = concurrency - inFlight;
  const jobs = jobRepository.findQueued(available, now);

  inFlight += jobs.length;

  await Promise.allSettled(
    jobs.map(async (job) => {
      jobRepository.update(job.id, { status: 'processing', startedAt: now });
      await processJob(job.id, job.text, job.voice, jobDir);
      await handleJobCompletion(job.id); // completed/failed/retry
    })
  );

  inFlight -= jobs.length;
}, pollIntervalMs);
```

## Retry Logic

```typescript
function computeBackoff(attempt: number): number {
  return queueRetryBaseDelayMs * Math.pow(2, attempt - 1);
}
// attempt 1 → 5s
// attempt 2 → 10s
// attempt 3 → 20s
```

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `QUEUE_POLL_INTERVAL_MS` | 1000 | How often to poll for queued jobs |
| `QUEUE_CONCURRENCY` | 3 | Max concurrent jobs being processed |
| `MAX_QUEUE_RETRIES` | 3 | Max retry attempts per job |
| `QUEUE_RETRY_BASE_DELAY_MS` | 5000 | Base exponential backoff delay |

## API

```
GET /api/queue/stats
```

Response:
```json
{
  "queued": 0,
  "processing": 0,
  "completed": 0,
  "failed": 0,
  "retries": 0
}
```

## Layering

```
Controller (jobs.controller.ts)
  → Service (job.service.ts)
    → Repository (job.repository.ts)
      → SQLite

Worker (queue.service.ts)
  → Repository (job.repository.ts)
    → SQLite
  → TTS Service (tts.service.ts)
    → Cache Service (cache.service.ts)
    → Generate (generate.ts)
```

The queue does not bypass any existing layer.
