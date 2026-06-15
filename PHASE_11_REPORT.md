# Phase 11 — Docker — Complete

## Goal

Provide one-command deployment with multi-stage Docker build, Docker Compose, and production-ready configuration.

## Files Created

### `Dockerfile` — Multi-stage build

**Stage 1 (builder):**
- Base: `node:22-alpine`
- Installs FFmpeg + native module build tools (python3, make, g++)
- Runs `npm ci` with all dependencies
- Compiles TypeScript with `npx tsc`

**Stage 2 (production):**
- Base: `node:22-alpine`
- Installs FFmpeg only (runtime dependency)
- Copies compiled `dist/`, production `node_modules`, `public/`, and `package.json`
- Runs as non-root `node` user
- Exposes port 3000
- Health check: HTTP GET `/` every 30s
- Entry point: `node dist/server.js` (compiled JS, not tsx)

### `docker-compose.yml`

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_PATH=/app/output/khmer-tts.db
      - QUEUE_CONCURRENCY=3
      - MAX_QUEUE_RETRIES=3
      # ... all configurable env vars
    volumes:
      - tts_output:/app/output
    healthcheck: ...
    restart: unless-stopped
```

### `.dockerignore`
Excludes `node_modules`, `.git`, `dist`, `output`, `*.md`, `tests`, `.vscode`.

## Usage

```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Rebuild after changes
docker compose build --no-cache
```

## Configuration

All environment variables from `src/config/index.ts` are supported:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP server port |
| `DATABASE_PATH` | `/app/output/khmer-tts.db` | SQLite database location |
| `CACHE_DIR` | `/app/output/cache` | Audio cache directory |
| `TTS_CONCURRENCY` | 5 | Chunk-level TTS parallelism |
| `QUEUE_CONCURRENCY` | 3 | Job-level queue parallelism |
| `MAX_QUEUE_RETRIES` | 3 | Queue retry attempts |
| `QUEUE_RETRY_BASE_DELAY_MS` | 5000 | Exponential backoff base |

## Verification

- `npx tsc --noEmit`: clean (0 errors)
- `npm test`: 35 unit + 24 API tests passed
- `node dist/server.js`: compiled server starts successfully
