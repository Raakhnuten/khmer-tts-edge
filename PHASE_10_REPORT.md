# Phase 10 — Integration Tests — Complete

## Goal

Add end-to-end API tests covering success paths, validation failures, error handling, and all API modules.

## Changes Made

### Installed Packages
- `vitest` — test runner
- `supertest` — HTTP assertion library

### Created Files

**`tests/api.test.ts`** — 24 integration tests:

| Module | Tests | Coverage |
|--------|-------|----------|
| OpenAPI docs | 2 | Swagger UI serves, raw spec has correct metadata |
| `GET /api/voices` | 1 | Returns array |
| `POST /api/generate` | 3 | Missing text (400), missing voice (400), invalid voice (400) |
| `POST /api/jobs` | 3 | Creates job (201), empty text (400), missing voice (400) |
| `GET /api/jobs/:id` | 2 | Non-existent (404), created job details (200) |
| `GET /api/download/:id` | 1 | Non-existent (404) |
| `GET /api/queue/stats` | 1 | Returns properly shaped stats object |
| `GET /api/cache/stats` | 1 | Returns properly shaped stats object |
| `POST /api/subtitles/import` | 3 | Valid SRT (200), empty (400), missing field (400) |
| `POST /api/subtitles/jobs` | 2 | Create from segments (201), empty array (400) |
| `POST /api/subtitles/export` | 2 | Missing jobId (400), non-existent (404) |
| `POST /api/subtitles/preview-completed` | 1 | Missing jobId (400) |
| Error responses | 2 | Unknown route (404), validation error details (400) |

**`tests/setup.ts`** — Test environment helpers (temp directory, env vars, cleanup)
**`vitest.config.ts`** — Vitest configuration

### Test Infrastructure
- Each test run creates a temporary directory with isolated SQLite database
- Environment variables override config at import time
- Queue worker is NOT started (only `app.ts` is imported, not `server.ts`)
- Temp directory is cleaned up after all tests complete

### Running Tests
```bash
npm test          # Runs both unit + API tests
npm run test:unit  # Existing 35 subtitle unit tests
npm run test:api   # 24 API integration tests
```

## Verification

- `npx vitest run tests/api.test.ts`: 24/24 passed
- `npx tsx tests/subtitle.test.ts`: 35/35 passed
- `npx tsc --noEmit`: clean (0 errors)
