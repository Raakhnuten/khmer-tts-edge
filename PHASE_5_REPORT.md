# Phase 5: Structured Logging — Complete

## Goal
Replace all `console.log`/`console.error`/`console.warn` usage with [Pino](https://getpino.io) structured JSON logging, add request-scoped logging with unique request IDs, and log key lifecycle events for TTS generation and subtitle export.

## Changes

### Dependencies added
| Package | Version | Purpose |
|---------|---------|---------|
| `pino` | ^10.3.1 | Fast structured JSON logger |
| `pino-http` | ^11.0.0 | Express middleware for automatic HTTP request/response logging |
| `pino-pretty` | ^13.1.3 | Human-readable log output in development and CLI mode |

### New files
| File | Purpose |
|------|---------|
| `src/logger.ts` | Shared pino instance; pretty-print in `development`, JSON in production; level configurable via `LOG_LEVEL` env var (default: `info`) |
| `src/middleware/request-logger.ts` | pino-http middleware that generates a UUID `req.id` for every request and logs start/completion |

### Modified files

| File | What changed |
|------|-------------|
| `src/app.ts` | Replaced manual logging middleware with `requestLogger` |
| `src/server.ts` | `console.log` → `logger.info` |
| `src/middleware/error-handler.ts` | `console.error` → `logger.error`/`logger.warn` with error context and `requestId` |
| `src/generate.ts` | 6 `console.*` calls + 1 `process.stdout.write` → `logger.info/warn/error` with chunk context |
| `src/subtitle.ts` | 1 `console.warn` + 1 `console.log` → `logger.warn`/`logger.info` |
| `src/index.ts` | CLI entry point uses separate pino + pino-pretty instance for human-readable output |
| `src/services/tts.service.ts` | Added lifecycle logging: job start, chunk failure, job complete/fail |
| `src/services/subtitle.service.ts` | Added lifecycle logging: job creation, segment generation start/finish |
| `src/services/export.service.ts` | Added lifecycle logging: export complete with file size |
| `src/services/job.service.ts` | Added lifecycle logging: job creation, status transitions, cleanup |

### Removed console calls
- All 26 `console.*` / `process.stdout.write` calls in server-side code are replaced.
- `src/voices.ts` `printVoices()` retains `console.log` — it is a CLI display function for end-user tables, not operational logging.

## Verification
- `npx tsc --noEmit` — passes
- `npx tsx tests/subtitle.test.ts` — all 35 tests pass

## How to run
```bash
# Development (pretty-printed, colorized)
NODE_ENV=development npm run serve

# Production (JSON lines, pipeable)
npm run serve

# Override log level
LOG_LEVEL=debug npm run serve
```
