export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Khmer Text-to-Speech API',
    version: '2.0.0',
    description: 'Convert Khmer text to natural-sounding speech using Microsoft Edge TTS. Supports direct generation, long-form job processing, subtitle workflows, and audio caching.',
  },
  servers: [{ url: '/', description: 'Local development' }],
  paths: {
    '/api/health': {
      get: {
        tags: ['Observability'],
        summary: 'Liveness check',
        operationId: 'healthCheck',
        responses: {
          '200': {
            description: 'Service is alive',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } },
          },
        },
      },
    },
    '/api/ready': {
      get: {
        tags: ['Observability'],
        summary: 'Readiness check',
        operationId: 'readinessCheck',
        responses: {
          '200': { description: 'Service is ready', content: { 'application/json': { schema: { $ref: '#/components/schemas/ReadinessResponse' } } } },
          '503': { description: 'Service is not ready', content: { 'application/json': { schema: { $ref: '#/components/schemas/ReadinessResponse' } } } },
        },
      },
    },
    '/api/metrics': {
      get: {
        tags: ['Observability'],
        summary: 'Get runtime metrics',
        operationId: 'getMetrics',
        responses: {
          '200': {
            description: 'Runtime metrics',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MetricsResponse' } } },
          },
        },
      },
    },
    '/api/voices': {
      get: {
        tags: ['TTS'],
        summary: 'List available voices',
        operationId: 'listVoices',
        responses: {
          '200': {
            description: 'Array of available voice objects',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Voice' } } } },
          },
        },
      },
    },
    '/api/generate': {
      post: {
        tags: ['TTS'],
        summary: 'Generate short audio directly',
        operationId: 'generateAudio',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/GenerateRequest' } } },
        },
        responses: {
          '200': { description: 'MP3 audio binary', content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } } },
          '400': { $ref: '#/components/responses/Error400' },
          '500': { $ref: '#/components/responses/Error500' },
        },
      },
    },
    '/api/jobs': {
      post: {
        tags: ['Jobs'],
        summary: 'Create a long-form TTS job',
        operationId: 'createJob',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateJobRequest' } } },
        },
        responses: {
          '201': { description: 'Job created', content: { 'application/json': { schema: { $ref: '#/components/schemas/JobCreatedResponse' } } } },
          '400': { $ref: '#/components/responses/Error400' },
          '500': { $ref: '#/components/responses/Error500' },
        },
      },
    },
    '/api/jobs/{id}': {
      get: {
        tags: ['Jobs'],
        summary: 'Get job status and progress',
        operationId: 'getJob',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Job details', content: { 'application/json': { schema: { $ref: '#/components/schemas/JobStatusResponse' } } } },
          '404': { $ref: '#/components/responses/Error404' },
        },
      },
    },
    '/api/download/{id}': {
      get: {
        tags: ['Jobs'],
        summary: 'Download completed job audio',
        operationId: 'downloadJob',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'MP3 audio binary (attachment)', content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } } },
          '400': { $ref: '#/components/responses/Error400' },
          '404': { $ref: '#/components/responses/Error404' },
          '500': { $ref: '#/components/responses/Error500' },
        },
      },
    },
    '/api/queue/stats': {
      get: {
        tags: ['Queue'],
        summary: 'Get queue statistics',
        operationId: 'getQueueStats',
        responses: {
          '200': { description: 'Queue statistics', content: { 'application/json': { schema: { $ref: '#/components/schemas/QueueStats' } } } },
        },
      },
    },
    '/api/cache/stats': {
      get: {
        tags: ['Cache'],
        summary: 'Get cache statistics',
        operationId: 'getCacheStats',
        responses: {
          '200': { description: 'Cache statistics', content: { 'application/json': { schema: { $ref: '#/components/schemas/CacheStats' } } } },
        },
      },
    },
    '/api/subtitles/import': {
      post: {
        tags: ['Subtitles'],
        summary: 'Parse SRT content into segments',
        operationId: 'importSrt',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ImportSrtRequest' } } },
        },
        responses: {
          '200': { description: 'Parsed segments', content: { 'application/json': { schema: { $ref: '#/components/schemas/ImportSrtResponse' } } } },
          '400': { $ref: '#/components/responses/Error400' },
          '500': { $ref: '#/components/responses/Error500' },
        },
      },
    },
    '/api/subtitles/jobs': {
      post: {
        tags: ['Subtitles'],
        summary: 'Create a subtitle job',
        operationId: 'createSubtitleJob',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateSubtitleJobRequest' } } },
        },
        responses: {
          '201': { description: 'Subtitle job created', content: { 'application/json': { schema: { $ref: '#/components/schemas/JobCreatedResponse' } } } },
          '400': { $ref: '#/components/responses/Error400' },
          '500': { $ref: '#/components/responses/Error500' },
        },
      },
    },
    '/api/subtitles/jobs/{id}': {
      get: {
        tags: ['Subtitles'],
        summary: 'Get subtitle job details',
        operationId: 'getSubtitleJob',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Subtitle job data', content: { 'application/json': { schema: { $ref: '#/components/schemas/SubtitleJobData' } } } },
          '404': { $ref: '#/components/responses/Error404' },
        },
      },
    },
    '/api/subtitles/segments/{id}/generate': {
      post: {
        tags: ['Subtitles'],
        summary: 'Generate audio for subtitle segments',
        operationId: 'generateSegments',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/GenerateSegmentsRequest' } } },
        },
        responses: {
          '200': { description: 'Generation started', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' }, jobId: { type: 'string' } } } } } },
          '400': { $ref: '#/components/responses/Error400' },
          '404': { $ref: '#/components/responses/Error404' },
          '500': { $ref: '#/components/responses/Error500' },
        },
      },
    },
    '/api/subtitles/segments/{id}/audio': {
      get: {
        tags: ['Subtitles'],
        summary: 'Get individual segment audio',
        operationId: 'getSegmentAudio',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'index', in: 'query', required: true, schema: { type: 'integer', minimum: 0 } },
        ],
        responses: {
          '200': { description: 'Segment MP3 audio', content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } } },
          '400': { $ref: '#/components/responses/Error400' },
          '404': { $ref: '#/components/responses/Error404' },
          '500': { $ref: '#/components/responses/Error500' },
        },
      },
    },
    '/api/subtitles/export': {
      post: {
        tags: ['Subtitles'],
        summary: 'Export subtitle project as final audio',
        operationId: 'exportAudio',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ExportAudioRequest' } } },
        },
        responses: {
          '200': { description: 'Export result', content: { 'application/json': { schema: { $ref: '#/components/schemas/ExportAudioResponse' } } } },
          '400': { $ref: '#/components/responses/Error400' },
          '404': { $ref: '#/components/responses/Error404' },
          '500': { $ref: '#/components/responses/Error500' },
        },
      },
    },
    '/api/subtitles/export/{id}/download': {
      get: {
        tags: ['Subtitles'],
        summary: 'Download exported audio file',
        operationId: 'downloadExport',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'filename', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Exported MP3 audio (attachment)', content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } } },
          '404': { $ref: '#/components/responses/Error404' },
          '500': { $ref: '#/components/responses/Error500' },
        },
      },
    },
    '/api/subtitles/preview-completed': {
      post: {
        tags: ['Subtitles'],
        summary: 'Preview completed segments',
        operationId: 'previewCompleted',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/PreviewCompletedRequest' } } },
        },
        responses: {
          '200': { description: 'Preview metadata', content: { 'application/json': { schema: { $ref: '#/components/schemas/PreviewCompletedResponse' } } } },
          '400': { $ref: '#/components/responses/Error400' },
          '404': { $ref: '#/components/responses/Error404' },
          '500': { $ref: '#/components/responses/Error500' },
        },
      },
    },
    '/api/subtitles/preview-completed/{jobId}': {
      get: {
        tags: ['Subtitles'],
        summary: 'Get preview audio',
        operationId: 'getPreviewAudio',
        parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Preview MP3 audio', content: { 'audio/mpeg': { schema: { type: 'string', format: 'binary' } } } },
          '404': { $ref: '#/components/responses/Error404' },
          '500': { $ref: '#/components/responses/Error500' },
        },
      },
    },
  },
  components: {
    schemas: {
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok'] },
          uptime: { type: 'integer', description: 'Seconds since server start' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      ReadinessResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ok', 'degraded', 'down'] },
          checks: {
            type: 'object',
            properties: {
              database: { type: 'string', enum: ['ok', 'error'] },
              cache: { type: 'string', enum: ['ok', 'error'] },
            },
          },
          uptime: { type: 'integer' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      MetricsResponse: {
        type: 'object',
        properties: {
          uptime: { type: 'integer' },
          timestamp: { type: 'string', format: 'date-time' },
          memory: {
            type: 'object',
            properties: {
              rss: { type: 'integer' },
              heapUsed: { type: 'integer' },
              heapTotal: { type: 'integer' },
              external: { type: 'integer' },
            },
          },
          cache: {
            type: 'object',
            properties: {
              hits: { type: 'integer' },
              misses: { type: 'integer' },
              ratio: { type: 'string' },
            },
          },
          queue: {
            type: 'object',
            properties: {
              queued: { type: 'integer' },
              processing: { type: 'integer' },
              completed: { type: 'integer' },
              failed: { type: 'integer' },
              retries: { type: 'integer' },
            },
          },
        },
      },
      Voice: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          locale: { type: 'string' },
        },
      },
      GenerateRequest: {
        type: 'object',
        required: ['text', 'voice'],
        properties: {
          text: { type: 'string', minLength: 1, description: 'Khmer text to synthesize (max 5000 characters)' },
          voice: { type: 'string', description: 'Voice ID, e.g. km-KH-PisethNeural or km-KH-SreymomNeural' },
        },
      },
      CreateJobRequest: {
        type: 'object',
        required: ['text', 'voice'],
        properties: {
          text: { type: 'string', minLength: 1, description: 'Khmer text to synthesize (up to 100000 characters)' },
          voice: { type: 'string', description: 'Voice ID, e.g. km-KH-PisethNeural or km-KH-SreymomNeural' },
        },
      },
      JobCreatedResponse: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      JobStatusResponse: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['queued', 'processing', 'completed', 'failed'] },
          progress: { type: 'integer', minimum: 0, maximum: 100 },
          currentChunk: { type: 'integer' },
          totalChunks: { type: 'integer' },
          error: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      QueueStats: {
        type: 'object',
        properties: {
          queued: { type: 'integer' },
          processing: { type: 'integer' },
          completed: { type: 'integer' },
          failed: { type: 'integer' },
          retries: { type: 'integer' },
        },
      },
      CacheStats: {
        type: 'object',
        properties: {
          hits: { type: 'integer' },
          misses: { type: 'integer' },
          size: { type: 'integer' },
          entries: { type: 'integer' },
        },
      },
      ImportSrtRequest: {
        type: 'object',
        required: ['srt'],
        properties: {
          srt: { type: 'string', description: 'SRT subtitle content' },
        },
      },
      ImportSrtResponse: {
        type: 'object',
        properties: {
          segments: { type: 'array', items: { $ref: '#/components/schemas/SubtitleSegmentInput' } },
        },
      },
      SubtitleSegmentInput: {
        type: 'object',
        properties: {
          startTime: { type: 'number' },
          endTime: { type: 'number' },
          text: { type: 'string' },
          voice: { type: 'string' },
        },
      },
      CreateSubtitleJobRequest: {
        type: 'object',
        required: ['segments'],
        properties: {
          segments: { type: 'array', items: { $ref: '#/components/schemas/SubtitleSegmentInput' }, minItems: 1 },
        },
      },
      SubtitleSegmentData: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          startTime: { type: 'number' },
          endTime: { type: 'number' },
          text: { type: 'string' },
          voice: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'generating', 'completed', 'failed'] },
          generatedDuration: { type: 'number', nullable: true },
          speedRatio: { type: 'number', nullable: true },
          error: { type: 'string', nullable: true },
        },
      },
      SubtitleJobData: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
          segments: { type: 'array', items: { $ref: '#/components/schemas/SubtitleSegmentData' } },
          createdAt: { type: 'string', format: 'date-time' },
          version: { type: 'integer' },
        },
      },
      GenerateSegmentsRequest: {
        type: 'object',
        required: ['indices'],
        properties: {
          indices: { type: 'array', items: { type: 'integer' }, minItems: 1 },
          segments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer' },
                text: { type: 'string' },
                voice: { type: 'string' },
              },
            },
          },
        },
      },
      ExportAudioRequest: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: { type: 'string' },
          filename: { type: 'string' },
          gapMode: { type: 'string', enum: ['subtitle'] },
          smoothMerge: { type: 'boolean' },
          crossfadeMs: { type: 'integer', minimum: 0 },
        },
      },
      ExportAudioResponse: {
        type: 'object',
        properties: {
          exportId: { type: 'string' },
          filename: { type: 'string' },
          downloadUrl: { type: 'string' },
        },
      },
      PreviewCompletedRequest: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: { type: 'string' },
          gapMode: { type: 'string', enum: ['subtitle'] },
          smoothMerge: { type: 'boolean' },
          crossfadeMs: { type: 'integer', minimum: 0 },
        },
      },
      PreviewCompletedResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          url: { type: 'string' },
          duration: { type: 'number' },
          segmentCount: { type: 'integer' },
        },
      },
      ApiError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', enum: [false] },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    field: { type: 'string' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    responses: {
      Error400: {
        description: 'Bad request',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
      },
      Error404: {
        description: 'Resource not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
      },
      Error500: {
        description: 'Internal server error',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
      },
    },
  },
};
