# Phase 1 Review — Architecture Refactor

## 1. Routes — Verify endpoints only

**Status: ✅ PASS**

All three route files are pure wiring:

| File | Lines | Content |
|------|-------|---------|
| `routes/tts.routes.ts` | 6 | `router.get/post` → controller imports only |
| `routes/jobs.routes.ts` | 7 | `router.get/post` → controller imports only |
| `routes/subtitle.routes.ts` | 23 | `router.get/post` → controller imports only |

No business logic, no middleware, no inline handlers.

---

## 2. Controllers — Verify no business logic

**Status: ⚠️ PARTIAL — 3 violations found**

### Clean handlers (pure orchestration)
- `tts.controller.getVoices` — calls `listAllVoices()`, returns JSON
- `jobs.controller.getJobHandler` — fetches from store, transforms response shape
- `jobs.controller.downloadJob` — checks status, checks file stat, streams
- `subtitle.controller.importSrt` — validates body, calls `parseSRT`, returns
- `subtitle.controller.getSubtitleJobHandler` — fetches, returns
- `subtitle.controller.getSegmentAudio` — validates params, streams file
- `subtitle.controller.getPreviewCompletedAudio` — checks stat, streams
- `subtitle.controller.downloadExport` — builds path, streams (see below)

### Violations

**1. `tts.controller.generateHandler` (lines 46–58) — manages the full generate workflow**

The handler owns: creating temp directory, calling `generateAudio`, reading the result, cleaning up files. This orchestration (create → generate → read → cleanup) is business logic that belongs in a service.

Original code had the same pattern — faithfully migrated, but still a smell.

**2. `subtitle.controller.createSubtitleJob` (lines 57–68) — contains segment mapping with business rules**

```ts
const segs = segments.map((s, i) => ({
  voice: KHMER_VOICES_LIST.includes(s.voice) ? s.voice : KHMER_VOICES_LIST[0],
  ...
}));
```

The voice-defaulting rule (`|| KHMER_VOICES_LIST[0]`) is a business decision embedded in the controller.

**3. `subtitle.controller.generateSegments` (lines 105–113) — inline segment update logic**

```ts
for (const us of updatedSegments) {
  const target = job.segments.find((s) => s.index === us.index);
  if (target) {
    if (us.text !== undefined) target.text = us.text;
    if (us.voice !== undefined) target.voice = us.voice;
  }
}
```

This mutation logic should live in a service, not the controller.

---

## 3. Services — Verify own all business logic

**Status: ✅ PASS for existing logic**

| Service | Role | Business logic |
|---------|------|----------------|
| `job.service.ts` | In-memory job store | CRUD, age-based cleanup |
| `tts.service.ts` | TTS background worker | `processJob`: creates dir, calls `generateAudio` with progress, updates job state |
| `subtitle.service.ts` | Subtitle job store + processing | `processSubtitleSegments`: concurrent segment generation with retry, status aggregation, metadata persistence + `cleanupSubtitleJobs`: age-based cleanup with file deletion |

All three services correctly own data access and domain operations.

---

## 4. Architectural Smells

### Critical

| # | Smell | Location | Impact |
|---|-------|----------|--------|
| S1 | **Dead code**: `updateSubtitleJob` defined but never called | `services/subtitle.service.ts:16` | Dead export, controller mutates job objects directly via reference instead |
| S2 | **Missing `export.service.ts`** | Roadmap target not created | Export operation logic (calling `exportFinalAudio`/`buildTimelineAudio`) lives in `subtitle.controller.ts` instead of a dedicated service |
| S3 | **Controller is too large** | `subtitle.controller.ts` — 255 lines | Handles 9 endpoints mixing validation, business logic, and response formatting |
| S4 | **Inconsistent streaming** | `subtitle.controller.ts:217` | `downloadExport` uses raw `createReadStream` instead of the `streamFile` utility. Original code did the same — missed opportunity to standardize |

### Moderate

| # | Smell | Location | Impact |
|---|-------|----------|--------|
| S5 | **Try/catch duplication** | 13 try/catch across 3 controllers | Every handler has `catch (err: any) { res.status(500).json({ error: err.message }) }`. Cries out for `error-handler.ts` middleware |
| S6 | **Controller contains orchestration** | `tts.controller.ts:46-58` | The generate workflow (create dir → generate → read file → cleanup) is managed in the controller, not a service |
| S7 | **No error-handler middleware** | Roadmap Phase 4 target | Centralized error response format not implemented |
| S8 | **`streamFile` uses `res: any`** | `utils/stream.ts:4` | Loses Express `Response` type safety |

### Minor

| # | Smell | Location | Impact |
|---|-------|----------|--------|
| S9 | **`sanitizeFilename` is controller-private** | `subtitle.controller.ts:14-20` | Cannot be reused. Should live in a utility module |
| S10 | **`KHMER_VOICES_LIST` duplicated** | `subtitle.controller.ts:12` | Already defined as a Set in `voices.ts`. Should export from canonical source |
| S11 | **`MAX_SRT_SIZE` is controller-private** | `subtitle.controller.ts:11` | Configuration constant, belongs in `config/index.ts` |
| S12 | **Config has no validation** | `config/index.ts` | No env validation (deferred to Phase 2) |
| S13 | **No structured logging** | `app.ts:17-25` | Uses `console.log` directly (Phase 5 target) |
| S14 | **In-memory state is ephemeral** | `job.service.ts`, `subtitle.service.ts` | Jobs lost on restart (Phase 6 target) |
| S15 | **`app.ts` serves `GET /` directly** | `app.ts:27` | Inline route handler in app setup, not in a route file |

---

## 5. Suggested Improvements (no code changes)

### Immediately actionable

1. **Remove dead code** — Delete the unused `updateSubtitleJob` export from `services/subtitle.service.ts`. The controller mutates job objects via reference, which is the established pattern from the original code.

2. **Standardize streaming** — Replace the raw `createReadStream` in `downloadExport` with the `streamFile` utility for consistent error handling and headers.

3. **Move `sanitizeFilename` to a utility** — Extract to `utils/helpers.ts` or a new `utils/string.ts` for reuse.

4. **Export `KHMER_VOICES_LIST` from `voices.ts`** — Add an array export alongside the existing Set to eliminate duplication.

5. **Move `MAX_SRT_SIZE` to config** — Belongs in `config/index.ts` as a configuration constant.

### Phase 2+ alignment

6. **Create `services/export.service.ts`** (Phase 2/Roadmap target) — Extract the export orchestration from `subtitle.controller.ts`. Move `exportAudio` and `previewCompleted` workflow logic into a dedicated export service.

7. **Extract `tts.service.ts` generate workflow** — Move the temp-dir lifecycle (create → generate → read → cleanup) into `services/tts.service.ts` so `generateHandler` just validates and delegates.

8. **Centralize error handling** (Phase 4) — Create `middleware/error-handler.ts`. Remove all per-handler try/catch blocks. Introduce custom error classes.

9. **Add structured logging** (Phase 5) — Replace `console.log` in `app.ts` with `pino`/`pino-http`.

10. **Restructure `app.ts`** — Move `GET /` to a dedicated route file so `app.ts` only does middleware + route mounting.

### Architecture-level

11. **Introduce a `subtitle.service.ts` segment update method** — Rather than the controller mutating `job.segments` directly, add a method `updateSegment(jobId, index, updates)` to centralize mutation logic and eliminate the dead `updateSubtitleJob`.

12. **Type `streamFile` response properly** — Change `res: any` to `res: Response` for type safety.

---

## Summary

| Criterion | Verdict |
|-----------|---------|
| Routes wire-only | ✅ Pass |
| Controllers request-only | ⚠️ 3 violations (S6, S2/S3 in part) |
| Services own business logic | ✅ Pass |
| `server.ts` < 100 lines | ✅ 15 lines |
| No functionality changed | ✅ Tests 35/35 pass, typecheck clean |
| Architectural smells | 15 identified (4 critical, 5 moderate, 6 minor) |
