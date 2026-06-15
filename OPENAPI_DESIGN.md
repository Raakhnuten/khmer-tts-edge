# OpenAPI Design

## Spec Location

The OpenAPI 3.1 specification is defined as a typed JavaScript object in `src/openapi.ts` and served at two endpoints:

| Endpoint | Content |
|----------|---------|
| `GET /docs` | Swagger UI (interactive documentation) |
| `GET /openapi.json` | Raw OpenAPI 3.1 JSON |

## Design Principles

### 1. Schema-first
All request bodies, response bodies, and error shapes are defined as reusable `$ref` schemas under `components.schemas`. No inline schemas except for trivial cases.

### 2. Error uniformity
Every endpoint references one of three reusable error responses:
- `Error400` — validation failures and business rule violations
- `Error404` — resource not found
- `Error500` — unexpected server errors

All error responses share the `ApiError` schema:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": [{ "field": "path.to.field", "message": "...", }]
  }
}
```

### 3. Tag grouping
Endpoints are grouped into 5 tags:
- **TTS** — voice listing and direct audio generation
- **Jobs** — long-form TTS job lifecycle
- **Queue** — background processing queue statistics
- **Cache** — audio cache statistics
- **Subtitles** — full subtitle workflow (import, segment, export, preview)

### 4. Binary responses
Audio endpoints return `audio/mpeg` with schema `{ type: 'string', format: 'binary' }`.

## Schemas

| Schema | Used By |
|--------|---------|
| `Voice` | `GET /api/voices` |
| `GenerateRequest` | `POST /api/generate` |
| `CreateJobRequest` | `POST /api/jobs` |
| `JobCreatedResponse` | All creation endpoints |
| `JobStatusResponse` | `GET /api/jobs/:id` |
| `QueueStats` | `GET /api/queue/stats` |
| `CacheStats` | `GET /api/cache/stats` |
| `ImportSrtRequest` / `ImportSrtResponse` | `POST /api/subtitles/import` |
| `SubtitleSegmentInput` / `SubtitleSegmentData` | Subtitle endpoints |
| `SubtitleJobData` | `GET /api/subtitles/jobs/:id` |
| `GenerateSegmentsRequest` | `POST /api/subtitles/segments/:id/generate` |
| `ExportAudioRequest` / `ExportAudioResponse` | Subtitle export |
| `PreviewCompletedRequest` / `PreviewCompletedResponse` | Subtitle preview |
| `ApiError` | All error responses |

## Extending

To add a new endpoint:

1. Add the path with `$ref` references to existing schemas (or create new ones)
2. Register the schema in `components.schemas`
3. Add reusable error responses if needed
4. The spec auto-updates on next server restart
