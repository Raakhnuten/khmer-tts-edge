import { setTestEnv, cleanupTestDir } from './setup.js';
import { initDatabase, closeDatabase } from '../src/database/index.js';
import { config } from '../src/config/index.js';

let initialized = false;

export async function initTestApp(): Promise<void> {
  if (initialized) return;
  setTestEnv();
  const { default: app } = await import('../src/app.js');
  await initDatabase(config.databasePath);
  initialized = true;
}

export function resetTestApp(): void {
  initialized = false;
}
