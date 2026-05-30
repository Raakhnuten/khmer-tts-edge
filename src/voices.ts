import { EdgeTTS } from '@andresaya/edge-tts';

const KHMER_LOCALE = 'km-KH';

const KHMER_VOICES = new Set([
  'km-KH-PisethNeural',
  'km-KH-SreymomNeural',
]);

export const SHORT_TEXT_LIMIT = 5000;
export const MAX_TEXT_LENGTH = 100000;

export interface VoiceInfo {
  name: string;
  locale: string;
  gender: string;
  localName: string;
}

export async function listAllVoices(): Promise<VoiceInfo[]> {
  const tts = new EdgeTTS();
  const allVoices = await tts.getVoices();
  return allVoices
    .filter((v: any) => (v.Locale as string).toLowerCase() === KHMER_LOCALE.toLowerCase())
    .map((v: any) => ({
      name: v.ShortName ?? v.Name,
      locale: v.Locale,
      gender: v.Gender,
      localName: v.LocalName,
    }));
}

export function printVoices(voices: VoiceInfo[]): void {
  if (voices.length === 0) {
    console.log('No Khmer voices found on this system.');
    return;
  }
  const header = `${'Name'.padEnd(45)} ${'Locale'.padEnd(12)} ${'Gender'.padEnd(10)} Local Name`;
  console.log('\n' + header);
  console.log('-'.repeat(header.length));
  for (const v of voices) {
    console.log(`${v.name.padEnd(45)} ${v.locale.padEnd(12)} ${v.gender.padEnd(10)} ${v.localName}`);
  }
  console.log(`\nTotal: ${voices.length} Khmer voice(s)`);
}

export function isValidKhmerVoice(voiceName: string): boolean {
  return KHMER_VOICES.has(voiceName);
}

export function validateText(text: string): string | null {
  if (!text || !text.trim()) {
    return 'Text is required';
  }

  const trimmed = text.trim();

  if (trimmed.length > MAX_TEXT_LENGTH) {
    return `Text is too long (${trimmed.length} characters). Maximum is ${MAX_TEXT_LENGTH.toLocaleString()} characters.`;
  }

  const khmerRegex = /[\u1780-\u17FF\u19E0-\u19FF]/;
  if (!khmerRegex.test(trimmed)) {
    return 'Text does not contain any Khmer characters. Please enter Khmer text.';
  }

  return null;
}
