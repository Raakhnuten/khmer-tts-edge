# Phase 7: Audio Cache — Summary

## What was built

An audio cache service that prevents regenerating identical TTS audio for the same text+voice pair. Cached files are stored on disk as MP3 files named by a content hash. In-memory hit/miss counters track effectiveness.

### Cache key
`computeTextHash(text + voice)` — deterministic 32-bit hash → base36 string.

### Cache storage
- **Location**: `output/cache/` (configurable via `CACHE_DIR` env var)
- **File**: `{cacheKey}.mp3`
- **Max age**: 24 hours (configurable via `CACHE_MAX_AGE_MS`)
- **Max entries**: 500 (configurable via `CACHE_MAX_ENTRIES`)

## Architecture

```
POST /api/generate
  → generateDirectAudio(text, voice, tempDir)
      → cacheService.getBuffer(text, voice)
          ├─ HIT → return cached Buffer (skip TTS)
          └─ MISS → generateAudio() → cacheService.saveBuffer() → return

POST /api/jobs
  → createJob → processJob(id, text, voice, jobDir)
      → cacheService.getPath(text, voice)
          ├─ HIT → copyFile cached → job completed instantly
          └─ MISS → generateAudio() → cacheService.saveFromPath() → job completed

GET /api/cache/stats
  → cacheController.getCacheStats()
      → cacheService.getStats() + filesystem scan
      → { hits, misses, size, entries }
```

### Cleanup
Runs every 5 minutes alongside job/subtitle cleanup:
1. Remove files older than `CACHE_MAX_AGE_MS`
2. If still over `CACHE_MAX_ENTRIES`, remove oldest by mtime

## Files changed

| File | Action |
|------|--------|
| `src/config/index.ts` | Added `CACHE_DIR`, `CACHE_MAX_AGE_MS`, `CACHE_MAX_ENTRIES` |
| `src/services/cache.service.ts` | **NEW** — core cache logic |
| `src/controllers/cache.controller.ts` | **NEW** — stats endpoint handler |
| `src/routes/cache.routes.ts` | **NEW** — `GET /api/cache/stats` |
| `src/services/tts.service.ts` | Integrated cache into `generateDirectAudio` + `processJob` |
| `src/app.ts` | Registered `cacheRoutes` |
| `src/server.ts` | Added `cacheService.cleanup()` to periodic interval |

## Verification
- `npx tsc --noEmit` — passes
- `npx tsx tests/subtitle.test.ts` — all 35 tests pass
- API contracts preserved (no response shape changes)
