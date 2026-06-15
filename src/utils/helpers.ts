export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function sanitizeFilename(name: string): string {
  let safe = name.trim();
  if (!safe.toLowerCase().endsWith('.mp3')) safe += '.mp3';
  safe = safe.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  if (safe.length > 255) safe = safe.slice(0, 255);
  return safe;
}

export function computeTextHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
