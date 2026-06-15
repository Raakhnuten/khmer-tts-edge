# Phase 4: Centralized Error Handling — Complete

## Goal
Standardize all HTTP error responses into a uniform JSON format with proper status codes and error codes, eliminating ad-hoc `res.status(N).json({ error: ... })` from controllers.

## Changes

### New files
| File | Purpose |
|------|---------|
| `src/errors/index.ts` | `AppError` class: holds `statusCode`, `code`, `message` |
| `src/middleware/error-handler.ts` | Global Express error handler middleware |

### Modified files
| File | What changed |
|------|-------------|
| `src/middleware/validation.ts` | Calls `next(err)` instead of sending raw `400` response |
| `src/controllers/tts.controller.ts` | All `res.status().json()` → `throw new AppError(...)` |
| `src/controllers/jobs.controller.ts` | Same refactor |
| `src/controllers/subtitle.controller.ts` | Same refactor |
| `src/utils/stream.ts` | Error format changed to `{ success: false, error: { code, message } }` |
| `src/app.ts` | Registers `app.use(errorHandler)` as final middleware |

## Standard error response format

All errors now produce:
```json
{
  "success": false,
  "error": {
    "code": "STRING_CODE",
    "message": "Human-readable description"
  }
}
```

Zod validation errors additionally include:
```json
"details": [{ "field": "body.text", "message": "Required" }]
```

## Error codes defined in controllers

| Code | Status | Meaning |
|------|--------|---------|
| `INVALID_TEXT` | 400 | Empty or whitespace-only text |
| `VOICE_REQUIRED` | 400 | Voice field missing |
| `INVALID_VOICE` | 400 | Not a known Khmer voice |
| `TEXT_TOO_LONG` | 400 | Exceeds short-text limit for direct generation |
| `JOB_NOT_FOUND` | 404 | Job ID doesn't exist |
| `JOB_NOT_COMPLETED` | 400 | Job still running/has no output |
| `EMPTY_FILE` | 500 | Job output is zero bytes |
| `SRT_REQUIRED` | 400 | Empty SRT string |
| `SRT_TOO_LARGE` | 400 | SRT exceeds 50MB limit |
| `SRT_INVALID` | 400 | No valid subtitle blocks parsed |
| `SEGMENTS_REQUIRED` | 400 | Segments array missing/empty |
| `SUBTITLE_JOB_NOT_FOUND` | 404 | Subtitle job doesn't exist |
| `INDICES_REQUIRED` | 400 | Index array missing/empty |
| `INVALID_INDEX` | 400 | Segment index is not a positive number |
| `SEGMENT_NOT_AVAILABLE` | 400 | Segment hasn't been generated yet |
| `SEGMENT_FILE_NOT_FOUND` | 404 | Audio file on disk is missing |
| `JOB_ID_REQUIRED` | 400 | jobId missing in request body |
| `NO_COMPLETED_SEGMENTS` | 400 | Nothing to export/preview |
| `EMPTY_EXPORT` | 500 | Exported file is zero bytes |
| `EMPTY_PREVIEW` | 500 | Preview file is zero bytes |
| `FILE_NOT_FOUND` | 404 | File not found during streaming (stream.ts) |
| `STREAM_ERROR` | 500 | Read stream error |
| `EXPORT_NOT_FOUND` | 404 | Export file not present |
| `PREVIEW_NOT_FOUND` | 404 | Preview file not present |
| `VALIDATION_ERROR` | 400 | Zod validation failure (global handler) |
| `INTERNAL_ERROR` | 500 | Unhandled/unexpected error (global handler) |

## Testing
- `npx tsc --noEmit` — passes
- `npx tsx tests/subtitle.test.ts` — all 35 tests pass
