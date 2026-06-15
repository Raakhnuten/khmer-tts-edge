# Phase 7.5 — Review Implementation

## Changes Made

### High: Cache key now includes speed

- `buildKey()` in `src/services/cache.service.ts:23` accepts optional `speed` parameter (default `1.0`)
- Cache key formula changed from `hash(text + voice)` to `hash(text + voice + speed)`
- All callers in `src/services/tts.service.ts` pass `DEFAULT_SPEED = 1.0`
- Existing orphaned cache files (keyed without speed) are harmless; cleaned up by 24h TTL

### Low: Cache directory creation moved to startup

- `cacheService.init()` → `mkdir(config.cacheDir, { recursive: true })` called once from `src/server.ts:10`
- Removed per-write `mkdir(config.cacheDir)` from `saveBuffer()` and `saveFromPath()`

### Low: `getStats()` cleaned up

- Return type simplified to `{ hits: number; misses: number }` — no more fake `size: 0, entries: 0`
- The controller (`src/controllers/cache.controller.ts`) already computes size/entries from live filesystem

### Very Low: In-progress lock added

- `Set<string>` of pending cache keys prevents duplicate TTS generation for the same key
- `getBuffer()` and `getPath()` return `null` if a pending key is found (caller proceeds to generate)
- Lock released in `finally` block of `saveBuffer()` and `saveFromPath()`

## Not Implemented (Declined)

### Persist stats across restarts (proposed as low-risk/simple)

- Current in-memory stats reset on server restart
- Acceptable for current tier — the controller already computes live filesystem stats
- Would require a new `cache_stats` SQLite table and atomic increment on every cache hit/miss
- Revisit if stats are needed for monitoring dashboards

## Verification

- `npx tsc --noEmit`: clean (0 errors)
- `npx tsx tests/subtitle.test.ts`: 35/35 passed
