import { readFile } from 'fs/promises';
import { resolve } from 'path';
import pino from 'pino';
import { listAllVoices, printVoices, isValidKhmerVoice, validateText } from './voices.js';
import { generateAudio } from './generate.js';

const INPUT_FILE = resolve('input/text.txt');
const DEFAULT_VOICE = 'km-KH-PisethNeural';

const cliLogger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

function printUsage(): void {
  console.log(`
Usage:
  npm run voices                                    List Khmer voices
  npm run generate                                  Generate audio (default: Piseth)
  npm run generate -- --voice <name>                Use specific voice

Khmer voices:
  km-KH-PisethNeural  (Male)
  km-KH-SreymomNeural (Female)
`);
}

async function cmdVoices(): Promise<void> {
  cliLogger.info('Fetching Khmer voices...');
  const voices = await listAllVoices();
  printVoices(voices);
}

async function cmdGenerate(specifiedVoice: string | null): Promise<void> {
  const text = await readFile(INPUT_FILE, 'utf-8').catch(() => {
    cliLogger.error(`Could not read ${INPUT_FILE}`);
    console.log('Create input/text.txt with the text you want to convert.');
    process.exit(1);
  });

  if (!text.trim()) {
    cliLogger.error('input/text.txt is empty.');
    process.exit(1);
  }

  cliLogger.info({ charCount: text.length }, `Input text: ${text.length} characters`);

  const voiceName = specifiedVoice ?? DEFAULT_VOICE;

  const textErr = validateText(text);
  if (textErr) {
    cliLogger.error({ textErr }, `Validation error: ${textErr}`);
    process.exit(1);
  }

  if (!isValidKhmerVoice(voiceName)) {
    cliLogger.error({ voiceName }, `Invalid voice "${voiceName}". Use km-KH-PisethNeural or km-KH-SreymomNeural.`);
    process.exit(1);
  }

  cliLogger.info({ voiceName }, `Using voice: ${voiceName}`);

  await generateAudio(text, voiceName, resolve('output'));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  switch (command) {
    case 'voices':
      await cmdVoices();
      break;
    case 'generate': {
      const voiceIdx = args.indexOf('--voice');
      const voice = voiceIdx !== -1 ? args[voiceIdx + 1] : null;
      await cmdGenerate(voice);
      break;
    }
    default:
      cliLogger.error({ command }, `Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err: Error) => {
  cliLogger.error({ err }, `Error: ${err.message}`);
  process.exit(1);
});
