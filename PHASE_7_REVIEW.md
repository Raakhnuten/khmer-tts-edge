# Phase 7: Audio Cache — Review

## 1. Cache key includes every audio-affecting parameter

**Status: FAIL**

The cache key is `computeTextHash(text + voice)` (cache.service.ts:15).

The roadmap specifies `hash(text + voice + speed)` as the cache key. The current key **omits `speed`**, which is an audio-affecting parameter that directly changes the output audio (FFmpeg `atempo` filter in `subtitle.ts`).

**Mitigating factor**: `speed` is **not currently accepted** by the API. The Zod schema for `POST /api/generate` only validates `text` and `voice`:

```ts
// validators/generate.schema.ts
export const generateBodySchema = z.object({
  text: textRequired,
  voice: voiceRequired,
});
```

And `POST /api/jobs` has the same schema. Neither endpoint passes a `speed` parameter to the TTS engine. The `speed` concept only exists in the subtitle segment system (`generateSegmentAudio` in `subtitle.ts`), which adjusts audio playback speed to match subtitle timing — but that system is **not cached**.

**Risk**: If the API is ever extended with a `speed` parameter (as the roadmap envisions), the cache will silently return wrong-speed audio. The cache key must be updated at that time.

**Recommendation**: Add `speed` to the cache key now (defaulting to `1.0` when absent) so the key contract is correct for the future. Since no endpoint currently passes `speed`, this is a safe additive change.

---

## 2. Cache remains correct when speed changes

**Status: PASS** (within current scope)

Since `speed` is not an API parameter, there is no way for speed to change from the client's perspective. All generated audio uses the default synthesis speed from the Edge TTS engine.

Within the subtitle segment system, `generateSegmentAudio` adjusts playback speed via FFmpeg `atempo` to match subtitle timing. This system is **not cached**, so there is no risk of stale speed-adjusted audio.

**Risk**: Only if `speed` is added as an API parameter without updating the cache key (see item 1).

---

## 3. Cache metadata survives server restarts

**Status: PASS** (partial)

Cached audio **files** survive restarts because they live on the filesystem at `CACHE_DIR` (default `output/cache/`). A file from a previous server session will be found and served on cache check.

Cache **statistics** (`hits`, `misses`) are module-level variables in `cache.service.ts:12`:

```ts
const stats: CacheStats = { hits: 0, misses: 0 };
```

These reset to zero on every restart. The stat counters at `GET /api/cache/stats` reflect only the current session.

**Combined effect**: After restart, the first request for previously-cached audio will correctly return the cached file (a real hit), but `stats.hits` will read `0` + 1 = 1 instead of carrying forward the previous session's count. The `entries` and `size` fields in the stats response are computed live from the filesystem, so they are always accurate.

**Recommendation**: This is acceptable behavior for the current tier. If persistent stats are required, store hit/miss counters in SQLite.

---

## 4. Cache cleanup is safe

**Status: PASS** (with minor bug note)

The cleanup logic in `cache.service.ts:72-121` operates in three steps:

1. **Read directory** → collect all `.mp3` file entries with `mtime` and `size`.
2. **Remove expired** → delete files where `now - mtime > maxAge`.
3. **Enforce limit** → if still over `maxEntries`, sort remaining by mtime ascending and delete oldest.

### Safety analysis

| Concern | Assessment |
|---------|------------|
| Deletes files only from `CACHE_DIR` | ✅ Safe — only iterates the configured cache directory |
| Checks `extname` before deleting | ✅ Safe — only targets `.mp3` files |
| `unlink` is wrapped in `.catch(() => {})` | ✅ Safe — errors from concurrent access are swallowed (acceptable for cleanup) |
| Race with concurrent reads | ⚠️ Low risk — a file being deleted between `stat` (in `getPath`) and `readFile` (in caller) would cause a transient 404-type error. Callers do not handle this gracefully (they would get a file-not-found error from readFile/copyFile). In practice, cleanup runs every 5 min and file access is near-instant, so the window is negligible. |

### Bug: double-count in limit check

Line 101: `if (entries.length - removed > maxEntries)`

`entries.length` includes expired files that were already deleted. The subtraction `entries.length - removed` gives the count of non-expired files. This is logically correct.

However, if the actual deletion of non-expired files (step 3) itself fails partway through (e.g., EACCES on one file), the next cleanup cycle will re-attempt deletion. This is acceptable.

### Performance concern

`mkdir(config.cacheDir, { recursive: true })` is called on **every** `saveBuffer` and `saveFromPath` call, not just on the first write. While `mkdir -p` is a no-op when the directory exists, this adds unnecessary overhead for every cache write. Consider removing it or adding a startup-time-only `mkdir` call.

**Recommendation**: Create the cache directory once at startup in `server.ts` rather than on every cache write.

---

## 5. Cache statistics remain accurate after restart

**Status: FAIL**

| Statistic | Survives restart? | Mechanism |
|-----------|-------------------|-----------|
| `hits` | ❌ No | Reset to 0 (module-level variable) |
| `misses` | ❌ No | Reset to 0 (module-level variable) |
| `entries` | ✅ Yes | Computed live from `readdir(CACHE_DIR)` |
| `size` | ✅ Yes | Computed live from `stat()` per file |

The `getStats()` method in `cache.service.ts:23-25` always returns hardcoded `size: 0, entries: 0`:

```ts
getStats(): CacheStats & { size: number; entries: number } {
  return { ...stats, size: 0, entries: 0 };
}
```

The controller overrides these values with live filesystem data (`cache.controller.ts:12-19`), so the endpoint response is correct. But the method signature is misleading — it claims to return `size` and `entries` but always returns `0` for both. The controller shoulders the burden of computing real values.

**Recommendation**: Remove `size` and `entries` from the `getStats()` return type and compute them only in the controller, or have `getStats()` accept optional flags to include filesystem data.

---

## 6. Concurrency safety

**Status: PASS** (with warnings)

### Write-write race

Two concurrent calls to `saveBuffer(text, voice, buffer)` with the same `text + voice` combination can race. Both read the file path at the same time, both call `writeFile`, and one overwrites the other. This produces a correct file (both wrote identical content), so data integrity is preserved. The wasted I/O is the only cost.

### Read-write race

A `getBuffer` call (read) for a file that is currently being written by `saveBuffer` on another request could read a partial file. The window is extremely small (both must arrive within milliseconds of each other), and the result would be a truncated MP3 that would fail client-side playback.

**Severity**: Very Low. The `generateHandler` controller calls `generateDirectAudio` which is async. Two identical requests would need to arrive in the same event-loop tick for `getBuffer` to miss on both and both enter `saveBuffer`. This is a well-known race pattern that can be fixed with a simple in-progress `Set<string>` lock.

### Cleanup-read race

Cleanup deleting a file that `getPath` just checked via `stat` (TOCTOU). As noted in item 4, the window is negligible given the 5-minute cleanup interval.

### mkdir spam

Every `saveBuffer` and `saveFromPath` call runs `mkdir(config.cacheDir, { recursive: true })`. This is safe but wasteful. A single `await mkdir(...)` in `server.ts` during startup would eliminate the redundant syscalls.

**Recommendation**: Add a `Set<string>` in-progress lock in `cache.service.ts` to prevent concurrent generation of the same key:

```ts
const pending = new Set<string>();

// In getBuffer: if (pending.has(key)) return null; // let caller generate
// In saveBuffer after write: pending.delete(key);
```

---

## 7. Missing repository/database integration

**Status: CONSIDERED — not required**

The cache uses filesystem-only storage with in-memory stats. There is no SQLite table for cache entries.

### Arguments for adding a cache repository

| Benefit | Description |
|---------|-------------|
| Persistent stats | Hit/miss counters survive restarts |
| Voice-based analytics | Query cache hit rate per voice |
| Programmatic invalidation | Delete all cache entries for a voice |
| Disk usage tracking | Accurate per-entry size stored in DB |

### Arguments against

| Reason | Description |
|--------|-------------|
| Simplicity | Filesystem-only is zero infrastructure beyond the code |
| No query need | The only query pattern is `key → file exists?` — stat() is O(1) |
| Write overhead | Every cache write would also require a SQLite INSERT |
| Cleanup complexity | Would need to keep DB and filesystem in sync |

### Assessment

The roadmap does not require a cache database. The filesystem-only approach is appropriate for the single-instance architecture. Hit/miss counters resetting on restart is a minor inconvenience, not a critical gap.

If persistent stats become important, a `cache_entries` table can be added in a future phase with:

```sql
CREATE TABLE IF NOT EXISTS cache_entries (
  cache_key TEXT PRIMARY KEY,
  voice TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_accessed_at TEXT NOT NULL
);
```

---

## Summary

| Check | Status | Severity |
|-------|--------|----------|
| 1. Cache key includes all audio-affecting params | ❌ FAIL — missing `speed` | Medium (blocker for future speed feature) |
| 2. Correctness when speed changes | ✅ PASS (current scope) | — |
| 3. Cache metadata survives restart | ✅ PASS (files survive; stats reset) | Low |
| 4. Cache cleanup safety | ✅ PASS | — |
| 5. Stats accuracy after restart | ❌ FAIL — hit/miss reset to 0 | Low |
| 6. Concurrency safety | ✅ PASS (minor race windows) | Very Low |
| 7. Repository/database integration | ✅ Not required | — |

### Actionable items

1. **High**: Add `speed` to the cache key (or document that it will be added when the API gains a speed parameter). This is a one-line change in `buildKey()`.
2. **Low**: Create cache directory once at startup instead of on every write.
3. **Low**: Remove misleading `size: 0, entries: 0` from `getStats()` return, or compute them there.
4. **Very Low**: Add in-progress lock set to prevent concurrent generation of identical cache keys.
