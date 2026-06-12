/**
 * Minimal test runner with describe/it/assert
 *
 * Usage: npx tsx tests/<test-file>.ts
 */

let currentSuite = '';
let passed = 0;
let failed = 0;
let suitePassed = 0;
let suiteFailed = 0;

export function describe(name: string, fn: () => void) {
  currentSuite = name;
  suitePassed = 0;
  suiteFailed = 0;
  console.log(`\n  ${name}`);
  try {
    fn();
  } catch (err: any) {
    console.log(`    ✗ SUITE ERROR: ${err.message}`);
    suiteFailed++;
  }
  if (suiteFailed === 0) {
    console.log(`    ✓ ${suitePassed} passed`);
  } else {
    console.log(`    ✗ ${suitePassed} passed, ${suiteFailed} failed`);
  }
}

export function it(name: string, fn: () => void) {
  try {
    fn();
    suitePassed++;
    passed++;
    console.log(`    ✓ ${name}`);
  } catch (err: any) {
    suiteFailed++;
    failed++;
    console.log(`    ✗ ${name}`);
    console.log(`      ${err.message}`);
  }
}

export function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

export function assertEqual<T>(actual: T, expected: T, label?: string) {
  if (actual !== expected) {
    throw new Error(`${label || ''} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`.trim());
  }
}

// Run on import
process.on('exit', () => {
  console.log(`\n  ─── Results ───`);
  console.log(`  Total: ${passed + failed} | ✓ ${passed} | ✗ ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
});
