# Phase 6 Review

## 1. Storage operations go through repositories

**Result: PASS**

All persistence operations across both domains flow exclusively through the two repository modules:

| Domain | Repository | Methods | Used By |
|--------|-----------|---------|---------|
| Jobs | `job.repository.ts` | `findById`, `save`, `update`, `cleanup` | `job.service.ts` (all 4 exported functions delegate to repo) |
| Subtitles | `subtitle.repository.ts` | `findById`, `save`, `findOldIds`, `cleanup` | `subtitle.service.ts` (all data access functions delegate to repo) |

Every call path:
- `jobs.controller.ts` → `setJob()` → `jobRepository.save()`
- `jobs.controller.ts` → `getJob()` → `jobRepository.findById()`
- `tts.service.ts` → `updateJob()` → `job.service.ts` → reads via `findById`, merges, saves via `save()`
- `subtitle.controller.ts` → `getSubtitleJob()` → `subtitleRepository.findById()`
- `subtitle.controller.ts` → `createSubtitleJobInStore()` → `subtitleRepository.save()`
- `subtitle.service.ts` → `processSubtitleSegments()` → calls `subtitleRepository.save()` after each mutation

## 2. No service accesses SQLite directly

**Result: PASS**

Only two files import `better-sqlite3` or `getDb`:

| File | What it imports | Role |
|------|----------------|------|
| `src/database/index.ts` | `better-sqlite3` | Singleton creation, schema bootstrap |
| `src/repositories/job.repository.ts` | `getDb()` from database module | Data access (repository) |
| `src/repositories/subtitle.repository.ts` | `getDb()` from database module | Data access (repository) |

All eight service/controller files (`job.service.ts`, `subtitle.service.ts`, `tts.service.ts`, `export.service.ts`, `jobs.controller.ts`, `subtitle.controller.ts`, `server.ts`) import repositories or service functions — never `getDb()` or `better-sqlite3` directly.

## 3. No remaining in-memory Maps

**Result: PASS**

`grep` for `new Map` and `Map<` across `src/` returns zero matches. Both previously in-memory stores are fully SQLite-backed:

- ~~`job.service.ts` — `const jobs = new Map<string, Job>()`~~ → **removed**
- ~~`subtitle.service.ts` — `const subtitleJobs = new Map<string, SubtitleJobData>()`~~ → **removed**

## 4. Schema design review

### `jobs` table — Good
- `id TEXT PRIMARY KEY` — UUID, appropriate for distributed/stateless writes.
- Using ISO 8601 strings for timestamps — acceptable for SQLite (no native datetime type). Collation is lexicographic, which works for ISO format comparisons.
- `text_content` stores the full input text. This is redundant with `text_hash` for dedup purposes but enables UI display of previous jobs without hashing.
- `text_hash` is currently **always stored as `null`** in `save()` → see issue below.

**. `. The `files` table from the roadmap is not implemented. This is a reasonable scoping decision — the current architecture only tracks one output file per job, and the roadmap note about it was dropped from the requirements for Phase 6.

**Minor concern**: The `update()` method in `job.repository.ts` uses a dynamic SQL builder. It always pushes `updated_at = @now` (line 72), making the early-return check `if (sets.length > 1)` always true even if only `updatedAt` was in the updates object. This is harmless (never a no-op) but slightly misleading.

### `subtitle_projects` table — Pragmatic
- JSON blob in `data` column is pragmatic: segments have a complex nested structure (array of objects with nullable fields), and mapping that to normalized tables would add complexity with no query benefit. The `save()` method uses `ON CONFLICT(id) DO UPDATE` for upsert, which is correct.
- `created_at` is duplicated both in the row and inside the JSON `data`. The row-level column enables SQL-level cleanup without parsing JSON.

## 5. Indexes and query performance

### Current indexes
- **Primary keys only** on both `jobs(id)` and `subtitle_projects(id)`.

### Query patterns

| Query | Frequency | Index used | Cost |
|-------|-----------|------------|------|
| `SELECT * FROM jobs WHERE id = ?` | Per request | PK lookup | O(log n) — optimal |
| `SELECT * FROM subtitle_projects WHERE id = ?` | Per request | PK lookup | O(log n) — optimal |
| `DELETE FROM jobs WHERE created_at < ?` | Every 5 min | None (full scan) | O(n) over expired rows |
| `DELETE FROM subtitle_projects WHERE created_at < ?` | Every 5 min | None (full scan) | O(n) over expired rows |
| `SELECT id FROM subtitle_projects WHERE created_at < ?` | Every 5 min | None (full scan) | O(n) over expired rows |

### Recommendations for production scale

1. **Add index on `jobs(created_at)`** — the cleanup query scans the full table. With thousands of jobs, this becomes a full table scan. An index would make it a range scan.

   ```sql
   CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
   ```

2. **Add index on `subtitle_projects(created_at)`** — same reasoning for subtitle cleanup queries.

   ```sql
   CREATE INDEX IF NOT EXISTS idx_subtitle_projects_created_at ON subtitle_projects(created_at);
   ```

3. **Add index on `jobs(status)`** if listing/filtering by status is ever needed (e.g., a dashboard showing running jobs). Not needed for current query patterns.

4. **WAL mode is enabled** — good for concurrent reads during background chunk processing.

## 6. Future migration risks

### Risk 1: `text_hash` always null
The `save()` method in `job.repository.ts` (line 50) hardcodes `textHash: null`. The roadmap schema shows `text_hash` as a column, and `generate.ts` already computes a `simpleHash()` for resume support. If a future phase needs hash-based dedup (Phase 7 audio cache), the column will contain only nulls for existing records. **Mitigation**: Compute and store the hash when the `Job` object includes a `textHash` field, or add a migration to backfill.

### Risk 2: JSON blob schema coupling
`subtitle_projects.data` stores the full `SubtitleJobData` interface. If that interface changes (e.g., new fields added to `SubtitleSegmentData`), old JSON blobs will lack those fields. This is acceptable if the code uses optional chaining or default values, but could cause runtime errors if new code expects fields that old JSON doesn't have. **Mitigation**: Add a `version` field inside the JSON envelope for future migration logic, or use zod to validate/transform on read.

### Risk 3: No connection lifecycle management
`getDb()` returns a singleton. The `closeDatabase()` function exists but is never called on shutdown (`SIGTERM`/`SIGINT`). In normal operation, SQLite handles this gracefully (WAL checkpoints on close), but for containerized deployments the shutdown hook should call `closeDatabase()` to prevent WAL file growth. **Mitigation**: Add `process.on('SIGTERM', closeDatabase)` and `process.on('SIGINT', closeDatabase)` in `server.ts`.

### Risk 4: Timestamp string comparison
ISO 8601 strings sort lexicographically, which works for `created_at < ?` comparisons. However, if the server's locale or timezone offset changes (e.g., daylight saving), newly inserted timestamps could be incorrectly compared with old ones. In practice, UTC ISO strings are always comparable, so this is low risk.

### Risk 5: SQL injection in dynamic `update()`
The `job.repository.ts` `update()` method builds SQL dynamically: `UPDATE jobs SET ${sets.join(', ')}`. The column names are hardcoded (not user-supplied), and values use parameterized bindings (`@status`, `@progress`, etc.). This is **not** an injection vector because the column names are controlled entirely by the code.

## Summary

| Check | Status |
|-------|--------|
| All storage through repositories | ✅ Pass |
| No direct SQLite access from services | ✅ Pass |
| No in-memory Maps remain | ✅ Pass |
| Schema supports current requirements | ✅ Pass |
| Primary key indexes adequate | ✅ Pass |
| Cleanup queries would benefit from created_at indexes | ⚠️ Suggestion |
| `text_hash` hardcoded null in save() | ⚠️ Fix needed before Phase 7 |
| No shutdown hook for clean DB close | ⚠️ Minor |
| JSON blob migration strategy needed | ⚠️ Pre-plan |
| TypeScript strict mode passes | ✅ Confirmed |
| All 35 tests pass | ✅ Confirmed |
