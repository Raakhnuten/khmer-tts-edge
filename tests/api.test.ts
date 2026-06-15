import { describe, it, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initDatabase, closeDatabase } from '../src/database/index.js';

let app: any;
let testDir: string;
let dbPath: string;

beforeAll(async () => {
  testDir = mkdtempSync(join(tmpdir(), 'khmer-tts-api-test-'));
  dbPath = join(testDir, 'test.db');

  process.env.DATABASE_PATH = dbPath;
  process.env.OUTPUT_DIR = testDir;
  process.env.CACHE_DIR = join(testDir, 'cache');
  process.env.QUEUE_POLL_INTERVAL_MS = '100';
  process.env.NODE_ENV = 'development';

  const appModule = await import('../src/app.js');
  app = appModule.default;

  await initDatabase(dbPath);
});

afterAll(() => {
  closeDatabase();
  if (testDir) rmSync(testDir, { recursive: true, force: true });
  delete process.env.DATABASE_PATH;
  delete process.env.OUTPUT_DIR;
  delete process.env.CACHE_DIR;
  delete process.env.QUEUE_POLL_INTERVAL_MS;
  delete process.env.NODE_ENV;
});

describe('OpenAPI docs', () => {
  it('serves Swagger UI at /docs', async () => {
    const res = await request(app).get('/docs/').redirects(1);
    // Should get HTML with swagger-ui content
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger');
  });

  it('serves OpenAPI spec at /openapi.json', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('openapi', '3.1.0');
    expect(res.body).toHaveProperty('info.title', 'Khmer Text-to-Speech API');
  });
});

describe('GET /api/voices', () => {
  it('returns a list of voices', async () => {
    const res = await request(app).get('/api/voices');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/generate', () => {
  it('returns 400 for missing text', async () => {
    const res = await request(app)
      .post('/api/generate')
      .send({ voice: 'km-KH-PisethNeural' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('success', false);
  });

  it('returns 400 for missing voice', async () => {
    const res = await request(app)
      .post('/api/generate')
      .send({ text: 'សួស្តី' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('success', false);
  });

  it('returns 400 for invalid voice', async () => {
    const res = await request(app)
      .post('/api/generate')
      .send({ text: 'សួស្តី', voice: 'invalid-voice' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'INVALID_VOICE', message: expect.any(String) },
    });
  });
});

describe('POST /api/jobs', () => {
  it('creates a job and returns 201 with id', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({ text: 'សួស្តី', voice: 'km-KH-PisethNeural' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(typeof res.body.id).toBe('string');
  });

  it('returns 400 for empty text', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({ text: '', voice: 'km-KH-PisethNeural' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('success', false);
  });

  it('returns 400 for missing voice', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({ text: 'test' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('success', false);
  });
});

describe('GET /api/jobs/:id', () => {
  it('returns 404 for non-existent job', async () => {
    const res = await request(app).get('/api/jobs/non-existent-id');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'JOB_NOT_FOUND', message: 'Job not found' },
    });
  });

  it('returns job details after creation', async () => {
    const createRes = await request(app)
      .post('/api/jobs')
      .send({ text: 'សួស្តី', voice: 'km-KH-PisethNeural' });
    const jobId = createRes.body.id;

    const res = await request(app).get(`/api/jobs/${jobId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', jobId);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('progress');
    expect(res.body).toHaveProperty('createdAt');
  });
});

describe('GET /api/download/:id', () => {
  it('returns 404 for non-existent job', async () => {
    const res = await request(app).get('/api/download/non-existent');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/queue/stats', () => {
  it('returns queue statistics', async () => {
    const res = await request(app).get('/api/queue/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('queued');
    expect(res.body).toHaveProperty('processing');
    expect(res.body).toHaveProperty('completed');
    expect(res.body).toHaveProperty('failed');
    expect(res.body).toHaveProperty('retries');
    expect(typeof res.body.queued).toBe('number');
  });
});

describe('GET /api/cache/stats', () => {
  it('returns cache statistics', async () => {
    const res = await request(app).get('/api/cache/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('hits');
    expect(res.body).toHaveProperty('misses');
    expect(res.body).toHaveProperty('size');
    expect(res.body).toHaveProperty('entries');
  });
});

describe('POST /api/subtitles/import', () => {
  it('parses valid SRT', async () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\nHello\n\n';
    const res = await request(app)
      .post('/api/subtitles/import')
      .send({ srt });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('segments');
    expect(res.body.segments.length).toBeGreaterThan(0);
  });

  it('returns 400 for empty SRT', async () => {
    const res = await request(app)
      .post('/api/subtitles/import')
      .send({ srt: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing SRT field', async () => {
    const res = await request(app)
      .post('/api/subtitles/import')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/subtitles/jobs', () => {
  it('creates subtitle job from segments', async () => {
    const segments = [
      { startTime: 0, endTime: 1000, text: 'Hello' },
    ];
    const res = await request(app)
      .post('/api/subtitles/jobs')
      .send({ segments });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('returns 400 for empty segments', async () => {
    const res = await request(app)
      .post('/api/subtitles/jobs')
      .send({ segments: [] });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/subtitles/export', () => {
  it('returns 400 for missing jobId', async () => {
    const res = await request(app)
      .post('/api/subtitles/export')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent job', async () => {
    const res = await request(app)
      .post('/api/subtitles/export')
      .send({ jobId: 'non-existent' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/subtitles/preview-completed', () => {
  it('returns 400 for missing jobId', async () => {
    const res = await request(app)
      .post('/api/subtitles/preview-completed')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/health', () => {
  it('returns liveness status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('uptime');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body).toHaveProperty('timestamp');
  });
});

describe('GET /api/ready', () => {
  it('returns readiness status with checks', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('checks');
    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks).toHaveProperty('cache');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
  });
});

describe('GET /api/metrics', () => {
  it('returns runtime metrics', async () => {
    const res = await request(app).get('/api/metrics');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('memory');
    expect(res.body.memory).toHaveProperty('rss');
    expect(res.body.memory).toHaveProperty('heapUsed');
    expect(res.body).toHaveProperty('cache');
    expect(res.body.cache).toHaveProperty('hits');
    expect(res.body.cache).toHaveProperty('misses');
    expect(res.body.cache).toHaveProperty('ratio');
    expect(res.body).toHaveProperty('queue');
    expect(res.body.queue).toHaveProperty('queued');
    expect(res.body.queue).toHaveProperty('processing');
    expect(res.body.queue).toHaveProperty('completed');
    expect(res.body.queue).toHaveProperty('failed');
    expect(res.body.queue).toHaveProperty('retries');
  });
});

describe('Error responses', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/unknown-route');
    expect(res.status).toBe(404);
  });

  it('returns validation error for invalid body', async () => {
    const res = await request(app)
      .post('/api/generate')
      .send({ text: 123, voice: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error).toHaveProperty('details');
  });
});
