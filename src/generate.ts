import { EdgeTTS, Constants } from '@andresaya/edge-tts';
import { mkdir, readdir, unlink, rmdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';

const CHUNK_MAX_LENGTH = 1000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;
const RATE_LIMIT_DELAY_MS = 300;
const CHUNK_GAP_MS = 0;
const CROSSFADE_MS = 20;
const FFMPEG_PATH = 'ffmpeg';

export interface ProgressInfo {
  currentChunk: number;
  totalChunks: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export type ProgressCallback = (info: ProgressInfo) => void;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function simpleHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function execFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args, { stdio: 'ignore' });
    child.on('error', () => reject(new Error(`FFmpeg not found. Install FFmpeg and add it to your PATH.`)));
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
}

const KHMER_SENTENCE_END = /(?:\n|[\u17D4\u17D5\u17D6])+/g;

function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  const regex = new RegExp(KHMER_SENTENCE_END.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    const sentence = text.slice(lastEnd, match.index + match[0].length).trim();
    if (sentence) sentences.push(sentence);
    lastEnd = regex.lastIndex;
  }

  const remaining = text.slice(lastEnd).trim();
  if (remaining) sentences.push(remaining);

  if (sentences.length === 0) sentences.push(text.trim());
  return sentences;
}

function splitLongSegment(segment: string): string[] {
  const parts: string[] = [];
  let start = 0;
  while (start < segment.length) {
    if (start + CHUNK_MAX_LENGTH >= segment.length) {
      parts.push(segment.slice(start).trim());
      break;
    }
    const end = segment.lastIndexOf(' ', start + CHUNK_MAX_LENGTH);
    if (end > start) {
      parts.push(segment.slice(start, end).trim());
      start = end + 1;
    } else {
      parts.push(segment.slice(start, start + CHUNK_MAX_LENGTH).trim());
      start += CHUNK_MAX_LENGTH;
    }
  }
  return parts.filter(Boolean);
}

function splitIntoChunks(text: string): string[] {
  const sentences = splitIntoSentences(text);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (trimmed.length > CHUNK_MAX_LENGTH) {
      if (current) {
        chunks.push(current.trim());
        current = '';
      }
      const subParts = splitLongSegment(trimmed);
      for (const part of subParts) {
        if (part.length <= CHUNK_MAX_LENGTH) {
          chunks.push(part);
        }
      }
      continue;
    }
    if ((current + ' ' + trimmed).length > CHUNK_MAX_LENGTH && current.length > 0) {
      chunks.push(current.trim());
      current = trimmed;
    } else if (current.length > 0) {
      current += ' ' + trimmed;
    } else {
      current = trimmed;
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  if (chunks.length === 0) {
    chunks.push(text.trim());
  }

  return chunks;
}

async function generateSilenceMp3(outputFile: string, durationMs: number): Promise<void> {
  const durationSec = (durationMs / 1000).toFixed(3);
  await execFFmpeg([
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=mono:sample_rate=24000',
    '-t', durationSec,
    '-c:a', 'libmp3lame',
    '-b:a', '96k',
    '-y',
    outputFile,
  ]);
}

async function trySynthesizeChunk(
  text: string,
  voiceName: string,
  chunkFile: string,
  attempt: number
): Promise<boolean> {
  const tts = new EdgeTTS();
  try {
    await tts.synthesize(text, voiceName, {
      outputFormat: Constants.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
    });
    await tts.toFile(chunkFile.replace('.mp3', ''));
    return true;
  } catch {
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY_MS * attempt;
      console.log(`  Retry ${attempt}/${MAX_RETRIES} in ${delay}ms...`);
      await sleep(delay);
    }
    return false;
  }
}

interface SessionData {
  textHash: string;
  voice: string;
  chunks: number;
}

export async function generateAudio(
  text: string,
  voiceName: string,
  outputDir: string,
  onProgress?: ProgressCallback
): Promise<string> {
  await execFFmpeg(['-version']);

  const textHash = simpleHash(text);
  const sessionFile = join(outputDir, '.session');
  const chunksDir = join(outputDir, 'chunks');

  let resume = false;
  try {
    const raw = await readFile(sessionFile, 'utf-8');
    const prev: SessionData = JSON.parse(raw);
    if (prev.textHash === textHash && prev.voice === voiceName) {
      resume = true;
    }
  } catch { }

  if (!resume) {
    await mkdir(outputDir, { recursive: true });
    try {
      const existing = await readdir(chunksDir);
      for (const f of existing) {
        await unlink(join(chunksDir, f)).catch(() => {});
      }
      await rmdir(chunksDir).catch(() => {});
    } catch { }
  }

  await mkdir(chunksDir, { recursive: true });

  const existingFiles = new Set<string>();
  if (resume) {
    try {
      const files = await readdir(chunksDir);
      for (const f of files) {
        if (f.endsWith('.mp3')) existingFiles.add(f);
      }
    } catch { }
  }

  const chunks = splitIntoChunks(text);
  const totalChunks = chunks.length;

  const session: SessionData = { textHash, voice: voiceName, chunks: totalChunks };
  await writeFile(sessionFile, JSON.stringify(session), 'utf-8');

  const chunkFiles: string[] = [];
  let skipped = 0;
  let startTime = Date.now();
  let hasFailure = false;

  onProgress?.({ currentChunk: 0, totalChunks, status: 'processing' });

  for (let i = 0; i < totalChunks; i++) {
    const chunkNum = i + 1;
    const chunkName = `chunk-${String(chunkNum).padStart(4, '0')}.mp3`;
    const chunkFile = join(chunksDir, chunkName);

    if (resume && existingFiles.has(chunkName)) {
      chunkFiles.push(chunkFile);
      skipped++;
      continue;
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const done = i - skipped;
    const avgPerChunk = done > 0 ? elapsed / done : 0;
    const remaining = totalChunks - i;
    const eta = avgPerChunk > 0 ? remaining * avgPerChunk : 0;
    const etaStr = eta > 0 ? `, ETA ${Math.round(eta)}s` : '';

    process.stdout.write(`[${chunkNum}/${totalChunks}]${etaStr}... `);

    let ok = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      ok = await trySynthesizeChunk(chunks[i], voiceName, chunkFile, attempt);
      if (ok) break;
    }

    if (!ok) {
      console.error(`FAILED after ${MAX_RETRIES} attempts`);
      hasFailure = true;
      onProgress?.({ currentChunk: chunkNum, totalChunks, status: 'failed', error: `Chunk ${chunkNum} failed after ${MAX_RETRIES} attempts` });
      break;
    }

    chunkFiles.push(chunkFile);
    console.log(`OK`);

    onProgress?.({ currentChunk: chunkNum, totalChunks, status: 'processing' });

    if (i < totalChunks - 1) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  if (hasFailure) {
    throw new Error(`Generation failed — see ${chunksDir} for partial files`);
  }

  if (skipped > 0) {
    console.log(`Resumed: ${skipped} chunk(s) reused from previous run`);
  }

  const totalChunksForMerge = chunkFiles.length;
  const finalFile = join(outputDir, 'output.mp3');

  if (CHUNK_GAP_MS > 0) {
    // Legacy gap mode — insert silence between chunks
    const silenceFile = join(chunksDir, 'silence.mp3');
    await generateSilenceMp3(silenceFile, CHUNK_GAP_MS);

    const fileList = join(chunksDir, 'files.txt');
    const concatEntries: string[] = [];
    for (let i = 0; i < totalChunksForMerge; i++) {
      concatEntries.push(`file '${chunkFiles[i].replace(/\\/g, '/')}'`);
      if (i < totalChunksForMerge - 1) {
        concatEntries.push(`file '${silenceFile}'`);
      }
    }
    await writeFile(fileList, concatEntries.join('\n'), 'utf-8');

    await execFFmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', fileList,
      '-c', 'copy',
      '-y',
      finalFile,
    ]);

    await unlink(fileList);
    await unlink(silenceFile).catch(() => {});
  } else {
    // Smooth mode — no artificial gap, use crossfade
    console.log(`Merging chunks with crossfade (${CROSSFADE_MS}ms)...`);

    if (totalChunksForMerge === 1) {
      await execFFmpeg(['-i', chunkFiles[0], '-c', 'copy', '-y', finalFile]);
    } else {
      const inputs: string[] = [];
      for (const f of chunkFiles) inputs.push('-i', f);

      const cfSec = (CROSSFADE_MS / 1000).toFixed(3);
      const filterParts: string[] = [];
      for (let i = 1; i < totalChunksForMerge; i++) {
        const prevTag = i === 1 ? `0:a` : `f${i - 1}`;
        const outTag = i === totalChunksForMerge - 1 ? '' : `[f${i}]`;
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
    }
  }

  for (const file of chunkFiles) {
    await unlink(file).catch(() => {});
  }
  await rmdir(chunksDir).catch(() => {});
  await unlink(sessionFile).catch(() => {});

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Done! Audio saved to: ${finalFile} (${totalTime}s)`);

  onProgress?.({ currentChunk: totalChunks, totalChunks, status: 'completed' });

  return finalFile;
}
