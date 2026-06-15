# Phase 7: Audio Cache — Risks

## 1. Stale cached audio

**Risk**: If the TTS engine's output changes (e.g., Microsoft updates their voice models), cached audio will serve the old version until the cache expires (default 24h).

**Severity**: Low
**Mitigation**: The `CACHE_MAX_AGE_MS` default of 24h ensures stale audio is eventually evicted. For immediate invalidation, delete the `output/cache/` directory or set `CACHE_DIR` to a fresh path. A future enhancement could add a `version` tag to the cache key.

---

## 2. No distributed cache

**Risk**: The cache is file-system-local. In a multi-instance deployment (e.g., behind a load balancer), each instance has its own cache. Identical requests to different instances both generate audio.

**Severity**: Medium (only relevant for scale-out scenarios)
**Mitigation**: This is a single-instance application. Distributed caching (Redis, shared NFS) can be added in a future phase if multi-instance deployment is needed. The cache service interface is already clean enough to swap the backend.

---

## 3. No concurrent-write lock

**Risk**: Two identical requests arriving within the same event-loop tick could both miss the cache and both generate the same audio. The second write overwrites the first. This wastes resources but produces correct results.

**Severity**: Low
**Mitigation**: The window is extremely narrow (both requests must arrive before either one finishes generating). A simple `Set<string>` in-progress lock could be added if this becomes a problem, but the current behavior is safe (just wasteful).

---

## 4. Disk space exhaustion

**Risk**: If `CACHE_MAX_ENTRIES` is set very high or cleanup is disabled, cached files could consume significant disk space.

**Severity**: Low
**Mitigation**: Defaults are conservative (500 entries, 24h TTL). Cleanup runs every 5 minutes. The `CACHE_DIR` cache dir can be excluded from backups. For defense in depth, a disk-space check could be added before writes.

---

## 5. Cache stats reset on restart

**Risk**: Hit/miss counters are in-memory and reset to zero when the server restarts. This means monitoring systems will see a spike at startup.

**Severity**: Very Low
**Mitigation**: Acceptable for a single-instance server. If persistent stats are needed, the counters could be stored in SQLite (but this adds write overhead on every cache access).

---

## 6. No cache for subtitle segment audio

**Risk**: The audio cache only applies to full-text TTS generation (direct + jobs). Subtitle segment generation (`generateSegmentAudio` in `subtitle.ts`) is not cached. Segments are typically unique (different text per segment), so caching would have low hit rates.

**Severity**: Very Low
**Mitigation**: Adding segment caching would increase complexity for minimal gain. If segment reuse becomes common (e.g., template projects), it can be added later.

---

## 7. Cache key collision (theoretical)

**Risk**: The `computeTextHash` function produces a 32-bit hash (base36 string). With ~500 cache entries, the probability of collision is negligible. However, a determined attacker could craft two different texts with the same hash.

**Severity**: Very Low (theoretical)
**Mitigation**: 32-bit hashes have ~1-in-100k collision probability at 500 entries. For production hardening, the cache key could be extended to SHA-256, but this is disproportionate to the current threat model.

---

## Risk Summary

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | Stale cached audio | Low | 24h TTL, manual cache clear |
| 2 | No distributed cache | Medium | Single-instance only; swappable backend |
| 3 | No concurrent-write lock | Low | Safe (wasteful but correct) |
| 4 | Disk space exhaustion | Low | Conservative defaults, periodic cleanup |
| 5 | Stats reset on restart | Very Low | Acceptable; persistent stats possible later |
| 6 | No segment audio cache | Very Low | Low ROI; can be added later |
| 7 | Hash collision | Very Low | Negligible probability at 500 entries |
