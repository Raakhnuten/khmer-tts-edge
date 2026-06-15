# Integration Test Guide

## Architecture

Integration tests use:
- **Vitest** — test runner (globals mode)
- **Supertest** — HTTP assertions against the Express app
- **Temp SQLite database** — isolated per test run

## How It Works

1. `beforeAll` creates a temp directory and sets `DATABASE_PATH` and `OUTPUT_DIR` env vars
2. The Express `app` module is dynamically imported (env vars are set before import)
3. `initDatabase()` creates tables in the temp database
4. Supertest makes HTTP requests to the app without starting a server (uses `app.listen` internally)
5. `afterAll` closes the database and removes the temp directory

## Key Design Decisions

### No server.ts import
Only `app.ts` is imported, not `server.ts`. This means:
- No queue worker starts (no background polling)
- No cache initialization (cache dir creation is skipped)
- Jobs remain `queued` — no automatic processing

This is intentional. Integration tests verify API contracts and error handling, not background processing. Queue processing is verified separately through unit tests of `queue.service.ts`.

### Isolated Database
Each test run uses `mkdtempSync` to create a unique temp directory:
```typescript
const testDir = mkdtempSync(join(tmpdir(), 'khmer-tts-api-test-'));
process.env.DATABASE_PATH = join(testDir, 'test.db');
```

### No shared state between tests
- Each test creates its own data through API calls
- No test depends on the side effects of another test

## Writing New Tests

```typescript
import { describe, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

let app: any;

beforeAll(async () => {
  // Setup env vars before import
  process.env.DATABASE_PATH = join(testDir, 'test.db');
  const appModule = await import('../src/app.js');
  app = appModule.default;
  await initDatabase(process.env.DATABASE_PATH);
});

it('example test', async () => {
  const res = await request(app).get('/api/voices');
  expect(res.status).toBe(200);
});
```

## Test Patterns

### Success path
```typescript
const res = await request(app).post('/api/jobs').send({ text: 'test', voice: 'km-KH-PisethNeural' });
expect(res.status).toBe(201);
expect(res.body).toHaveProperty('id');
```

### Validation error
```typescript
const res = await request(app).post('/api/generate').send({});
expect(res.status).toBe(400);
expect(res.body).toHaveProperty('success', false);
expect(res.body.error).toHaveProperty('code');
```

### Error details
```typescript
expect(res.body.error).toEqual({
  code: 'VALIDATION_ERROR',
  message: 'Validation failed',
  details: expect.arrayContaining([expect.objectContaining({ field: expect.any(String) })]),
});
```

## Coverage Targets

### Minimum coverage per module
- TTS: POST success, POST validation errors
- Jobs: POST create, GET by id, GET missing, GET download missing
- Queue: GET stats shape
- Cache: GET stats shape
- Subtitles: SRT import, job creation, export validation, preview validation
- Docs: Swagger UI, OpenAPI JSON

### Future additions
- TTS: full generation (requires Edge TTS)
- Jobs: download completed audio
- Queue: processing lifecycle
- Subtitles: segment generation, export download
