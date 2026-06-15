# Error Catalog

All API errors use the format:
```json
{
  "success": false,
  "error": {
    "code": "STRING_CODE",
    "message": "Human-readable description"
  }
}
```

Zod validation errors additionally include a `details` array.

## 4xx Client Errors

### 400 Bad Request

| Code | Source | When |
|------|--------|------|
| `VALIDATION_ERROR` | Global error handler | Zod schema validation failure |
| `INVALID_TEXT` | tts.controller, jobs.controller | Empty or whitespace-only text |
| `VOICE_REQUIRED` | tts.controller, jobs.controller | `voice` field absent |
| `INVALID_VOICE` | tts.controller, jobs.controller | Not `km-KH-PisethNeural` or `km-KH-SreymomNeural` |
| `TEXT_TOO_LONG` | tts.controller | Exceeds `SHORT_TEXT_LIMIT` for direct generation |
| `JOB_NOT_COMPLETED` | jobs.controller | Attempting to download a non-completed job |
| `SRT_REQUIRED` | subtitle.controller | Empty or whitespace-only SRT content |
| `SRT_TOO_LARGE` | subtitle.controller | SRT > 50MB |
| `SRT_INVALID` | subtitle.controller | No valid subtitle blocks parsed |
| `SEGMENTS_REQUIRED` | subtitle.controller | Segments array missing or empty |
| `INDICES_REQUIRED` | subtitle.controller | Indices array missing or empty |
| `INVALID_INDEX` | subtitle.controller | Segment index NaN or negative |
| `SEGMENT_NOT_AVAILABLE` | subtitle.controller | Segment not yet generated |
| `JOB_ID_REQUIRED` | subtitle.controller | `jobId` field absent |
| `NO_COMPLETED_SEGMENTS` | subtitle.controller | All segments pending/processing |

### 404 Not Found

| Code | Source | When |
|------|--------|------|
| `JOB_NOT_FOUND` | jobs.controller | Job ID doesn't exist |
| `SUBTITLE_JOB_NOT_FOUND` | subtitle.controller | Subtitle job ID doesn't exist |
| `SEGMENT_FILE_NOT_FOUND` | subtitle.controller | Segment audio file on disk is missing |
| `FILE_NOT_FOUND` | stream.ts | Stream source file doesn't exist |
| `EXPORT_NOT_FOUND` | subtitle.controller | Export not yet performed |
| `PREVIEW_NOT_FOUND` | subtitle.controller | Preview not yet generated |

## 5xx Server Errors

| Code | Source | When |
|------|--------|------|
| `INTERNAL_ERROR` | Global error handler | Unhandled exception (catch-all) |
| `EMPTY_FILE` | jobs.controller | Job output file is zero bytes |
| `EMPTY_EXPORT` | subtitle.controller | Exported file is zero bytes |
| `EMPTY_PREVIEW` | subtitle.controller | Preview file is zero bytes |
| `STREAM_ERROR` | stream.ts | Read stream fails unexpectedly |
