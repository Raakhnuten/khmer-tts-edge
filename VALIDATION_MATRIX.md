# Validation Matrix

## Legend

| Symbol | Meaning |
|--------|---------|
| `B` | Body field |
| `P` | Route parameter |
| `Q` | Query parameter |
| `*` | Required |
| `~` | Optional |

---

## TTS Endpoints

### `GET /api/voices`

No validation required.

---

### `POST /api/generate`

| Field | Layer | Req | Type | Validation Rules |
|-------|-------|-----|------|------------------|
| `text` | B | * | `string` | `min(1)` — must not be empty |
| `voice` | B | * | `string` | `min(1)` — must not be empty |

**Error response (validation):** `400`
```json
{
  "error": "Validation failed",
  "details": [
    { "field": "text", "message": "Required" }
  ]
}
```

**Business rules enforced by controller (not middleware):**
- `validateText(text)` — checks for Khmer characters, max length
- `isValidKhmerVoice(voice)` — must be `km-KH-PisethNeural` or `km-KH-SreymomNeural`
- `text.length > SHORT_TEXT_LIMIT` — must use `/api/jobs` for long text

---

## Job Endpoints

### `POST /api/jobs`

| Field | Layer | Req | Type | Validation Rules |
|-------|-------|-----|------|------------------|
| `text` | B | * | `string` | `min(1)` — must not be empty |
| `voice` | B | * | `string` | `min(1)` — must not be empty |

**Error response (validation):** `400`
```json
{
  "error": "Validation failed",
  "details": [
    { "field": "voice", "message": "Required" }
  ]
}
```

**Business rules enforced by controller:**
- `validateText(text)` — checks for Khmer characters, max length
- `isValidKhmerVoice(voice)` — must be a valid Khmer voice

---

### `GET /api/jobs/:id`

| Field | Layer | Req | Type | Validation Rules |
|-------|-------|-----|------|------------------|
| `id` | P | * | `string` | `min(1)` — must not be empty |

**Error response (validation):** `400`
```json
{
  "error": "Validation failed",
  "details": [
    { "field": "id", "message": "id is required" }
  ]
}
```

---

### `GET /api/download/:id`

| Field | Layer | Req | Type | Validation Rules |
|-------|-------|-----|------|------------------|
| `id` | P | * | `string` | `min(1)` — must not be empty |

---

## Subtitle Endpoints

### `POST /api/subtitles/import`

| Field | Layer | Req | Type | Validation Rules |
|-------|-------|-----|------|------------------|
| `srt` | B | * | `string` | `min(1)` — must not be empty |

**Business rules enforced by controller:**
- `srt.length > MAX_SRT_SIZE` — upload size limit
- `parseSRT(srt).length === 0` — no valid subtitle blocks found

---

### `POST /api/subtitles/jobs`

| Field | Layer | Req | Type | Validation Rules |
|-------|-------|-----|------|------------------|
| `segments` | B | * | `array` | `min(1)` — at least one segment |
| `segments[].startTime` | B | ~ | `number` | — |
| `segments[].endTime` | B | ~ | `number` | — |
| `segments[].text` | B | ~ | `string` | — |
| `segments[].voice` | B | ~ | `string` | — |

---

### `GET /api/subtitles/jobs/:id`

| Field | Layer | Req | Type | Validation Rules |
|-------|-------|-----|------|------------------|
| `id` | P | * | `string` | `min(1)` — must not be empty |

---

### `POST /api/subtitles/segments/:id/generate`

| Field | Layer | Req | Type | Validation Rules |
|-------|-------|-----|------|------------------|
| `id` | P | * | `string` | `min(1)` — must not be empty |
| `indices` | B | * | `array` | `min(1)` — at least one index |
| `indices[]` | B | * | `number` | — |
| `segments` | B | ~ | `array` | Optional |
| `segments[].index` | B | * | `number` | — |
| `segments[].text` | B | ~ | `string` | — |
| `segments[].voice` | B | ~ | `string` | — |

---

### `GET /api/subtitles/segments/:id/audio`

| Field | Layer | Req | Type | Validation Rules |
|-------|-------|-----|------|------------------|
| `id` | P | * | `string` | `min(1)` — must not be empty |
| `index` | Q | * | `number` | `int`, `min(0)` — coerced from string |

---

### `POST /api/subtitles/export`

| Field | Layer | Req | Type | Validation Rules |
|-------|-------|-----|------|------------------|
| `jobId` | B | * | `string` | `min(1)` — must not be empty |
| `filename` | B | ~ | `string` | — |
| `gapMode` | B | ~ | `"subtitle"` | Literal value only |
| `smoothMerge` | B | ~ | `boolean` | — |
| `crossfadeMs` | B | ~ | `number` | `int`, `min(0)` |

---

### `GET /api/subtitles/export/:id/download`

| Field | Layer | Req | Type | Validation Rules |
|-------|-------|-----|------|------------------|
| `id` | P | * | `string` | `min(1)` — must not be empty |
| `filename` | Q | ~ | `string` | — |

---

### `POST /api/subtitles/preview-completed`

| Field | Layer | Req | Type | Validation Rules |
|-------|-------|-----|------|------------------|
| `jobId` | B | * | `string` | `min(1)` — must not be empty |
| `gapMode` | B | ~ | `"subtitle"` | Literal value only |
| `smoothMerge` | B | ~ | `boolean` | — |
| `crossfadeMs` | B | ~ | `number` | `int`, `min(0)` |

---

### `GET /api/subtitles/preview-completed/:jobId`

| Field | Layer | Req | Type | Validation Rules |
|-------|-------|-----|------|------------------|
| `jobId` | P | * | `string` | `min(1)` — must not be empty |

---

## Summary

| Endpoint | Body | Params | Query |
|----------|------|--------|-------|
| `GET /` | — | — | — |
| `GET /api/voices` | — | — | — |
| `POST /api/generate` | ✅ | — | — |
| `POST /api/jobs` | ✅ | — | — |
| `GET /api/jobs/:id` | — | ✅ | — |
| `GET /api/download/:id` | — | ✅ | — |
| `POST /api/subtitles/import` | ✅ | — | — |
| `POST /api/subtitles/jobs` | ✅ | — | — |
| `GET /api/subtitles/jobs/:id` | — | ✅ | — |
| `POST /api/subtitles/segments/:id/generate` | ✅ | ✅ | — |
| `GET /api/subtitles/segments/:id/audio` | — | ✅ | ✅ |
| `POST /api/subtitles/export` | ✅ | — | — |
| `GET /api/subtitles/export/:id/download` | — | ✅ | ✅ |
| `POST /api/subtitles/preview-completed` | ✅ | — | — |
| `GET /api/subtitles/preview-completed/:jobId` | — | ✅ | — |

**Validation coverage:** 13/15 endpoints validated. 2/15 require no validation (`GET /`, `GET /api/voices`).
