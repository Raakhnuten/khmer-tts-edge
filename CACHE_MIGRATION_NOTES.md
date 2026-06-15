# Cache Migration Notes — Phase 7.5

## What changed

The cache key formula was updated from:

    hash(text + voice)

to:

    hash(text + voice + speed)

where `speed` defaults to `1.0`.

## Effect on existing cache

- **All previously cached files become orphans.** A request for `text="hello"`, `voice="km-KH-PisethNeural"` now computes key `hash("hello" + "km-KH-PisethNeural" + "1")` instead of the old `hash("hello" + "km-KH-PisethNeural")`.
- **No files are deleted.** Existing `.mp3` files remain on disk but will not be found by cache lookups.
- **Cache hit rate drops to 0** immediately after deploy. Files will be regenerated and re-cached under the new key as requests come in.
- **Orphan cleanup.** The periodic cache cleaner (runs every 5 minutes) removes files older than `cacheMaxAgeMs` (default 24h). After 24 hours, all old-format files are gone.

## No data loss

The old files are not deleted on upgrade; they merely become invisible to the new key lookup. If you need to keep them, copy the cache directory before deploying.

## Rollback

To revert:
1. Deploy previous version (Phase 7 code)
2. The old code uses `hash(text + voice)` keys and will find the original files again
3. Any files generated under the new key (`hash(text + voice + speed)`) become orphans

## Future-proofing

The cache key now includes `speed` even though the API does not expose a speed parameter yet. When speed is added to the API, no cache migration will be needed — the key already accounts for it.
