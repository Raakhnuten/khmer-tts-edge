# Phase 3 Report — Request Validation

## Files Created

| File | Purpose |
|------|---------|
| `src/middleware/validation.ts` | Reusable Express middleware that validates `body`, `params`, and/or `query` against a Zod schema |
| `src/validators/generate.schema.ts` | Zod schemas for TTS and job endpoints |
| `src/validators/subtitle.schema.ts` | Zod schemas for all subtitle endpoints |

## Files Modified

| File | Change |
|------|--------|
| `src/routes/tts.routes.ts` | Added `validate({ body: generateBodySchema })` before `POST /api/generate` handler |
| `src/routes/jobs.routes.ts` | Added validation for `POST /api/jobs` (body), `GET /api/jobs/:id` (params), `GET /api/download/:id` (params) |
| `src/routes/subtitle.routes.ts` | Added validation for all 9 subtitle endpoints (body, params, and query) |

## Validation Coverage

| Layer | Endpoints | What's Validated |
|-------|-----------|------------------|
| POST body | 7 endpoints | Required fields, types, lengths |
| Route params | 6 endpoints | `:id`, `:jobId` presence |
| Query params | 2 endpoints | `index` (coerced number), `filename` (optional string) |
| GET (no params) | 2 endpoints | No validation needed (`GET /`, `GET /api/voices`) |

## Validation Middleware

The `validate()` function in `src/middleware/validation.ts` accepts a `{ body?, params?, query? }` object and returns Express middleware. If any schema fails, it responds with `400` and a consistent structure:

```json
{
  "error": "Validation failed",
  "details": [
    { "field": "text", "message": "Required" }
  ]
}
```

Invalid requests are rejected **before** the controller handler runs, satisfying the "never reach controllers" requirement.

## Error Response Format

| HTTP Status | Condition | Response Shape |
|-------------|-----------|----------------|
| `400` | Zod validation failure | `{ error: "Validation failed", details: [{ field, message }] }` |
| `400` | Controller business-rule check | `{ error: "..." }` |
| `500` | Unhandled error | `{ error: "..." }` |

Business-rule validation (e.g., `isValidKhmerVoice`, `validateText`) remains in controllers. The middleware validates structural correctness (required fields, types), while controllers validate semantic correctness (valid voice, valid Khmer text).

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ Pass — zero errors |
| `tests/subtitle.test.ts` | ✅ 35/35 pass |
| Invalid POST body → 400 before controller | ✅ |
| Missing route param → 400 before controller | ✅ |
| Invalid query param → 400 before controller | ✅ |
