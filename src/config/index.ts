import { z } from 'zod';
import { resolve, join } from 'path';

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),

  OUTPUT_DIR: z.string().default('output'),
  TEMP_DIR: z.string().optional(),
  JOBS_DIR: z.string().optional(),
  SUBTITLE_JOBS_DIR: z.string().optional(),

  TTS_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),
  MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(2000),
  CROSSFADE_MS: z.coerce.number().int().min(0).max(1000).default(20),

  MAX_TEXT_LENGTH: z.coerce.number().int().positive().default(100000),
  SHORT_TEXT_LIMIT: z.coerce.number().int().positive().default(5000),

  MAX_SRT_SIZE: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  DATABASE_PATH: z.string().optional(),
  CACHE_DIR: z.string().optional(),
  CACHE_MAX_AGE_MS: z.coerce.number().int().positive().default(24 * 60 * 60 * 1000),
  CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(500),
  QUEUE_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  QUEUE_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
  MAX_QUEUE_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  QUEUE_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(5000),

  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_GENERATE_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_QUEUE_MAX: z.coerce.number().int().positive().default(20),
});

function loadConfig() {
  const env: Record<string, string | undefined> = {};
  for (const key of Object.keys(configSchema.shape)) {
    env[key] = process.env[key];
  }

  const parsed = configSchema.parse(env);
  const outputDir = resolve(parsed.OUTPUT_DIR);

  return {
    port: parsed.PORT,
    outputDir,
    tempDir: parsed.TEMP_DIR ? resolve(parsed.TEMP_DIR) : join(outputDir, 'tmp'),
    jobsDir: parsed.JOBS_DIR ? resolve(parsed.JOBS_DIR) : join(outputDir, 'jobs'),
    subtitleJobsDir: parsed.SUBTITLE_JOBS_DIR ? resolve(parsed.SUBTITLE_JOBS_DIR) : join(outputDir, 'subtitle-jobs'),

    ttsConcurrency: parsed.TTS_CONCURRENCY,
    maxRetries: parsed.MAX_RETRIES,
    retryBaseDelayMs: parsed.RETRY_BASE_DELAY_MS,
    crossfadeMs: parsed.CROSSFADE_MS,

    maxTextLength: parsed.MAX_TEXT_LENGTH,
    shortTextLimit: parsed.SHORT_TEXT_LIMIT,

    maxSrtSize: parsed.MAX_SRT_SIZE,
    databasePath: parsed.DATABASE_PATH ? resolve(parsed.DATABASE_PATH) : join(outputDir, 'khmer-tts.db'),
    cacheDir: parsed.CACHE_DIR ? resolve(parsed.CACHE_DIR) : join(outputDir, 'cache'),
    cacheMaxAgeMs: parsed.CACHE_MAX_AGE_MS,
    cacheMaxEntries: parsed.CACHE_MAX_ENTRIES,
    queuePollIntervalMs: parsed.QUEUE_POLL_INTERVAL_MS,
    queueConcurrency: parsed.QUEUE_CONCURRENCY,
    maxQueueRetries: parsed.MAX_QUEUE_RETRIES,
    queueRetryBaseDelayMs: parsed.QUEUE_RETRY_BASE_DELAY_MS,

    corsOrigin: parsed.CORS_ORIGIN,
    rateLimitWindowMs: parsed.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: parsed.RATE_LIMIT_MAX,
    rateLimitGenerateMax: parsed.RATE_LIMIT_GENERATE_MAX,
    rateLimitQueueMax: parsed.RATE_LIMIT_QUEUE_MAX,
  };
}

export const config = loadConfig();
export type Config = ReturnType<typeof loadConfig>;
