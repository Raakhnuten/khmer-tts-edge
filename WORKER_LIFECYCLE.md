# Worker Lifecycle

## Startup

1. `initDatabase()` — opens SQLite, creates tables if needed
2. `cacheService.init()` — creates cache directory
3. `queueService.recover()` — requeues any jobs stuck in 'processing'
4. `queueService.start()` — begins the poll interval

```typescript
// server.ts
await initDatabase(config.databasePath);
await cacheService.init();
await queueService.recover();
queueService.start();
```

## Poll Cycle

The worker runs in a `setInterval` every `config.queuePollIntervalMs` (default 1s):

```
pollQueue()
  │
  ├─ CHECK: inFlight >= concurrency? → return (skip this cycle)
  │
  ├─ FETCH: findQueued(available, now)
  │         SELECT * FROM jobs
  │         WHERE status = 'queued'
  │         AND (scheduled_at IS NULL OR scheduled_at <= now)
  │         ORDER BY created_at ASC
  │         LIMIT available
  │
  ├─ IF empty → return
  │
  └─ PROCESS: for each job (up to concurrency):
       │
       ├─ SET status = 'processing', startedAt = now
       │
       ├─ CALL processJob(id, text, voice, jobDir)
       │    │
       │    ├─ Cache check → hit? → copy cached file, set completed → return
       │    ├─ generateAudio() with chunk-level asyncPool
       │    ├─ Save to cache
       │    └─ set status = 'completed' or 'failed'
       │
       └─ CALL handleJobCompletion(id)
            │
            ├─ status = 'completed' → set completedAt → log
            │
            └─ status = 'failed'
                 │
                 ├─ attempts < max_attempts
                 │    → set status = 'queued'
                 │      scheduledAt = now + backoff(attempts)
                 │      lastError = error message
                 │      log retry scheduled
                 │
                 └─ attempts >= max_attempts
                      → set status = 'failed'
                        lastError = error message
                        log retry exhausted
```

## Job Processing Lifecycle

```
Time     Event                        Status      DB Fields Set
────     ─────                        ──────      ──────────────
T0       POST /api/jobs               queued      created_at
T1       Worker picks up              processing  started_at
T2       Cache hit (fast path)        completed   completed_at
                    OR
T2       Chunk generation starts      processing  progress updates
T3       Chunk generation complete    processing  (continuing)
T4       Merge via FFmpeg             processing  (continuing)
T5       Cache save                   processing  (continuing)
T6       Done                         completed   completed_at
                    OR
T2       Chunk fails (retries         failed      last_error
         exhausted)
T3       Queue schedules retry        queued      scheduled_at (T3 + backoff)
T4       Worker picks up again        processing  started_at
...      ...                          ...         ...
```

## Concurrency

- `config.queueConcurrency` (default 3) limits how many jobs are processed simultaneously
- The `inFlight` counter tracks active jobs
- If `inFlight >= concurrency`, the poll cycle skips fetching new jobs
- Each job internally uses `asyncPool` with `config.ttsConcurrency` (default 5) for chunk-level parallelism
- Total potential Edge TTS connections: `queueConcurrency × ttsConcurrency` (default 15)

## Shutdown

```
SIGTERM / SIGINT
  │
  ├─ queueService.stop() — clears setInterval
  ├─ server.close() — stops accepting HTTP requests
  │    └─ Pending requests drain: no new poll cycles
  ├─ closeDatabase() — checkpoints WAL, closes SQLite
  └─ process.exit(0)
```

In-flight jobs are NOT waited on during shutdown. On next startup, `recover()` will requeue them. This is intentional — waiting for TTS synthesis (potentially minutes) would delay shutdown.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `processJob` rejects | Caught in worker, triggers retry logic |
| Individual chunk fails | `processJob` sets status to 'failed' internally |
| Cache write fails | `processJob` catches, sets status to 'failed' |
| Database write fails | Propagates up, caught by worker's try/catch |
| Worker poll throws | Caught by errorLogger wrapper (but promise.allSettled prevents worker crashes) |
