# Recovery Strategy

## Why Recovery Is Needed

The queue worker runs in-process. If the server crashes or is killed:

1. Jobs with `status = 'processing'` will never complete
2. The worker loop disappears — no more polls
3. On restart, those jobs would remain stuck in 'processing' forever

## Recovery Mechanism

On every startup, `queueService.recover()` is called before the worker starts:

```typescript
async recover(): Promise<void> {
  const stuck = jobRepository.findProcessing();
  if (stuck.length > 0) {
    logger.warn({ count: stuck.length }, `Recovering ${stuck.length} stuck job(s)`);
    jobRepository.resetProcessingToQueued();
  }
}
```

The SQL executed:

```sql
UPDATE jobs
SET status = 'queued',
    last_error = 'Server restart - job requeued',
    updated_at = '<now>',
    scheduled_at = '<now>'
WHERE status = 'processing'
```

### What happens next

1. Requeued jobs have `scheduled_at = now` (immediately eligible)
2. The worker picks them up in the next poll cycle (within 1s)
3. Existing chunk-level resume via `.session` file still works — `generateAudio()` checks for partial chunks and skips completed ones
4. The job's `attempts` counter is preserved — the retry wears the previous attempt

## Recovery Triggers

| Event | Recovery Action |
|-------|----------------|
| Server crash | Automatic on next startup |
| `SIGKILL` | Automatic on next startup |
| `SIGTERM` with timeout (10s forced exit) | Automatic on next startup |
| Worker poll error (transient DB failure) | Caught individually; retry logic applies to affected jobs |
| Worker poll error (persistent DB failure) | Retry at next poll cycle (1s later) |

## What Is NOT Recovered

- **In-flight chunk generation**: Partially synthesized chunks remain in the job directory. The `.session` file tracks progress. On retry, `generateAudio()` identifies missing chunks and regenerates only those.
- **Cache writes in progress**: If the server crashes mid-cache-write, the incomplete `.mp3` file is orphaned. It will be cleaned up by the periodic cache cleaner (24h TTL).
- **HTTP responses already sent**: `POST /api/jobs` responds `{ id }` before the worker processes the job. If the server crashes after the response but before processing begins, the job is queued and will be picked up on restart.

## Retry Backoff

When a job fails and is eligible for retry:

```
Attempt 1: scheduled_at = now + 5s
Attempt 2: scheduled_at = now + 10s
Attempt 3: scheduled_at = now + 20s
Attempt 4 (if max_attempts > 3): scheduled_at = now + 40s
```

The `scheduled_at` column gates re-queuing. The worker's `findQueued` query filters:

```sql
WHERE status = 'queued'
AND (scheduled_at IS NULL OR scheduled_at <= ?)
```

This prevents retry storms — a job cannot be re-picked until its backoff period expires.

## Dead Letter

After `max_attempts` failures, the job is left in `status = 'failed'` with `last_error` set to the most recent error message. No automatic re-queue occurs. The job remains in the database until cleaned up by the periodic cleanup (1 hour retention window via `cleanupJobs()`).

## Testing Recovery

To verify recovery behavior programmatically:

1. Insert a job with `status = 'processing'` directly via SQLite
2. Call `queueService.recover()`
3. Verify the job's status changed to `'queued'`
4. Verify `last_error` contains `'Server restart - job requeued'`
5. Start the worker and verify the job is picked up
