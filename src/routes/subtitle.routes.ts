import { Router } from 'express';
import {
  importSrt,
  createSubtitleJobHandler,
  getSubtitleJobHandler,
  generateSegments,
  getSegmentAudio,
  exportAudio,
  downloadExport,
  previewCompleted,
  getPreviewCompletedAudio,
} from '../controllers/subtitle.controller.js';
import { validate } from '../middleware/validation.js';
import { idParamsSchema } from '../validators/generate.schema.js';
import {
  importSrtBodySchema,
  createSubtitleJobBodySchema,
  generateSegmentsBodySchema,
  exportAudioBodySchema,
  previewCompletedBodySchema,
  jobIdParamsSchema,
  segmentAudioQuerySchema,
  exportDownloadQuerySchema,
} from '../validators/subtitle.schema.js';

const router = Router();

router.post('/api/subtitles/import', validate({ body: importSrtBodySchema }), importSrt);
router.post('/api/subtitles/jobs', validate({ body: createSubtitleJobBodySchema }), createSubtitleJobHandler);
router.get('/api/subtitles/jobs/:id', validate({ params: idParamsSchema }), getSubtitleJobHandler);
router.post('/api/subtitles/segments/:id/generate', validate({ body: generateSegmentsBodySchema, params: idParamsSchema }), generateSegments);
router.get('/api/subtitles/segments/:id/audio', validate({ params: idParamsSchema, query: segmentAudioQuerySchema }), getSegmentAudio);
router.post('/api/subtitles/export', validate({ body: exportAudioBodySchema }), exportAudio);
router.get('/api/subtitles/export/:id/download', validate({ params: idParamsSchema, query: exportDownloadQuerySchema }), downloadExport);
router.post('/api/subtitles/preview-completed', validate({ body: previewCompletedBodySchema }), previewCompleted);
router.get('/api/subtitles/preview-completed/:jobId', validate({ params: jobIdParamsSchema }), getPreviewCompletedAudio);

export default router;
