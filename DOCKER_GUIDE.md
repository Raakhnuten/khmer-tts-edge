# Docker Guide

## Quick Start

```bash
# Build and start the service
docker compose up -d

# Check logs
docker compose logs -f

# The API is available at http://localhost:3000
# Swagger UI at http://localhost:3000/docs
```

## Configuration

Set environment variables in `docker-compose.yml` or pass them at runtime:

```bash
docker compose run -e PORT=4000 -e TTS_CONCURRENCY=3 app
```

All config values from `src/config/index.ts` are supported (see `.env.example`).

## Volumes

The `output/` directory is persisted in a named Docker volume `tts_output`:

| Volume mount | Contents |
|-------------|----------|
| `/app/output` | SQLite database, audio cache, job files |

### Backup

```bash
# Copy the database from the volume
docker run --rm -v tts_output:/source alpine tar -czf - -C /source . > tts_backup.tar.gz
```

## Health Checks

The container includes a health check that pings `http://localhost:3000/` every 30 seconds:

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' <container_name>
```

## Building for Production

```bash
# Build without cache
docker compose build --no-cache

# Build a specific tag
docker build -t khmer-tts:latest .
```

## Development

For development with hot reload:

```bash
# Use tsx watch in dev mode
docker compose run -e NODE_ENV=development app npx tsx watch src/server.ts
```

## Image Structure

The multi-stage Dockerfile produces a ~150MB production image:

- **Base**: `node:22-alpine` (~120MB)
- **FFmpeg**: ~20MB
- **Application**: ~10MB (compiled JS, node_modules, public assets)

No build tools (python3, make, g++) are included in the production stage.

## Troubleshooting

### Database errors
```bash
# Reset the database
docker compose down
docker volume rm khmer-tts_tts_output
docker compose up -d
```

### Permission errors
The container runs as `node` user (UID 1000). If write permissions fail:
```bash
# Check volume ownership
docker compose run app ls -la /app/output
```

### Native module errors
`better-sqlite3` must match the Node.js version at build time. The Dockerfile uses `npm ci` to lock the version.
