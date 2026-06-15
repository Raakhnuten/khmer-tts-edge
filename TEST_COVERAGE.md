# Test Coverage

## Unit Tests (35)

Located in `tests/subtitle.test.ts`. Covers all subtitle parsing, formatting, timeline calculation, crossfade logic, and speed adjustment logic.

| Suite | Tests | Coverage |
|-------|-------|----------|
| parseSRT | 12 | Standard, decimals, leading zeros, ms digits, invalid timing, CRLF, empty, comments, multi-line, large values, overflow |
| formatSRTTime | 1 | Time formatting |
| formatTimeShort | 1 | Short time formatting |
| Time format round-trip | 2 | Parse → format, format → parse |
| Timeline calculations | 6 | Gap detection, touching, overlapping, duration, total gap, duration equality |
| Crossfade compensation | 4 | Crossfade loss, single-segment, max loss, silence gaps |
| Large subtitle projects | 4 | 124 segments, 500 segments, 500 with gaps, 1000 stress |
| Duration guarantee | 2 | Last endTime = total duration, any gap config |
| Mixed playback speeds | 3 | Speed adjustment, atempo cascading, clamping |

## Integration Tests (24)

Located in `tests/api.test.ts`. Covers all API endpoints.

| Suite | Tests | Coverage |
|-------|-------|----------|
| OpenAPI docs | 2 | Swagger UI, raw spec structure |
| GET /api/voices | 1 | Success path |
| POST /api/generate | 3 | Missing text, missing voice, invalid voice |
| POST /api/jobs | 3 | Success, empty text, missing voice |
| GET /api/jobs/:id | 2 | 404, success path |
| GET /api/download/:id | 1 | 404 |
| GET /api/queue/stats | 1 | Shape validation |
| GET /api/cache/stats | 1 | Shape validation |
| POST /api/subtitles/import | 3 | Valid SRT, empty, missing field |
| POST /api/subtitles/jobs | 2 | Success, empty segments |
| POST /api/subtitles/export | 2 | Missing jobId, not found |
| POST /api/subtitles/preview-completed | 1 | Missing jobId |
| Error responses | 2 | Unknown route, validation details |

## Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# API tests only
npm run test:api

# Type check
npm run typecheck
```
