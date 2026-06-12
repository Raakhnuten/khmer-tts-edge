# Khmer Text-to-Speech v2.0 → 10/10 Production Roadmap

## Objective

Transform the current Khmer Text-to-Speech project from a well-structured personal project into a production-grade, maintainable, scalable, and extensible platform.

---

# Current Assessment

Current Score: **9/10**

Strengths:

- TypeScript strict mode
- Express v5
- Edge TTS integration
- Subtitle generation
- FFmpeg processing
- Resume support
- Retry mechanism
- Concurrency control
- Unit tests
- CLI + Web API

Main Weaknesses:

- Monolithic `server.ts` (607 lines)
- No validation layer
- No persistence layer
- No queue architecture
- No OpenAPI documentation
- No structured logging
- No monitoring
- No CI/CD
- No Docker support

---

# Phase 1 — Architecture Refactor

Priority: Critical

## Goal

Reduce complexity and separate responsibilities.

### Target Structure

```text
src/
├── app.ts
├── server.ts

├── routes/
│   ├── tts.routes.ts
│   ├── jobs.routes.ts
│   └── subtitle.routes.ts

├── controllers/
│   ├── tts.controller.ts
│   ├── jobs.controller.ts
│   └── subtitle.controller.ts

├── services/
│   ├── tts.service.ts
│   ├── subtitle.service.ts
│   ├── export.service.ts
│   └── job.service.ts

├── repositories/
│   └── job.repository.ts

├── middleware/
│   ├── error-handler.ts
│   └── validation.ts

├── validators/
│   ├── generate.schema.ts
│   └── subtitle.schema.ts

├── config/
│   └── index.ts

├── types/
└── utils/
```

### Success Criteria

- server.ts under 100 lines
- Routes contain no business logic
- Controllers handle requests only
- Services contain business logic

---

# Phase 2 — Configuration System

Priority: High

## Goal

Centralize all configuration.

### Create

```text
src/config/index.ts
```

### Move

- Retry count
- Concurrency
- Port
- Temp directories
- Upload limits
- Cache settings

### Requirements

- Environment validation
- Defaults
- Strong typing

Recommended:

```bash
npm install zod
```

---

# Phase 3 — Request Validation

Priority: High

## Goal

Reject invalid requests before reaching business logic.

### Implement

```text
validators/
```

### Validate

POST /api/generate

- text
- voice
- speed

POST /api/jobs

- text length
- options

Subtitle endpoints

- file size
- SRT validity

### Requirements

- Zod schemas
- Standardized error responses

---

# Phase 4 — Centralized Error Handling

Priority: High

## Goal

Consistent API responses.

### Implement

```text
middleware/error-handler.ts
```

### Response Format

```json
{
  "success": false,
  "error": {
    "code": "VOICE_NOT_FOUND",
    "message": "Voice does not exist"
  }
}
```

### Requirements

- Remove duplicated try/catch blocks
- Custom error classes
- Proper HTTP status codes

---

# Phase 5 — Structured Logging

Priority: High

## Goal

Replace console.log usage.

### Install

```bash
npm install pino pino-http
```

### Log

- Request start
- Request completion
- Job creation
- Job failure
- FFmpeg operations

### Requirements

JSON logs with:

- timestamp
- level
- requestId
- jobId
- duration

---

# Phase 6 — Persistence Layer

Priority: High

## Goal

Persist jobs across server restarts.

### Database

SQLite

### Tables

#### jobs

```sql
id
status
voice
text_hash
created_at
updated_at
```

#### files

```sql
id
job_id
path
size
duration
```

#### subtitle_projects

```sql
id
name
data
created_at
```

### Requirements

- Job history
- Recovery after restart
- Export metadata

---

# Phase 7 — Audio Cache

Priority: High

## Goal

Avoid regenerating identical audio.

### Cache Key

```text
hash(text + voice + speed)
```

### Flow

```text
Request
↓
Hash
↓
Cache exists?
├─ Yes → Return cached file
└─ No → Generate and save
```

### Requirements

- Automatic cleanup
- Cache statistics

---

# Phase 8 — Queue Architecture

Priority: High

## Goal

Support heavy workloads.

### Stack

- BullMQ
- Redis

### Architecture

```text
API
↓
Queue
↓
Worker
↓
Edge TTS
```

### Requirements

- Retry failed jobs
- Progress updates
- Concurrent workers

---

# Phase 9 — API Documentation

Priority: Medium

## Goal

Self-documenting API.

### Add

Swagger/OpenAPI

### Endpoint

```text
/api/docs
```

### Requirements

Document:

- All endpoints
- Schemas
- Error responses
- Examples

---

# Phase 10 — Integration Testing

Priority: Medium

## Goal

Test complete request flows.

### Install

```bash
npm install -D vitest supertest
```

### Test

- Generate audio
- Create jobs
- Download files
- Subtitle export
- Error handling

### Target

```text
80%+ coverage
```

---

# Phase 11 — Docker Support

Priority: Medium

## Goal

One-command deployment.

### Add

```text
Dockerfile
docker-compose.yml
.dockerignore
```

### Requirements

Container includes:

- Node.js
- FFmpeg
- Application

### Command

```bash
docker compose up -d
```

---

# Phase 12 — CI/CD

Priority: Medium

## Goal

Automatic quality checks.

### GitHub Actions

Pipeline:

```text
Install
↓
Type Check
↓
Tests
↓
Build
```

### Fail Build If

- Tests fail
- TypeScript errors exist

---

# Phase 13 — Monitoring

Priority: Medium

## Goal

Measure system health.

### Metrics

- Jobs created
- Jobs completed
- Jobs failed
- Average generation time
- Queue size
- Cache hit rate

### Endpoint

```text
/metrics
```

Optional:

- Prometheus
- Grafana

---

# Phase 14 — Provider Abstraction

Priority: Future

## Goal

Support multiple TTS engines.

### Interface

```ts
interface TTSProvider {
  generate(): Promise<Buffer>;
  getVoices(): Promise<Voice[]>;
}
```

### Implementations

- EdgeTTSProvider
- AzureTTSProvider
- GoogleTTSProvider
- OpenAITTSProvider

### Benefits

Future-proof architecture.

---

# Phase 15 — Frontend Improvements

Priority: Future

## Add

### Voice Preview

Preview before generation.

### Drag-and-Drop Upload

Drop SRT files directly.

### Dark Mode

Theme switching.

### Waveform Preview

Visual timeline.

### Recent Jobs Dashboard

Track completed generations.

### Save Projects

Save subtitle projects locally.

---

# Definition of Done (10/10)

The project reaches 10/10 when it includes:

- Modular architecture
- Validation layer
- Centralized error handling
- Structured logging
- SQLite persistence
- Audio caching
- Queue architecture
- OpenAPI documentation
- Integration testing
- Docker support
- CI/CD pipeline
- Monitoring
- Provider abstraction
- Enhanced frontend UX

Expected Outcome:

- Production-ready
- Scalable
- Maintainable
- Extensible
- Suitable for public deployment
- Suitable for SaaS evolution
