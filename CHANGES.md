# Phase 7: Audio Cache — Changes

## New environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_DIR` | `output/cache` | Directory for cached MP3 files |
| `CACHE_MAX_AGE_MS` | `86400000` (24h) | Max age before cache eviction |
| `CACHE_MAX_ENTRIES` | `500` | Max cached files before LRU eviction |

## New API endpoint

### `GET /api/cache/stats`

Returns cache performance metrics.

**Response:**
```json
{
  "hits": 12,
  "misses": 5,
  "size": 2048576,
  "entries": 3
}
```

| Field | Type | Description |
|-------|------|-------------|
| `hits` | number | Cache hits since server start |
| `misses` | number | Cache misses since server start |
| `size` | number | Total size of all cached files in bytes |
| `entries` | number | Number of cached files on disk |

## Behavioural changes

### POST /api/generate
**Before**: Always generated audio via Edge TTS, even if identical text+voice was recently requested.
**After**: Checks cache first. On hit, returns cached audio immediately (~0ms). On miss, generates and caches.

### POST /api/jobs
**Before**: Always generated audio via Edge TTS, even if identical.
**After**: Checks cache first. On hit, copies cached file to job directory and marks job completed instantly. On miss, generates, caches output, and completes normally.

## Cache lifecycle

| Event | Trigger | Action |
|-------|---------|--------|
| Cache hit | `generateDirectAudio` or `processJob` | `stats.hits++`, return cached data |
| Cache miss | Same functions | `stats.misses++`, generate, save to cache |
| Entry eviction | Periodic cleanup (every 5 min) | Remove files >24h old, then oldest if >500 entries |
| Server restart | Startup | Cache dir created if absent; stats reset |

## No breaking changes

- All existing API responses remain identical
- No endpoint paths changed
- No Zod schemas changed
- No database migrations needed
- No dependencies added
- No Types or interfaces modified

## File listing

```
src/
├── controllers/
│   └── cache.controller.ts       (NEW, 27 lines)
├── routes/
│   └── cache.routes.ts           (NEW, 8 lines)
├── services/
│   ├── cache.service.ts          (NEW, 125 lines)
│   └── tts.service.ts            (MODIFIED, +cache integration)
├── config/
│   └── index.ts                  (MODIFIED, +3 env vars)
├── app.ts                        (MODIFIED, +cache route import)
└── server.ts                     (MODIFIED, +cache cleanup)
```
