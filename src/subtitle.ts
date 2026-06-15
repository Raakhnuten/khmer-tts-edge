import { EdgeTTS, Constants } from '@andresaya/edge-tts';
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { execFFmpeg, getAudioDuration } from './utils/ffmpeg.js';
import { sleep } from './utils/helpers.js';
import { config } from './config/index.js';
import { logger } from './logger.js';

const MAX_RETRIES = config.maxRetries;
const RETRY_BASE_DELAY_MS = config.retryBaseDelayMs;
const DURATION_TOLERANCE_MS = 10;

export interface SubtitleSegmentData {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
  voice: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  generatedDuration: number | null;
  speedRatio: number | null;
  error: string | null;
}

export interface SubtitleJobData {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  segments: SubtitleSegmentData[];
  createdAt: string;
  version?: number;
}

export interface ExportOptions {
  gapMode?: 'subtitle';
  smoothMerge?: boolean;
  crossfadeMs?: number;
}

export function parseSRT(srt: string): { startTime: number; endTime: number; text: string }[] {
  const normalized = srt.replace(/\r\n/g, '\n');
  const blocks = normalized.trim().split(/\n\n+/);
  const result: { startTime: number; endTime: number; text: string }[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;

    const parts = timeLine.split('-->');
    if (parts.length < 2) continue;

    const startTime = parseSRTTime(parts[0].trim());
    const endTime = parseSRTTime(parts[1].trim());

    if (endTime <= startTime) {
      logger.warn({ startTime, endTime }, `Invalid subtitle timing: end ${endTime}ms <= start ${startTime}ms, skipping block`);
      continue;
    }

    const timeIdx = lines.indexOf(timeLine);
    const text = lines.slice(timeIdx + 1).join('\n').trim();

    if (text) {
      result.push({ startTime, endTime, text });
    }
  }

  return result;
}

function parseSRTTime(time: string): number {
  const parts = time.split(/[:.,]/);
  if (parts.length >= 3) {
    const h = parseInt(parts[0]) || 0;
    const m = parseInt(parts[1]) || 0;
    const s = parseInt(parts[2]) || 0;
    const ms = parts.length > 3 ? parseInt(parts[3].padEnd(3, '0').slice(0, 3)) : 0;
    return h * 3600000 + m * 60000 + s * 1000 + ms;
  }
  return 0;
}

function formatSRTTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export function formatTimeShort(ms: number): string {
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function generateSingleSegment(
  text: string,
  voice: string,
  outputPath: string
): Promise<void> {
  const tts = new EdgeTTS();
  await tts.synthesize(text, voice, {
    outputFormat: Constants.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
  });
  await tts.toFile(outputPath.replace('.mp3', ''));
}

export async function saveMetadata(jobDir: string, data: SubtitleJobData): Promise<void> {
  await writeFile(join(jobDir, 'metadata.json'), JSON.stringify(data, null, 2), 'utf-8');
}

export async function generateSegmentAudio(
  text: string,
  voice: string,
  targetDurationMs: number,
  segmentsDir: string,
  adjustedDir: string,
  index: number,
  onProgress?: (status: string, details?: string) => void
): Promise<{ status: 'completed' | 'failed'; generatedDuration: number | null; speedRatio: number | null; error: string | null }> {
  const chunkName = `${String(index).padStart(4, '0')}.mp3`;
  const rawFile = join(segmentsDir, chunkName);
  const adjustedFile = join(adjustedDir, chunkName);

  let ok = false;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      onProgress?.('generating', `Generating chunk ${index + 1} (attempt ${attempt})...`);
      await generateSingleSegment(text, voice, rawFile);
      ok = true;
      break;
    } catch (err: any) {
      lastError = err.message;
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * attempt;
        onProgress?.('generating', `Retry ${attempt}/${MAX_RETRIES} in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  if (!ok) {
    return { status: 'failed', generatedDuration: null, speedRatio: null, error: lastError || 'Generation failed' };
  }

  let generatedDuration: number;
  try {
    generatedDuration = await getAudioDuration(rawFile);
  } catch (err: any) {
    return { status: 'failed', generatedDuration: null, speedRatio: null, error: `Failed to probe audio: ${err.message}` };
  }

  if (targetDurationMs <= 0) {
    await execFFmpeg(['-i', rawFile, '-c', 'copy', '-y', adjustedFile]);
    return { status: 'completed', generatedDuration, speedRatio: 1.0, error: null };
  }

  if (Math.abs(generatedDuration / targetDurationMs - 1) < 0.02) {
    await execFFmpeg(['-i', rawFile, '-c', 'copy', '-y', adjustedFile]);
    return { status: 'completed', generatedDuration, speedRatio: 1.0, error: null };
  }

  const ratio = generatedDuration / targetDurationMs;
  let atempo = Math.min(Math.max(ratio, 0.5), 100);

  const filters: string[] = [];
  while (atempo > 2.0) {
    filters.push('atempo=2.0');
    atempo /= 2.0;
  }
  filters.push(`atempo=${atempo.toFixed(3)}`);

  try {
    onProgress?.('generating', `Adjusting speed ${ratio.toFixed(2)}x for segment ${index + 1}...`);
    await execFFmpeg([
      '-i', rawFile,
      '-af', filters.join(','),
      '-c:a', 'libmp3lame',
      '-b:a', '96k',
      '-y',
      adjustedFile,
    ]);
  } catch (err: any) {
    await execFFmpeg(['-i', rawFile, '-c', 'copy', '-y', adjustedFile]);
    return { status: 'completed', generatedDuration, speedRatio: 1.0, error: null };
  }

  let finalDuration: number;
  try {
    finalDuration = await getAudioDuration(adjustedFile);
  } catch {
    finalDuration = targetDurationMs;
  }

  // Always force exact match: trim or pad to exactly targetDurationMs
  if (Math.abs(finalDuration - targetDurationMs) > DURATION_TOLERANCE_MS && targetDurationMs > 0) {
    if (finalDuration > targetDurationMs) {
      const trimFile = adjustedFile + '.trim.mp3';
      await execFFmpeg([
        '-i', adjustedFile,
        '-t', (targetDurationMs / 1000).toFixed(3),
        '-c:a', 'libmp3lame',
        '-b:a', '96k',
        '-y',
        trimFile,
      ]);
      await unlink(adjustedFile).catch(() => {});
      await rename(trimFile, adjustedFile);
    } else {
      const silenceFile = adjustedFile + '.silence.mp3';
      const padMs = targetDurationMs - finalDuration;
      await execFFmpeg([
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=mono:sample_rate=24000',
        '-t', (padMs / 1000).toFixed(3),
        '-c:a', 'libmp3lame',
        '-b:a', '96k',
        '-y',
        silenceFile,
      ]);
      const listFile = adjustedFile + '.list.txt';
      await writeFile(listFile,
        `file '${adjustedFile.replace(/\\/g, '/')}'\nfile '${silenceFile.replace(/\\/g, '/')}'`, 'utf-8');
      const concatFile = adjustedFile + '.concat.mp3';
      await execFFmpeg([
        '-f', 'concat',
        '-safe', '0',
        '-i', listFile,
        '-c', 'copy',
        '-y',
        concatFile,
      ]);
      await unlink(adjustedFile).catch(() => {});
      await rename(concatFile, adjustedFile);
      await unlink(silenceFile).catch(() => {});
      await unlink(listFile).catch(() => {});
    }
    finalDuration = targetDurationMs;
  }

  return { status: 'completed', generatedDuration: finalDuration, speedRatio: ratio, error: null };
}

export async function buildTimelineAudio(
  segments: SubtitleSegmentData[],
  adjustedDir: string,
  outputPath: string,
  options?: ExportOptions
): Promise<{ durationMs: number; segmentCount: number; gapCount: number }> {
  const { gapMode = 'subtitle', smoothMerge = true, crossfadeMs = 20 } = options || {};

  const completed = segments.filter(s => s.status === 'completed');
  if (completed.length === 0) {
    throw new Error('No completed segments to build timeline');
  }

  const firstStart = completed[0].startTime;
  const lastEnd = completed[completed.length - 1].endTime;
  const expectedDurationMs = lastEnd - firstStart;
  const outputDir = dirname(outputPath);

  interface SpeechGroup { files: string[] }
  type TimelineItem = SpeechGroup | { silenceFile: string };
  const items: TimelineItem[] = [];
  let currentSpeech: string[] = [];
  let silenceIdx = 0;
  let lastCompletedIdx = -1;

  if (firstStart > 0) {
    const silenceFile = join(outputDir, `silence_${silenceIdx}.mp3`);
    await execFFmpeg([
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=mono:sample_rate=24000',
      '-t', (firstStart / 1000).toFixed(3),
      '-c:a', 'libmp3lame',
      '-b:a', '96k',
      '-y',
      silenceFile,
    ]);
    items.push({ silenceFile });
    silenceIdx++;
  }

  for (let i = 0; i < completed.length; i++) {
    const seg = completed[i];
    const adjustedPath = join(adjustedDir, `${String(seg.index).padStart(4, '0')}.mp3`);

    if (lastCompletedIdx >= 0) {
      const lastSeg = completed[lastCompletedIdx];
      const gapMs = seg.startTime - lastSeg.endTime;

      if (gapMode === 'subtitle' && gapMs > 50) {
        if (currentSpeech.length > 0) {
          items.push({ files: currentSpeech });
          currentSpeech = [];
        }

        const silenceFile = join(outputDir, `silence_${silenceIdx}.mp3`);
        const durationSec = (gapMs / 1000).toFixed(3);
        await execFFmpeg([
          '-f', 'lavfi',
          '-i', 'anullsrc=channel_layout=mono:sample_rate=24000',
          '-t', durationSec,
          '-c:a', 'libmp3lame',
          '-b:a', '96k',
          '-y',
          silenceFile,
        ]);
        items.push({ silenceFile });
        silenceIdx++;
      }
    }

    currentSpeech.push(adjustedPath);
    lastCompletedIdx = i;
  }

  if (currentSpeech.length > 0) {
    items.push({ files: currentSpeech });
  }

  if (items.length === 0) {
    throw new Error('No items to build');
  }

  const speechGroupCount = items.filter(i => 'files' in i).length;
  const totalCrossfadeLoss = (completed.length - speechGroupCount) * crossfadeMs;

  const mergeTempFiles: string[] = [];
  const finalInputs: string[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if ('silenceFile' in item) {
      finalInputs.push(item.silenceFile);
    } else if (item.files.length === 1) {
      finalInputs.push(item.files[0]);
    } else if (smoothMerge) {
      const mergedFile = join(outputDir, `_merged_${idx}.mp3`);
      await crossfadeMerge(item.files, crossfadeMs, mergedFile);
      mergeTempFiles.push(mergedFile);
      finalInputs.push(mergedFile);
    } else {
      const groupFile = join(outputDir, `_group_${idx}.mp3`);
      const listFile = join(outputDir, `_group_${idx}.txt`);
      const entries = item.files.map(f => `file '${f.replace(/\\/g, '/')}'`);
      await writeFile(listFile, entries.join('\n'), 'utf-8');
      await execFFmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-y', groupFile]);
      await unlink(listFile).catch(() => {});
      mergeTempFiles.push(groupFile);
      finalInputs.push(groupFile);
    }
  }

  const fileList = join(outputDir, `_filelist.txt`);
  const entries = finalInputs.map(f => `file '${f.replace(/\\/g, '/')}'`);
  await writeFile(fileList, entries.join('\n'), 'utf-8');
  await execFFmpeg(['-f', 'concat', '-safe', '0', '-i', fileList, '-c', 'copy', '-y', outputPath]);
  await unlink(fileList).catch(() => {});

  for (const f of mergeTempFiles) await unlink(f).catch(() => {});
  for (let i = 0; i < silenceIdx; i++) {
    await unlink(join(outputDir, `silence_${i}.mp3`)).catch(() => {});
  }

  let actualDuration: number;
  try {
    actualDuration = await getAudioDuration(outputPath);
  } catch {
    actualDuration = expectedDurationMs;
  }

  // Guarantee final duration matches the timeline
  if (actualDuration < expectedDurationMs) {
    const padMs = expectedDurationMs - actualDuration;
    const silenceFile = join(outputDir, `_finalpad.mp3`);
    await execFFmpeg([
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=mono:sample_rate=24000',
      '-t', (padMs / 1000).toFixed(3),
      '-c:a', 'libmp3lame',
      '-b:a', '96k',
      '-y',
      silenceFile,
    ]);
    const listFile2 = join(outputDir, `_padlist.txt`);
    await writeFile(listFile2,
      `file '${outputPath.replace(/\\/g, '/')}'\nfile '${silenceFile.replace(/\\/g, '/')}'`, 'utf-8');
    const paddedFile = join(outputDir, `_padded.mp3`);
    await execFFmpeg(['-f', 'concat', '-safe', '0', '-i', listFile2, '-c', 'copy', '-y', paddedFile]);
    await unlink(silenceFile).catch(() => {});
    await unlink(listFile2).catch(() => {});
    await unlink(outputPath).catch(() => {});
    await rename(paddedFile, outputPath);
    actualDuration = expectedDurationMs;
  } else if (actualDuration > expectedDurationMs) {
    const trimmedFile = join(outputDir, `_trimmed.mp3`);
    await execFFmpeg([
      '-i', outputPath,
      '-t', (expectedDurationMs / 1000).toFixed(3),
      '-c:a', 'libmp3lame',
      '-b:a', '96k',
      '-y',
      trimmedFile,
    ]);
    await unlink(outputPath).catch(() => {});
    await rename(trimmedFile, outputPath);
    actualDuration = expectedDurationMs;
  }

  return {
    durationMs: actualDuration,
    segmentCount: completed.length,
    gapCount: silenceIdx,
  };
}

export async function exportFinalAudio(
  jobDir: string,
  segments: SubtitleSegmentData[],
  adjustedDir: string,
  options?: ExportOptions
): Promise<string> {
  const finalFile = join(jobDir, 'final.mp3');
  const result = await buildTimelineAudio(segments, adjustedDir, finalFile, options);

  const completedCount = segments.filter(s => s.status === 'completed').length;
  logger.info({ completedCount, gapCount: result.gapCount, durationMs: result.durationMs }, `Export complete: ${completedCount} segments, ${result.gapCount} gaps, duration=${result.durationMs}ms`);

  return finalFile;
}

async function crossfadeMerge(files: string[], crossfadeMs: number, outputPath: string): Promise<void> {
  if (files.length === 1) {
    await execFFmpeg(['-i', files[0], '-c', 'copy', '-y', outputPath]);
    return;
  }
  const inputs: string[] = [];
  for (const f of files) inputs.push('-i', f);
  const cfSec = (crossfadeMs / 1000).toFixed(3);
  const filterParts: string[] = [];
  for (let i = 1; i < files.length; i++) {
    const prevTag = i === 1 ? '0:a' : `f${i - 1}`;
    const outTag = i === files.length - 1 ? '' : `[f${i}]`;
    filterParts.push(`[${prevTag}][${i}:a]acrossfade=d=${cfSec}${outTag}`);
  }
  await execFFmpeg([
    ...inputs,
    '-filter_complex', filterParts.join(';'),
    '-c:a', 'libmp3lame',
    '-b:a', '96k',
    '-y',
    outputPath,
  ]);
}

export { formatSRTTime };
