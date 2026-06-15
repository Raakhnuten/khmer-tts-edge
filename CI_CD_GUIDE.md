# CI/CD Guide

## Pipeline Overview

The project uses GitHub Actions for continuous integration. Every push to `main` and every pull request triggers the `CI` workflow.

## Workflow File

`.github/workflows/ci.yml` defines 5 parallel jobs:

1. **TypeScript Check** — `npx tsc --noEmit`
2. **Unit Tests** — `npx tsx tests/subtitle.test.ts` (35 tests)
3. **API Tests** — `npx vitest run tests/api.test.ts` (24 tests)
4. **Build** — `npx tsc` + verify `dist/server.js`
5. **Docker Build** — `docker build -t khmer-tts .`

## Local CI Simulation

```bash
# TypeScript check
npm run typecheck

# All tests
npm test

# Compile
npx tsc

# Docker build
docker build -t khmer-tts .
```

## Adding a New Job

Edit `.github/workflows/ci.yml`:

```yaml
job-name:
  name: Human-readable name
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'npm'
    - run: npm ci --legacy-peer-deps
    - run: <your-command>
```

## Caching

The workflow uses `actions/setup-node` with `cache: 'npm'` to cache `node_modules` across runs. This reduces install time from ~30s to ~5s.

## Failure Modes

| Failure | Likely Cause | Fix |
|---------|-------------|-----|
| `tsc --noEmit` fails | Type error in PR | Fix type annotations |
| Tests fail | Logic change breaks existing behavior | Update tests or fix logic |
| Build fails | Compilation error | Check `tsc` output |
| Docker build fails | Missing dependency or config error | Check `Dockerfile` |
