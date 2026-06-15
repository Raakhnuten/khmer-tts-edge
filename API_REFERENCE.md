# API Reference

Browse the interactive documentation at `/docs` or fetch the raw spec at `/openapi.json`.

## TTS Module

### `GET /api/voices`
List available TTS voices.
```
Response 200: Voice[]
```

### `POST /api/generate`
Generate short audio directly (max 5000 characters).
```
Request:  { text: string, voice: string }
Response: audio/mpeg binary
Errors:   INVALID_TEXT, VOICE_REQUIRED, INVALID_VOICE, TEXT_TOO_LONG
```

## Jobs Module

### `POST /api/jobs`
Create a long-form TTS job. The job is queued for background processing.
```
Request:  { text: string, voice: string }
Response: 201 { id: string }
Errors:   INVALID_TEXT, VOICE_REQUIRED, INVALID_VOICE
```

### `GET /api/jobs/:id`
Get job status and progress.
```
Response: { id, status, progress, currentChunk, totalChunks, error, createdAt }
Errors:   JOB_NOT_FOUND
```

### `GET /api/download/:id`
Download completed job audio.
```
Response: audio/mpeg (attachment)
Errors:   JOB_NOT_FOUND, JOB_NOT_COMPLETED, EMPTY_FILE
```

## Queue Module

### `GET /api/queue/stats`
Get queue statistics.
```
Response: { queued, processing, completed, failed, retries }
```

## Cache Module

### `GET /api/cache/stats`
Get audio cache statistics.
```
Response: { hits, misses, size, entries }
```

## Subtitles Module

### `POST /api/subtitles/import`
Parse SRT content into segments.
```
Request:  { srt: string }
Response: { segments: SubtitleSegmentInput[] }
Errors:   SRT_REQUIRED, SRT_TOO_LARGE, SRT_INVALID
```

### `POST /api/subtitles/jobs`
Create a subtitle job.
```
Request:  { segments: SubtitleSegmentInput[] }
Response: 201 { id: string }
```

### `GET /api/subtitles/jobs/:id`
Get subtitle job data including all segments and their status.
```
Response: SubtitleJobData
Errors:   SUBTITLE_JOB_NOT_FOUND
```

### `POST /api/subtitles/segments/:id/generate`
Generate audio for specific segments.
```
Request:  { indices: number[], segments?: UpdateSegment[] }
Response: { status: 'processing', jobId }
Errors:   SUBTITLE_JOB_NOT_FOUND, INDICES_REQUIRED
```

### `GET /api/subtitles/segments/:id/audio?index=N`
Get individual segment audio.
```
Response: audio/mpeg
Errors:   SUBTITLE_JOB_NOT_FOUND, INVALID_INDEX, SEGMENT_NOT_AVAILABLE, SEGMENT_FILE_NOT_FOUND
```

### `POST /api/subtitles/export`
Export subtitle project as final mixed audio.
```
Request:  { jobId, filename?, gapMode?, smoothMerge?, crossfadeMs? }
Response: { exportId, filename, downloadUrl }
Errors:   JOB_ID_REQUIRED, SUBTITLE_JOB_NOT_FOUND, NO_COMPLETED_SEGMENTS
```

### `GET /api/subtitles/export/:id/download?filename=`
Download exported audio file.
```
Response: audio/mpeg (attachment)
Errors:   EXPORT_NOT_FOUND, EMPTY_EXPORT
```

### `POST /api/subtitles/preview-completed`
Preview merged completed segments.
```
Request:  { jobId, gapMode?, smoothMerge?, crossfadeMs? }
Response: { success, url, duration, segmentCount }
Errors:   JOB_ID_REQUIRED, SUBTITLE_JOB_NOT_FOUND, NO_COMPLETED_SEGMENTS
```

### `GET /api/subtitles/preview-completed/:jobId`
Get preview audio.
```
Response: audio/mpeg
Errors:   PREVIEW_NOT_FOUND, EMPTY_PREVIEW
```

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Zod schema validation failure |
| `INVALID_TEXT` | 400 | Text is empty or invalid |
| `VOICE_REQUIRED` | 400 | Voice parameter missing |
| `INVALID_VOICE` | 400 | Unsupported voice |
| `TEXT_TOO_LONG` | 400 | Text exceeds short-generation limit |
| `SRT_REQUIRED` | 400 | SRT content missing |
| `SRT_TOO_LARGE` | 400 | SRT exceeds size limit |
| `SRT_INVALID` | 400 | No valid subtitle blocks |
| `SEGMENTS_REQUIRED` | 400 | Segments array missing |
| `INDICES_REQUIRED` | 400 | Indices array missing |
| `INVALID_INDEX` | 400 | Segment index is invalid |
| `SEGMENT_NOT_AVAILABLE` | 400 | Segment audio not yet generated |
| `JOB_ID_REQUIRED` | 400 | Job ID missing |
| `NO_COMPLETED_SEGMENTS` | 400 | No completed segments to process |
| `JOB_NOT_COMPLETED` | 400 | Job has not finished processing |
| `JOB_NOT_FOUND` | 404 | Job ID not found |
| `SUBTITLE_JOB_NOT_FOUND` | 404 | Subtitle job ID not found |
| `SEGMENT_FILE_NOT_FOUND` | 404 | Segment audio file missing |
| `EXPORT_NOT_FOUND` | 404 | Export file not found |
| `PREVIEW_NOT_FOUND` | 404 | Preview file not found |
| `EMPTY_FILE` | 500 | Generated audio is empty |
| `EMPTY_EXPORT` | 500 | Exported MP3 is empty |
| `EMPTY_PREVIEW` | 500 | Preview audio is empty |
| `INTERNAL_ERROR` | 500 | Unhandled server error |
