# Environment Variables

All configuration is read from environment variables at startup via a single Zod-validated config module (`src/config/index.ts`). Invalid values cause the server to fail immediately with a descriptive error.

---

## Server

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | `number` | `3000` | HTTP server port |

---

## Directories

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `OUTPUT_DIR` | `string` | `output` | Root output directory for generated files |
| `TEMP_DIR` | `string` | `<OUTPUT_DIR>/tmp` | Temporary working directory for short audio generation |
| `JOBS_DIR` | `string` | `<OUTPUT_DIR>/jobs` | Directory for long-running TTS jobs |
| `SUBTITLE_JOBS_DIR` | `string` | `<OUTPUT_DIR>/subtitle-jobs` | Directory for subtitle generation jobs |

Path values are resolved to absolute paths via `path.resolve()`.

---

## TTS Engine

| Variable | Type | Default | Min | Max | Description |
|----------|------|---------|-----|-----|-------------|
| `TTS_CONCURRENCY` | `number` | `5` | `1` | `20` | Maximum concurrent TTS requests |
| `MAX_RETRIES` | `number` | `3` | `0` | `10` | Retry attempts per failed TTS chunk/segment |
| `RETRY_BASE_DELAY_MS` | `number` | `2000` | `1` | — | Base delay (ms) between retries (multiplied by attempt number) |
| `CROSSFADE_MS` | `number` | `20` | `0` | `1000` | Crossfade duration (ms) when merging audio chunks |

---

## Text Limits

| Variable | Type | Default | Min | Description |
|----------|------|---------|-----|-------------|
| `MAX_TEXT_LENGTH` | `number` | `100000` | `1` | Maximum allowed text length for any request |
| `SHORT_TEXT_LIMIT` | `number` | `5000` | `1` | Maximum text length for direct `POST /api/generate` (longer text must use `POST /api/jobs`) |

---

## Upload Limits

| Variable | Type | Default | Min | Description |
|----------|------|---------|-----|-------------|
| `MAX_SRT_SIZE` | `number` | `5242880` | `1` | Maximum SRT file size in bytes (default = 5 MB) |

---

## Example `.env`

```env
PORT=3000
OUTPUT_DIR=./data
TTS_CONCURRENCY=3
MAX_RETRIES=5
MAX_SRT_SIZE=10485760
```
