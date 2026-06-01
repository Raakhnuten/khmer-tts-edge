import express from 'express';
import { mkdir, readFile, writeFile, copyFile, unlink, rmdir } from 'fs/promises';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { listAllVoices, isValidKhmerVoice, validateText, SHORT_TEXT_LIMIT } from './voices.js';
import { generateAudio, ProgressInfo } from './generate.js';
import {
  parseSRT, generateSegmentAudio, exportFinalAudio, saveMetadata, formatTimeShort, getAudioDuration, execFFmpeg,
  SubtitleJobData, SubtitleSegmentData,
} from './subtitle.js';

interface Job {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentChunk: number;
  totalChunks: number;
  error?: string;
  outputPath?: string;
  createdAt: Date;
}

const jobs = new Map<string, Job>();
const subtitleJobs = new Map<string, SubtitleJobData>();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const OUTPUT_DIR = resolve('output');
const TEMP_DIR = join(OUTPUT_DIR, 'tmp');
const JOBS_DIR = join(OUTPUT_DIR, 'jobs');
const SUBTITLE_JOBS_DIR = join(OUTPUT_DIR, 'subtitle-jobs');

app.use(express.json({ limit: '5mb' }));

app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

app.get('/api/voices', async (_req, res) => {
  try {
    const voices = await listAllVoices();
    res.json(voices);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate', async (req, res) => {
  try {
    const { text, voice } = req.body;

    const textErr = validateText(text);
    if (textErr) {
      res.status(400).json({ error: textErr });
      return;
    }

    if (!voice) {
      res.status(400).json({ error: 'Voice is required' });
      return;
    }

    if (!isValidKhmerVoice(voice)) {
      res.status(400).json({ error: `Invalid voice "${voice}". Use km-KH-PisethNeural or km-KH-SreymomNeural.` });
      return;
    }

    const trimmed = text.trim();
    if (trimmed.length > SHORT_TEXT_LIMIT) {
      res.status(400).json({
        error: `Text too long (${trimmed.length} characters) for direct generation. Use POST /api/jobs for long audio.`,
      });
      return;
    }

    const sessionId = randomUUID();
    const sessionDir = join(TEMP_DIR, sessionId);
    await mkdir(sessionDir, { recursive: true });

    const outputPath = await generateAudio(trimmed, voice, sessionDir);
    const audioBuffer = await readFile(outputPath);

    await unlink(outputPath).catch(() => {});
    await rmdir(sessionDir).catch(() => {});

    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Disposition', 'inline; filename="khmer-tts.mp3"');
    res.send(audioBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/jobs', async (req, res) => {
  try {
    const { text, voice } = req.body;

    const textErr = validateText(text);
    if (textErr) {
      res.status(400).json({ error: textErr });
      return;
    }

    if (!voice) {
      res.status(400).json({ error: 'Voice is required' });
      return;
    }

    if (!isValidKhmerVoice(voice)) {
      res.status(400).json({ error: `Invalid voice "${voice}". Use km-KH-PisethNeural or km-KH-SreymomNeural.` });
      return;
    }

    const id = randomUUID();
    const job: Job = {
      id,
      status: 'pending',
      progress: 0,
      currentChunk: 0,
      totalChunks: 0,
      createdAt: new Date(),
    };
    jobs.set(id, job);

    const trimmed = text.trim();
    const jobDir = join(JOBS_DIR, id);

    processJob(id, trimmed, voice, jobDir);

    res.status(201).json({ id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    currentChunk: job.currentChunk,
    totalChunks: job.totalChunks,
    error: job.error || null,
    createdAt: job.createdAt,
  });
});

app.get('/api/download/:id', async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  if (job.status !== 'completed' || !job.outputPath) {
    res.status(400).json({ error: 'Job is not completed yet' });
    return;
  }
  try {
    const audioBuffer = await readFile(job.outputPath);
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Disposition', `attachment; filename="khmer-tts-${job.id.slice(0, 8)}.mp3"`);
    res.send(audioBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const KHMER_VOICES_LIST = ['km-KH-PisethNeural', 'km-KH-SreymomNeural'];

app.post('/api/subtitles/import', async (req, res) => {
  try {
    const { srt } = req.body;
    if (!srt || !srt.trim()) {
      res.status(400).json({ error: 'SRT content is required' });
      return;
    }
    const parsed = parseSRT(srt);
    if (parsed.length === 0) {
      res.status(400).json({ error: 'No valid subtitle blocks found in SRT' });
      return;
    }
    res.json({ segments: parsed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/subtitles/jobs', async (req, res) => {
  try {
    const { segments } = req.body;
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      res.status(400).json({ error: 'Segments array is required' });
      return;
    }

    const id = randomUUID();
    const jobDir = join(SUBTITLE_JOBS_DIR, id);
    await mkdir(join(jobDir, 'segments'), { recursive: true });
    await mkdir(join(jobDir, 'adjusted'), { recursive: true });

    const now = new Date().toISOString();
    const segs: SubtitleSegmentData[] = segments.map((s: any, i: number) => ({
      index: i,
      startTime: s.startTime ?? 0,
      endTime: s.endTime ?? 0,
      text: s.text ?? '',
      voice: KHMER_VOICES_LIST.includes(s.voice) ? s.voice : KHMER_VOICES_LIST[0],
      status: 'pending',
      generatedDuration: null,
      speedRatio: null,
      error: null,
    }));

    const jobData: SubtitleJobData = { id, status: 'pending', segments: segs, createdAt: now };
    subtitleJobs.set(id, jobData);
    await saveMetadata(jobDir, jobData);

    res.status(201).json({ id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/subtitles/jobs/:id', (req, res) => {
  const job = subtitleJobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Subtitle job not found' });
    return;
  }
  res.json(job);
});

app.post('/api/subtitles/segments/:id/generate', async (req, res) => {
  try {
    const jobId = req.params.id;
    const job = subtitleJobs.get(jobId);
    if (!job) {
      res.status(404).json({ error: 'Subtitle job not found' });
      return;
    }

    const { indices, segments: updatedSegments } = req.body;
    if (!indices || !Array.isArray(indices) || indices.length === 0) {
      res.status(400).json({ error: 'indices array is required' });
      return;
    }

    if (updatedSegments && Array.isArray(updatedSegments)) {
      for (const us of updatedSegments) {
        const target = job.segments.find((s) => s.index === us.index);
        if (target) {
          if (us.text !== undefined) target.text = us.text;
          if (us.voice !== undefined && KHMER_VOICES_LIST.includes(us.voice)) target.voice = us.voice;
        }
      }
    }

    for (const idx of indices) {
      const seg = job.segments[idx];
      if (seg) seg.status = 'pending';
    }

    job.status = 'processing';
    const jobDir = join(SUBTITLE_JOBS_DIR, jobId);
    await saveMetadata(jobDir, job);

    processSubtitleSegments(jobId, indices, jobDir);

    res.json({ status: 'processing', jobId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/subtitles/segments/:id/audio', async (req, res) => {
  try {
    const jobId = req.params.id;
    const index = parseInt(req.query.index as string);
    const job = subtitleJobs.get(jobId);
    if (!job) {
      res.status(404).json({ error: 'Subtitle job not found' });
      return;
    }
    const seg = job.segments[index];
    if (!seg || seg.status !== 'completed') {
      res.status(400).json({ error: 'Segment audio not available' });
      return;
    }

    const adjustedDir = join(SUBTITLE_JOBS_DIR, jobId, 'adjusted');
    const chunkName = `${String(index).padStart(4, '0')}.mp3`;
    const filePath = join(adjustedDir, chunkName);

    const audioBuffer = await readFile(filePath);
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Disposition', `inline; filename="segment-${index}.mp3"`);
    res.send(audioBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/subtitles/export', async (req, res) => {
  try {
    const { jobId, savePath } = req.body;
    if (!jobId) {
      res.status(400).json({ error: 'jobId is required' });
      return;
    }

    const job = subtitleJobs.get(jobId);
    if (!job) {
      res.status(404).json({ error: 'Subtitle job not found' });
      return;
    }

    const completedCount = job.segments.filter((s) => s.status === 'completed').length;
    if (completedCount === 0) {
      res.status(400).json({ error: 'No completed segments to export' });
      return;
    }

    const jobDir = join(SUBTITLE_JOBS_DIR, jobId);
    const adjustedDir = join(jobDir, 'adjusted');

    try {
      const { gapMode = 'subtitle', smoothMerge = true, crossfadeMs = 20 } = req.body;
      const finalPath = await exportFinalAudio(jobDir, job.segments, adjustedDir, { gapMode, smoothMerge, crossfadeMs });
      const resp: any = { exportId: jobId, downloadUrl: `/api/subtitles/export/${jobId}/download` };
      if (savePath) {
        await copyFile(finalPath, savePath);
        resp.savedTo = savePath;
      }
      res.json(resp);
    } catch (err: any) {
      res.status(500).json({ error: `Export failed: ${err.message}` });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/subtitles/export/:id/download', async (req, res) => {
  try {
    const jobId = req.params.id;
    const finalPath = join(SUBTITLE_JOBS_DIR, jobId, 'final.mp3');
    const audioBuffer = await readFile(finalPath);
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Disposition', `attachment; filename="subtitles-${jobId.slice(0, 8)}.mp3"`);
    res.send(audioBuffer);
  } catch {
    res.status(404).json({ error: 'Export not found. Please export first.' });
  }
});

app.post('/api/subtitles/preview-completed', async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) {
      res.status(400).json({ error: 'jobId is required' });
      return;
    }

    const job = subtitleJobs.get(jobId);
    if (!job) {
      res.status(404).json({ error: 'Subtitle job not found' });
      return;
    }

    const completed = job.segments
      .filter(s => s.status === 'completed')
      .sort((a, b) => a.index - b.index);

    if (completed.length === 0) {
      res.status(400).json({ error: 'No completed segments to preview' });
      return;
    }

    const jobDir = join(SUBTITLE_JOBS_DIR, jobId);
    const adjustedDir = join(jobDir, 'adjusted');
    const previewFile = join(jobDir, 'preview-completed.mp3');
    const allFiles: string[] = [];

    for (const seg of completed) {
      const adjustedPath = join(adjustedDir, `${String(seg.index).padStart(4, '0')}.mp3`);
      allFiles.push(adjustedPath);
    }

    if (allFiles.length === 1) {
      await execFFmpeg(['-i', allFiles[0], '-c', 'copy', '-y', previewFile]);
    } else {
      const fileList = join(jobDir, 'preview_files.txt');
      const entries = allFiles.map(f => `file '${f.replace(/\\/g, '/')}'`);
      await writeFile(fileList, entries.join('\n'), 'utf-8');
      await execFFmpeg([
        '-f', 'concat',
        '-safe', '0',
        '-i', fileList,
        '-c', 'copy',
        '-y',
        previewFile,
      ]);
      await unlink(fileList).catch(() => {});
    }

    let duration = 0;
    try { duration = await getAudioDuration(previewFile); } catch {}

    res.json({
      success: true,
      url: `/api/subtitles/preview-completed/${jobId}`,
      duration: Math.round(duration) / 1000,
      segmentCount: completed.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/subtitles/preview-completed/:jobId', async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const previewFile = join(SUBTITLE_JOBS_DIR, jobId, 'preview-completed.mp3');
    const audioBuffer = await readFile(previewFile);
    res.set('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  } catch {
    res.status(404).json({ error: 'Preview not found. Generate completed segments first.' });
  }
});

app.get('/', async (_req, res) => {
  const htmlPath = join(resolve(), 'public', 'index.html');
  try {
    const html = await readFile(htmlPath, 'utf-8');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch {
    res.status(500).send('index.html not found');
  }
});

app.use(express.static(resolve('public')));

async function processSubtitleSegments(jobId: string, indices: number[], jobDir: string): Promise<void> {
  const job = subtitleJobs.get(jobId);
  if (!job) return;

  const segmentsDir = join(jobDir, 'segments');
  const adjustedDir = join(jobDir, 'adjusted');

  for (const idx of indices) {
    const seg = job.segments[idx];
    if (!seg) continue;

    seg.status = 'generating';
    seg.error = null;
    await saveMetadata(jobDir, job).catch(() => {});

    const targetDuration = seg.endTime - seg.startTime;
    const result = await generateSegmentAudio(
      seg.text,
      seg.voice,
      targetDuration,
      segmentsDir,
      adjustedDir,
      idx,
    );

    seg.status = result.status;
    seg.generatedDuration = result.generatedDuration;
    seg.speedRatio = result.speedRatio;
    seg.error = result.error;
    await saveMetadata(jobDir, job).catch(() => {});
  }

  const allDone = job.segments.every((s) => s.status === 'completed' || s.status === 'failed');
  if (allDone) {
    const anyFailed = job.segments.some((s) => s.status === 'failed');
    job.status = anyFailed ? 'failed' : 'completed';
  } else {
    job.status = 'processing';
  }
  await saveMetadata(jobDir, job).catch(() => {});
}

async function processJob(id: string, text: string, voice: string, jobDir: string): Promise<void> {
  const job = jobs.get(id)!;
  try {
    await mkdir(jobDir, { recursive: true });

    job.status = 'processing';

    const outputPath = await generateAudio(text, voice, jobDir, (info: ProgressInfo) => {
      const j = jobs.get(id);
      if (!j) return;
      j.currentChunk = info.currentChunk;
      j.totalChunks = info.totalChunks;
      j.progress = info.totalChunks > 0 ? Math.round((info.currentChunk / info.totalChunks) * 100) : 0;
      if (info.status === 'failed') {
        j.status = 'failed';
        j.error = info.error;
      }
    });

    const j = jobs.get(id);
    if (j) {
      j.status = 'completed';
      j.progress = 100;
      j.outputPath = outputPath;
    }
  } catch (err: any) {
    const j = jobs.get(id);
    if (j) {
      j.status = 'failed';
      j.error = err.message;
    }
  }
}

app.listen(PORT, () => {
  console.log(`Khmer TTS Server running at http://localhost:${PORT}`);
});
