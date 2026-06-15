# Phase 1.5 — Fix Review Findings

## Scope

All 4 Critical findings and all 3 Controller Violations from `PHASE_1_REVIEW.md` resolved.

---

## Findings Addressed

### Critical

| # | Finding | Resolution |
|---|---------|------------|
| S1 | **Dead code**: `updateSubtitleJob` defined but never called | **Removed** from `services/subtitle.service.ts` |
| S2 | **Missing `export.service.ts`** | **Created** `services/export.service.ts` with `exportSubtitleFinal` and `previewSubtitleFinal` |
| S3 | **Controller too large** (255 lines) | **Reduced to 206 lines** — 49 lines moved to services |
| S4 | **Inconsistent streaming** — `downloadExport` uses raw `createReadStream` | **Standardized** to use `streamFile` from `utils/stream.ts`; sets `Content-Length` before call |

### Controller Violations

| # | Violation | Resolution |
|---|-----------|------------|
| C1 | `tts.controller.generateHandler` manages full workflow (temp dir, generate, read, cleanup) | **Delegated** to `services/tts.service.ts::generateDirectAudio` |
| C2 | `subtitle.controller.createSubtitleJob` has voice-defaulting business logic | **Delegated** to `services/subtitle.service.ts::createSubtitleJobInStore` and `buildSegmentFromInput` |
| C3 | `subtitle.controller.generateSegments` has inline segment update logic | **Delegated** to `services/subtitle.service.ts::applySegmentUpdates` |

### Incidental (prerequisites for above)

| # | Smell | Resolution |
|---|-------|------------|
| S9 | `sanitizeFilename` is controller-private | **Moved** to `utils/helpers.ts` alongside `sleep` |
| S10 | `KHMER_VOICES_LIST` duplicated in controller | **Eliminated** — voice-defaulting now uses `isValidKhmerVoice` from `voices.ts` in the service |

---

## Files Changed

### Modified

| File | What changed | Lines |
|------|-------------|-------|
| `src/utils/helpers.ts` | Added `sanitizeFilename` | 3 → 10 |
| `src/services/subtitle.service.ts` | Removed `updateSubtitleJob`; added `buildSegmentFromInput`, `createSubtitleJobInStore`, `applySegmentUpdates`; added `mkdir`, `join`, `isValidKhmerVoice` imports | 82 → 102 |
| `src/services/tts.service.ts` | Added `generateDirectAudio` (temp dir lifecycle, returns `Buffer`) | 25 → 39 |
| `src/controllers/tts.controller.ts` | Delegated generate workflow to `generateDirectAudio`; removed `randomUUID`, `mkdir`, `readFile`, `unlink`, `rmdir`, `join` imports | 52 → 43 |
| `src/controllers/subtitle.controller.ts` | Delegated business logic to services; replaced `createReadStream` with `streamFile`; imported `sanitizeFilename` from helpers; renamed `createSubtitleJob` → `createSubtitleJobHandler` | 255 → 206 |
| `src/routes/subtitle.routes.ts` | Updated import to `createSubtitleJobHandler` | — |

### Created

| File | Lines | Content |
|------|-------|---------|
| `src/services/export.service.ts` | 57 | `exportSubtitleFinal`, `previewSubtitleFinal` with types `ExportResult`, `PreviewResult` |

---

## Architecture After Fix

```
Request flow:

  Route (wire only)
    → Controller (validate request, call service, format response)
      → Service (business logic, data access)
```

| Criterion | Before | After |
|-----------|--------|-------|
| Routes wire-only | ✅ | ✅ |
| Controllers request-only | ⚠️ 3 violations | ✅ Clean |
| Services own business logic | ✅ | ✅ (expanded) |
| `server.ts` lines | 15 | 15 |
| `subtitle.controller.ts` lines | 255 | 206 |
| Services | 3 | 4 (+export.service.ts) |
| Dead code | `updateSubtitleJob` | 0 |
| Raw `createReadStream` in controllers | 1 (`downloadExport`) | 0 |
| `sanitizeFilename` location | controller | `utils/helpers.ts` |
| `KHMER_VOICES_LIST` location | controller | eliminated (uses `voices.ts`) |

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ Pass — zero errors |
| `tests/subtitle.test.ts` | ✅ 35/35 pass |
| All imports resolve | ✅ |
| No console.log in services | ✅ |
| No unused exports | ✅ |
