# Phase 6.5: Review Findings Implementation — Complete

## Fixes Applied

### 1. Fix text_hash persistence

**File**: `src/repositories/job.repository.ts`

**Problem**: `save()` hardcoded `textHash: null`, so the `text_hash` column was always NULL despite the schema defining it.

**Fix**: Extracted the existing `simpleHash()` function from `generate.ts` into a shared utility `computeTextHash()` in `src/utils/helpers.ts`, then called it in `job.repository.ts`'s `save()` method.

```diff
- textHash: null,
+ textHash: computeTextHash(job.text),
```

`generate.ts` now imports `computeTextHash` from helpers instead of defining its own local version.

**Hash algorithm**: Simple 32-bit integer hash → base36 string. Deterministic for same input text. Matches the hash used for resume support in `generate.ts`.

### 2. Add created_at indexes

**File**: `src/database/index.ts`

**Problem**: Cleanup queries (`DELETE FROM jobs WHERE created_at < ?`) performed full table scans every 5 minutes.

**Fix**: Added two indexes after table creation:

```sql
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_subtitle_projects_created_at ON subtitle_projects(created_at);
```

This converts the periodic cleanup queries from O(n) full scans to O(log n) range scans.

### 3. Add graceful shutdown handlers

**File**: `src/server.ts`

**Problem**: `closeDatabase()` existed but was never called. Server process could be killed without cleanly closing SQLite, risking WAL file growth or data loss.

**Fix**: Added a `shutdown()` function that:
1. Logs the shutdown signal
2. Closes the HTTP server (stops accepting new requests)
3. Calls `closeDatabase()` to cleanly close SQLite (checkpoints WAL)
4. Exits with code 0 on success
5. Falls back to forced exit after 10s timeout (handles hung connections)

```ts
function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutting down...');
  server.close(() => {
    closeDatabase();
    logger.info('Server stopped');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### 4. Add schema version field to subtitle projects

**Files**: `src/subtitle.ts`, `src/services/subtitle.service.ts`, `src/repositories/subtitle.repository.ts`

**Problem**: `subtitle_projects.data` stores `SubtitleJobData` as JSON with no version indicator. Future schema changes would be untracked, risking runtime errors when old JSON blobs lack new fields.

**Fix**:
- `SubtitleJobData` interface gained optional `version?: number` field
- `createSubtitleJobInStore()` sets `version: 1` on new records
- `subtitleRepository.findById()` defaults `parsed.version = 1` for legacy records that lack the field

```diff
export interface SubtitleJobData {
  id: string;
  status: ...;
  segments: SubtitleSegmentData[];
  createdAt: string;
+ version?: number;
}
```

## Files Changed

| File | Change |
|------|--------|
| `src/utils/helpers.ts` | Added `computeTextHash()` export |
| `src/generate.ts` | Imports `computeTextHash` from helpers; removed local `simpleHash()` |
| `src/repositories/job.repository.ts` | Imports `computeTextHash`; `save()` writes `textHash` instead of `null` |
| `src/database/index.ts` | Added `CREATE INDEX IF NOT EXISTS` for `jobs(created_at)` and `subtitle_projects(created_at)` |
| `src/server.ts` | Added `closeDatabase` import; added `shutdown()` with SIGTERM/SIGINT handlers |
| `src/subtitle.ts` | `SubtitleJobData` gains optional `version` field |
| `src/services/subtitle.service.ts` | New subtitle jobs set `version: 1` |
| `src/repositories/subtitle.repository.ts` | `findById()` defaults `version` to 1 for legacy records |

## API Contract Preservation

All changes are internal (no new endpoints, no modified response shapes):
- `text_hash` is stored but never exposed in API responses
- `created_at` indexes are transparent to queries
- Shutdown handlers only affect process lifecycle, not request handling
- `version` is stored in JSON and defaults to 1 for legacy data; responses include it as an undocumented field

## Verification
- `npx tsc --noEmit` — passes
- `npx tsx tests/subtitle.test.ts` — all 35 tests pass
