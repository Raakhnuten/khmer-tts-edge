import { spawn } from 'child_process';

const FFMPEG_PATH = 'ffmpeg';

export function execFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', () => reject(new Error('FFmpeg not found. Install FFmpeg and add it to your PATH.')));
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else {
        const detail = stderr.split('\n').slice(-3).join(' ').trim().slice(0, 200);
        reject(new Error(`FFmpeg exited with code ${code}: ${detail}`));
      }
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

export async function getAudioDuration(filePath: string): Promise<number> {
  const output = await execFFprobe([
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  return Math.round(parseFloat(output) * 1000);
}
