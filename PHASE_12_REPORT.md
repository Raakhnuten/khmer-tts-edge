# Phase 12 — CI/CD — Complete

## Goal

Add GitHub Actions workflow for automatic quality checks on every push and pull request.

## Files Created

### `.github/workflows/ci.yml`

**Workflow: `CI`**

**Triggers:**
- `push` to `main`
- `pull_request` to `main`

**Environment:**
- Node.js 22
- npm cache enabled

**Jobs (5 parallel stages):**

| Job | Command | Purpose |
|-----|---------|---------|
| `typecheck` | `npx tsc --noEmit` | TypeScript strict mode verification |
| `test-unit` | `npx tsx tests/subtitle.test.ts` | 35 subtitle unit tests |
| `test-api` | `npx vitest run tests/api.test.ts` | 24 API integration tests |
| `build` | `npx tsc` + verify `dist/server.js` exists | Compile TypeScript to JS |
| `docker` | `docker build -t khmer-tts .` | Validate Docker image builds |

**Fail conditions:**
- Any job failure blocks the pipeline
- TypeScript errors → fail
- Test failures → fail
- Build output missing → fail
- Docker build fails → fail

## Pipeline Flow

```
Push/PR → main
    │
    ├── typecheck (tsc --noEmit)
    ├── test-unit (35 unit tests)
    ├── test-api  (24 API tests)
    ├── build     (tsc + dist/ verification)
    └── docker    (docker build)
```

All 5 jobs run in parallel for fast feedback.

## Verification

- `npx tsc --noEmit`: clean (0 errors)
- `npm test`: 35 unit + 24 API tests passed
- `npx tsc`: compiles successfully, `dist/server.js` verified
