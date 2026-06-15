# Phase 9 — Swagger / OpenAPI — Complete

## Goal

Provide self-documenting API with a browsable Swagger UI.

## Changes Made

### Installed Packages
- `swagger-ui-express` — serves Swagger UI at `/docs`
- `@types/swagger-ui-express` — TypeScript declarations

### Created Files

**`src/openapi.ts`** — Full OpenAPI 3.1 specification as a typed object:
- Covers all 17 endpoints across 5 modules (TTS, Jobs, Queue, Cache, Subtitles)
- 22 schema definitions (request bodies, response bodies, error shapes)
- 3 reusable error responses (400, 404, 500)
- Complete error code registry (26 AppError codes + 2 built-in)
- Tags for API grouping

### Modified Files

**`src/app.ts`** — Added two new routes before the existing handler:
- `GET /docs` — Swagger UI browser
- `GET /openapi.json` — Raw OpenAPI spec

### API Coverage

| Module | Endpoints | Documented |
|--------|-----------|------------|
| TTS | `GET /api/voices`, `POST /api/generate` | ✓ |
| Jobs | `POST /api/jobs`, `GET /api/jobs/:id`, `GET /api/download/:id` | ✓ |
| Queue | `GET /api/queue/stats` | ✓ |
| Cache | `GET /api/cache/stats` | ✓ |
| Subtitles | 9 endpoints (import, jobs, segments, export, preview) | ✓ |

## Verification

- `npx tsc --noEmit`: clean (0 errors)
- `npx tsx tests/subtitle.test.ts`: 35/35 passed
