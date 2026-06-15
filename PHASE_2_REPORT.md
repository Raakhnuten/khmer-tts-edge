# Phase 2 Report — Configuration System

## Variables Discovered

The following `process.env` usages existed before Phase 2:

| Variable | Original Location | Original Default |
|----------|-------------------|-----------------|
| `PORT` | `src/config/index.ts` | `3000` |
| `OUTPUT_DIR` | `src/config/index.ts` | `resolve('output')` |
| `TEMP_DIR` | `src/config/index.ts` | `join(OUTPUT_DIR, 'tmp')` |
| `JOBS_DIR` | `src/config/index.ts` | `join(OUTPUT_DIR, 'jobs')` |
| `SUBTITLE_JOBS_DIR` | `src/config/index.ts` | `join(OUTPUT_DIR, 'subtitle-jobs')` |
| `TTS_CONCURRENCY` | `src/utils/asyncPool.ts` | `5` |

The following hardcoded constants were also moved to config (per Roadmap Phase 2 requirements):

| Constant | Original Location | Original Value |
|----------|-------------------|----------------|
| `MAX_RETRIES` | `src/generate.ts`, `src/subtitle.ts` | `3` |
| `RETRY_BASE_DELAY_MS` | `src/generate.ts`, `src/subtitle.ts` | `2000` |
| `CROSSFADE_MS` | `src/generate.ts` | `20` |
| `MAX_TEXT_LENGTH` | `src/voices.ts` | `100000` |
| `SHORT_TEXT_LIMIT` | `src/voices.ts` | `5000` |
| `MAX_SRT_SIZE` | `src/controllers/subtitle.controller.ts` | `5 * 1024 * 1024` |

---

## Validation Rules (Zod Schema)

| Key | Type | Min | Max | Required | Default |
|-----|------|-----|-----|----------|---------|
| `PORT` | `number` | `1` | — | no | `3000` |
| `OUTPUT_DIR` | `string` | — | — | no | `output` |
| `TEMP_DIR` | `string` | — | — | no | `join(OUTPUT_DIR, 'tmp')` |
| `JOBS_DIR` | `string` | — | — | no | `join(OUTPUT_DIR, 'jobs')` |
| `SUBTITLE_JOBS_DIR` | `string` | — | — | no | `join(OUTPUT_DIR, 'subtitle-jobs')` |
| `TTS_CONCURRENCY` | `number` | `1` | `20` | no | `5` |
| `MAX_RETRIES` | `number` | `0` | `10` | no | `3` |
| `RETRY_BASE_DELAY_MS` | `number` | `1` | — | no | `2000` |
| `CROSSFADE_MS` | `number` | `0` | `1000` | no | `20` |
| `MAX_TEXT_LENGTH` | `number` | `1` | — | no | `100000` |
| `SHORT_TEXT_LIMIT` | `number` | `1` | — | no | `5000` |
| `MAX_SRT_SIZE` | `number` | `1` | — | no | `5242880` |

Invalid values cause an immediate `ZodError` on module load — **fail fast**.

---

## Defaults Applied

- `OUTPUT_DIR`: defaults to `output`, then resolved to an absolute path via `path.resolve()`
- `TEMP_DIR`, `JOBS_DIR`, `SUBTITLE_JOBS_DIR`: if not set, derived from `OUTPUT_DIR`. If set, resolved to absolute path via `path.resolve()`
- All other vars: use documented defaults above

All defaults match the pre-existing hardcoded values — zero behavior change.

---

## Remaining Direct `process.env` Usage

| File | Line | Purpose |
|------|------|---------|
| `src/config/index.ts` | 26 | `env[key] = process.env[key]` — collects raw env vars for Zod parsing |

This is the **only** `process.env` access in the entire `src/` tree. It is inside the config module itself — the single source of truth for all environment configuration.

---

## Files Modified

| File | Change |
|------|--------|
| `src/config/index.ts` | Full rewrite: Zod schema + validation + typed export |
| `src/utils/asyncPool.ts` | Replaced `process.env.TTS_CONCURRENCY` with `config.ttsConcurrency` |
| `src/generate.ts` | Replaced hardcoded `MAX_RETRIES`, `RETRY_BASE_DELAY_MS`, `CROSSFADE_MS` with `config.*` |
| `src/subtitle.ts` | Replaced hardcoded `MAX_RETRIES`, `RETRY_BASE_DELAY_MS` with `config.*` |
| `src/controllers/subtitle.controller.ts` | Replaced local `MAX_SRT_SIZE` with `config.maxSrtSize` |

## Files Added

| File | Description |
|------|-------------|
| `ENVIRONMENT_VARIABLES.md` | User-facing documentation of all env vars |

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ Pass — zero errors |
| `tests/subtitle.test.ts` | ✅ 35/35 pass |
| No direct `process.env` outside config | ✅ |
