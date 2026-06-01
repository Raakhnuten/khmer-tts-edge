import { EdgeTTS, Constants } from '@andresaya/edge-tts';
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';

const FFMPEG_PATH = 'ffmpeg';
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;
const RATE_LIMIT_DELAY_MS = 300;

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
}

export interface ExportOptions {
  gapMode?: 'subtitle';
  smoothMerge?: boolean;
  crossfadeMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function execFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args, { stdio: 'ignore' });
    child.on('error', () => reject(new Error('FFmpeg not found. Install FFmpeg and add it to your PATH.')));
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
}

function execFFprobe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', () => reject(new Error('FFprobe not found. Install FFmpeg.')));
    child.on('exit', (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`FFprobe exited with code ${code}`));
    });
  });
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
    const startTime = parseSRTTime(parts[0].trim());
    const endTime = parseSRTTime(parts[1].trim());

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

async function getAudioDuration(filePath: string): Promise<number> {
  const output = await execFFprobe([
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  return Math.round(parseFloat(output) * 1000);
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

  await sleep(RATE_LIMIT_DELAY_MS);

  let generatedDuration: number;
  try {
    generatedDuration = await getAudioDuration(rawFile);
  } catch (err: any) {
    return { status: 'failed', generatedDuration: null, speedRatio: null, error: `Failed to probe audio: ${err.message}` };
  }

  if (targetDurationMs <= 0 || Math.abs(generatedDuration / targetDurationMs - 1) < 0.02) {
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

  const DURATION_TOLERANCE_MS = 50;
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

export async function exportFinalAudio(
  jobDir: string,
  segments: SubtitleSegmentData[],
  adjustedDir: string,
  options?: ExportOptions
): Promise<string> {
  const { gapMode = 'subtitle', smoothMerge = true, crossfadeMs = 20 } = options || {};
  const finalFile = join(jobDir, 'final.mp3');
  const allFiles: string[] = [];
  const gapLog: string[] = [];

  let silenceIdx = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.status !== 'completed') continue;

    const adjustedPath = join(adjustedDir, `${String(seg.index).padStart(4, '0')}.mp3`);
    allFiles.push(adjustedPath);

    if (i < segments.length - 1) {
      const nextSeg = segments[i + 1];
      const gapMs = nextSeg.startTime - seg.endTime;
      const gapEntry = `  Gap [seg${seg.index}→seg${nextSeg.index}]: ${gapMs}ms`;

      if (gapMode === 'subtitle' && gapMs > 50) {
        const silenceFile = join(jobDir, `silence_${silenceIdx}.mp3`);
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
        allFiles.push(silenceFile);
        silenceIdx++;
        gapLog.push(gapEntry + ' (real gap, silence inserted)');
      } else {
        gapLog.push(gapEntry + ' (touching, no silence needed)');
      }
    }
  }

  if (allFiles.length === 0) {
    throw new Error('No completed segments to export');
  }

  const completedCount = segments.filter(s => s.status === 'completed').length;
  console.log(`Export: gapMode=${gapMode}, smoothMerge=${smoothMerge}, crossfade=${crossfadeMs}ms, segments=${completedCount}, gaps=${silenceIdx}`);
  for (const g of gapLog) console.log(g);

  if (allFiles.length === 1) {
    await execFFmpeg(['-i', allFiles[0], '-c', 'copy', '-y', finalFile]);
    return finalFile;
  }

  if (smoothMerge) {
    const inputs: string[] = [];
    for (const f of allFiles) inputs.push('-i', f);

    const cfSec = (crossfadeMs / 1000).toFixed(3);
    const filterParts: string[] = [];
    for (let i = 1; i < allFiles.length; i++) {
      const prevTag = i === 1 ? `0:a` : `f${i - 1}`;
        const outTag = i === allFiles.length - 1 ? '' : `[f${i}]`;
      filterParts.push(`[${prevTag}][${i}:a]acrossfade=d=${cfSec}${outTag}`);
    }

    await execFFmpeg([
      ...inputs,
      '-filter_complex', filterParts.join(';'),
      '-c:a', 'libmp3lame',
      '-b:a', '96k',
      '-y',
      finalFile,
    ]);
  } else {
    const fileList = join(jobDir, 'export_files.txt');
    const entries = allFiles.map(f => `file '${f.replace(/\\/g, '/')}'`);
    await writeFile(fileList, entries.join('\n'), 'utf-8');

    await execFFmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', fileList,
      '-c', 'copy',
      '-y',
      finalFile,
    ]);

    await unlink(fileList).catch(() => {});
  }

  for (let i = 0; i < silenceIdx; i++) {
    await unlink(join(jobDir, `silence_${i}.mp3`)).catch(() => {});
  }

  return finalFile;
}

export { formatSRTTime, getAudioDuration, execFFmpeg };
