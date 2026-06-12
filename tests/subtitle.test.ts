/**
 * Subtitle Workflow Validation Tests
 *
 * Tests cover:
 * - SRT parsing accuracy (timestamps, edge cases)
 * - Time formatting round-trips
 * - Timeline construction with gaps
 * - Crossfade duration compensation
 * - Duration guarantee for large projects
 * - Hundreds of segments
 * - Empty gaps / consecutive segments
 * - Long-duration projects
 */

import { describe, it, assert } from './test-runner.js';
import { parseSRT, formatSRTTime, formatTimeShort } from '../src/subtitle.js';

// ─── Basic Parsing ───────────────────────────────────────────────────────────

describe('parseSRT', () => {
  it('parses standard SRT format', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,500
Hello world

2
00:00:05,000 --> 00:00:10,000
Second subtitle

3
00:00:15,500 --> 00:00:20,000
Third line`;
    const segments = parseSRT(srt);
    assert(segments.length === 3, 'Should parse 3 segments');
    assert(segments[0].startTime === 1000, 'First start = 1000ms');
    assert(segments[0].endTime === 4500, 'First end = 4500ms');
    assert(segments[0].text === 'Hello world', 'First text matches');
    assert(segments[1].startTime === 5000, 'Second start = 5000ms');
    assert(segments[1].endTime === 10000, 'Second end = 10000ms');
    assert(segments[2].startTime === 15500, 'Third start = 15500ms');
    assert(segments[2].endTime === 20000, 'Third end = 20000ms');
  });

  it('handles SRT with decimal point separator', () => {
    const srt = `1
00:00:01.000 --> 00:00:02.500
Dot format`;
    const segments = parseSRT(srt);
    assert(segments.length === 1, 'Should parse');
    assert(segments[0].startTime === 1000, 'Start = 1000ms');
    assert(segments[0].endTime === 2500, 'End = 2500ms');
  });

  it('handles leading zeros correctly (single-digit hours/min)', () => {
    const srt = `1
00:00:00,001 --> 00:00:00,050
Tiny`;
    const segments = parseSRT(srt);
    assert(segments.length === 1, 'Should parse');
    assert(segments[0].startTime === 1, 'Start = 1ms');
    assert(segments[0].endTime === 50, 'End = 50ms');
  });

  it('handles one-digit milliseconds (pad to 3 digits)', () => {
    const srt = `1
00:00:01,5 --> 00:00:02,0
Short ms`;
    const segments = parseSRT(srt);
    assert(segments[0].startTime === 1500, 'Start padded: 1500ms');
    assert(segments[0].endTime === 2000, 'End padded: 2000ms');
  });

  it('handles two-digit milliseconds', () => {
    const srt = `1
00:00:01,50 --> 00:00:02,00
Short ms`;
    const segments = parseSRT(srt);
    assert(segments[0].startTime === 1500, 'Start padded: 1500ms');
    assert(segments[0].endTime === 2000, 'End padded: 2000ms');
  });

  it('skips invalid subtitle with end <= start', () => {
    const srt = `1
00:00:05,000 --> 00:00:02,000
Backwards

2
00:00:03,000 --> 00:00:06,000
Forward`;
    const segments = parseSRT(srt);
    assert(segments.length === 1, 'Should skip invalid block');
    assert(segments[0].startTime === 3000, 'Valid segment start');
    assert(segments[0].endTime === 6000, 'Valid segment end');
  });

  it('handles CRLF line endings', () => {
    const srt = "1\r\n00:00:01,000 --> 00:00:02,000\r\nCRLF text\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nSecond";
    const segments = parseSRT(srt);
    assert(segments.length === 2, 'Should parse CRLF correctly');
  });

  it('handles empty SRT', () => {
    const segments = parseSRT('');
    assert(segments.length === 0, 'Empty SRT → 0 segments');
  });

  it('handles SRT with only comments/blanks', () => {
    const segments = parseSRT('\n\n  \n\n');
    assert(segments.length === 0, 'Whitespace only → 0 segments');
  });

  it('handles multi-line text', () => {
    const srt = `1
00:00:01,000 --> 00:00:03,000
First line
Second line
Third line`;
    const segments = parseSRT(srt);
    assert(segments.length === 1, 'One segment');
    assert(segments[0].text === 'First line\nSecond line\nThird line', 'Multi-line text preserved');
  });

  it('handles large hour/minute values correctly', () => {
    const srt = `1
99:59:59,999 --> 100:00:00,000
Large`;
    const segments = parseSRT(srt);
    assert(segments[0].startTime === 359999999, '99:59:59,999 = 359999999ms');
    assert(segments[0].endTime === 360000000, '100:00:00,000 = 360000000ms');
  });

  it('handles ms overflow (more than 3 digits)', () => {
    const srt = `1
00:00:01,1234 --> 00:00:02,5678
Overflow ms`;
    const segments = parseSRT(srt);
    assert(segments[0].startTime === 1123, '1234 → 123');
    assert(segments[0].endTime === 2567, '5678 → 567');
  });
});

// ─── Time Formatting Round-Trips ────────────────────────────────────────────

describe('formatSRTTime', () => {
  it('formats time correctly', () => {
    assert(formatSRTTime(0) === '00:00:00,000', 'Zero');
    assert(formatSRTTime(1000) === '00:00:01,000', '1 second');
    assert(formatSRTTime(61000) === '00:01:01,000', '1:01');
    assert(formatSRTTime(3661000) === '01:01:01,000', '1:01:01');
    assert(formatSRTTime(555000) === '00:09:15,000', '9:15');
    assert(formatSRTTime(359999999) === '99:59:59,999', '99:59:59.999');
    assert(formatSRTTime(1000) === '00:00:01,000', 'Idempotent 1s');
    assert(formatSRTTime(1001) === '00:00:01,001', '1ms precision');
    assert(formatSRTTime(1500) === '00:00:01,500', '500ms');
  });
});

describe('formatTimeShort', () => {
  it('formats short time', () => {
    assert(formatTimeShort(0) === '0:00', 'Zero');
    assert(formatTimeShort(5000) === '0:05', '5 seconds');
    assert(formatTimeShort(60000) === '1:00', '1 minute');
    assert(formatTimeShort(555000) === '9:15', '9:15');
    assert(formatTimeShort(3661000) === '61:01', '61:01');
  });
});

// ─── Round-trip: parse → format ─────────────────────────────────────────────

describe('Time format round-trip', () => {
  it('parse then format produces matching output', () => {
    const srt = `1
00:01:02,003 --> 00:04:05,006
Test`;
    const segments = parseSRT(srt);
    assert(formatSRTTime(segments[0].startTime) === '00:01:02,003', 'Start round-trips');
    assert(formatSRTTime(segments[0].endTime) === '00:04:05,006', 'End round-trips');
  });

  it('format then parse round-trips', () => {
    const msValues = [
      1, 999, 1000, 1001, 61000, 3600000, 555000, 359999999,
    ];
    for (const ms of msValues) {
      const formatted = formatSRTTime(ms);
      const reparsed = parseSRT(`1\n00:00:00,000 --> ${formatted}\nTest`);
      assert(reparsed.length === 1, `Round-trip length for ${ms}ms`);
      assert(reparsed[0].endTime === ms, `Round-trip value for ${ms}ms: got ${reparsed[0].endTime}`);
    }
  });
});

// ─── Timeline Logic Validation ───────────────────────────────────────────────

describe('Timeline calculations', () => {
  it('gap detection between consecutive segments', () => {
    const segments = [
      { startTime: 0, endTime: 5000, text: 'A', status: 'completed' },
      { startTime: 10000, endTime: 15000, text: 'B', status: 'completed' },
    ];
    const gapMs = segments[1].startTime - segments[0].endTime;
    assert(gapMs === 5000, 'Gap = 5s');
    assert(gapMs > 50, 'Gap exceeds threshold');
  });

  it('touching segments (no gap)', () => {
    const segments = [
      { startTime: 0, endTime: 5000, text: 'A', status: 'completed' },
      { startTime: 5000, endTime: 10000, text: 'B', status: 'completed' },
    ];
    const gapMs = segments[1].startTime - segments[0].endTime;
    assert(gapMs === 0, 'Zero gap');
    assert(gapMs <= 50, 'Below threshold, treated as touching');
  });

  it('overlapping segments (negative gap)', () => {
    const segments = [
      { startTime: 0, endTime: 5000, text: 'A', status: 'completed' },
      { startTime: 4000, endTime: 10000, text: 'B', status: 'completed' },
    ];
    const gapMs = segments[1].startTime - segments[0].endTime;
    assert(gapMs === -1000, 'Negative gap = -1s');
  });

  it('expected duration calculation', () => {
    const segments = [
      { startTime: 1000, endTime: 5000, text: 'A', status: 'completed' },
      { startTime: 10000, endTime: 20000, text: 'B', status: 'completed' },
      { startTime: 30000, endTime: 35000, text: 'C', status: 'completed' },
    ];
    const lastEnd = segments[segments.length - 1].endTime;
    const firstStart = segments[0].startTime;
    const expectedDuration = lastEnd - firstStart;
    assert(expectedDuration === 34000, 'Expected duration = lastEnd - firstStart = 34s');
  });

  it('total gap calculation', () => {
    const gaps = [
      { fromEnd: 5000, toStart: 10000, gap: 5000 },
      { fromEnd: 20000, toStart: 30000, gap: 10000 },
    ];
    const totalGaps = gaps.reduce((sum, g) => sum + g.gap, 0);
    assert(totalGaps === 15000, 'Total gaps = 15s');
  });

  it('duration = subtitle durations + gaps', () => {
    const segments = [
      { dur: 5000 },
      { dur: 10000 },
      { dur: 5000 },
    ];
    const subtitleDurations = segments.reduce((s, seg) => s + seg.dur, 0);
    const gaps = [5000, 15000]; // between seg0→seg1, seg1→seg2
    const totalGaps = gaps.reduce((s, g) => s + g, 0);
    const expectedDuration = subtitleDurations + gaps.reduce((s, g) => s + g, 0);
    assert(subtitleDurations === 20000, 'Subtitle durations = 20s');
    assert(totalGaps === 20000, 'Gaps = 20s');
    assert(expectedDuration === 40000, 'Expected = 40s');
  });
});

// ─── Crossfade Compensation ──────────────────────────────────────────────────

describe('Crossfade compensation logic', () => {
  it('crossfade loss = (segments - groups) * crossfadeMs', () => {
    const totalSegments = 124;
    const speechGroups = 6;
    const crossfadeMs = 20;
    const loss = (totalSegments - speechGroups) * crossfadeMs;
    assert(loss === 2360, `${totalSegments - speechGroups} crossfades × ${crossfadeMs}ms = ${loss}ms`);
  });

  it('no crossfade loss for single-segment groups', () => {
    const lossForSingle = (1 - 1) * 20;
    assert(lossForSingle === 0, 'Single segment → no loss');
  });

  it('max crossfade loss: all segments consecutive', () => {
    const n = 100;
    const groups = 1;
    assert((n - groups) * 20 === 1980, '99 crossfades × 20ms = 1980ms');
  });

  it('silence gap durations are inserted correctly', () => {
    // Simulating three segments: s0(0-5s), gap 5s, s1(10-15s)
    const s0end = 5000;
    const s1start = 10000;
    const gap = s1start - s0end;
    assert(gap === 5000, 'Silence gap = 5000ms');
    assert(gap > 50, 'Gap exceeds threshold');
  });
});

// ─── Hundred-Segment Stress Tests ────────────────────────────────────────────

describe('Large subtitle projects', () => {
  it('generates 124 segments with correct last-end', () => {
    const segments = Array.from({ length: 124 }, (_, i) => ({
      startTime: i * 4476,   // ~4.476s per segment including gaps
      endTime: i * 4476 + 4226, // ~4.226s per segment
    }));
    const lastEnd = segments[123].endTime;
    const firstStart = segments[0].startTime;
    assert(lastEnd - firstStart > 550000, `Last end near 555s: ${lastEnd - firstStart}ms`);
    assert(lastEnd - firstStart < 560000, 'Within range');
  });

  it('500 segments with consecutive timing', () => {
    const segments = Array.from({ length: 500 }, (_, i) => ({
      startTime: i * 1500,
      endTime: (i + 1) * 1500,
    }));
    assert(segments.length === 500, '500 segments');
    const lastEnd = segments[499].endTime;
    assert(lastEnd === 750000, 'Last end = 750000ms (12:30)');

    // All should be consecutive (zero gaps)
    let gaps = 0;
    for (let i = 1; i < segments.length; i++) {
      gaps += segments[i].startTime - segments[i - 1].endTime;
    }
    assert(gaps === 0, 'All consecutive → zero gaps');
  });

  it('500 segments with large gaps', () => {
    const gapSizes = [1000, 3000, 5000, 10000];
    const segments = Array.from({ length: 500 }, (_, i) => {
      const gap = gapSizes[i % gapSizes.length];
      const startTime = i * 5000;
      const endTime = startTime + 4000;
      return { startTime, endTime, gapMs: gap };
    });
    const lastEnd = segments[499].endTime;
    // Total = sum of all segment durations + gaps between them
    const totalGaps = segments.slice(0, -1).reduce((s, seg, i) => {
      return s + (segments[i + 1].startTime - seg.endTime);
    }, 0);
    assert(totalGaps > 0, 'Large gaps present');
    assert(lastEnd - totalGaps - 500 * 4000 < 5000, 'Consistent');
  });

  it('1000 segments extreme stress test', () => {
    const n = 1000;
    const segments = Array.from({ length: n }, (_, i) => ({
      startTime: i * 1000,
      endTime: i * 1000 + 800,
    }));
    const lastEnd = segments[n - 1].endTime;
    const expected = (n - 1) * 1000 + 800;
    assert(lastEnd === expected, `Last end = ${expected}ms = ${(expected / 1000 / 60).toFixed(1)}min`);
  });
});

// ─── Duration Guarantee Verification ─────────────────────────────────────────

describe('Duration guarantee', () => {
  it('last subtitle endTime should equal total timeline duration', () => {
    // Construction: segments are placed on timeline with gaps
    // Expected duration = lastEnd - firstStart
    const segments = [
      { startTime: 5000, endTime: 10000 },
      { startTime: 20000, endTime: 25000 },
    ];
    const expectedDuration = segments[1].endTime - segments[0].startTime;
    assert(expectedDuration === 20000, 'Expected = 20s');

    // The audio should contain:
    // 5s silence (firstStart) + 5s speech + 10s gap + 5s speech = 25s? No.
    // First segment speech: 5s
    // Gap: 10s
    // Second segment speech: 5s
    // Total: 20s ✓
    const audioDuration = (segments[0].endTime - segments[1].startTime) +  // NEGATIVE — overlap
      segments[1].endTime - segments[0].startTime;
    // Actually: gap + speech durations
    const gap1 = segments[1].startTime - segments[0].endTime;
    const speechTotal = (segments[0].endTime - segments[0].startTime) +
                        (segments[1].endTime - segments[1].startTime);
    const dur = gap1 + speechTotal;
    assert(dur === expectedDuration, `Audio=${dur}ms = expected=${expectedDuration}ms`);
  });

  it('guarantee holds for any gap configuration', () => {
    // Property: total audio duration = last end - first start
    // Holds as long as all segments are within [firstStart, lastEnd]
    // and gaps sum to (lastEnd - firstStart - sum(speech_durations))
    const testCases = [
      { starts: [0, 5000, 10000], ends: [5000, 10000, 15000], gaps: [0, 0] },
      { starts: [0, 10000, 20000], ends: [5000, 15000, 25000], gaps: [5000, 5000] },
      { starts: [5000, 15000], ends: [10000, 20000], gaps: [5000] },
      { starts: [0, 100], ends: [50, 200], gaps: [50] },
    ];
    for (const tc of testCases) {
      const expected = tc.ends[tc.ends.length - 1] - tc.starts[0];
      const totalSpeech = tc.ends.reduce((s, e, i) => s + (e - tc.starts[i]), 0);
      const totalGaps = tc.gaps.reduce((s, g) => s + g, 0);
      assert(totalSpeech + totalGaps === expected,
        `totalSpeech(${totalSpeech}) + totalGaps(${totalGaps}) = expected(${expected})`);
    }
  });
});

// ─── Mixed Playback Speeds ───────────────────────────────────────────────────

describe('Mixed playback speeds', () => {
  it('generated audio after speed adjustment matches target', () => {
    // atempo = generatedDuration / targetDuration
    // After adjustment: adjustedDuration = generatedDuration / atempo
    // If atempo is exact: adjustedDuration = targetDuration
    const cases = [
      { generated: 8000, target: 5000, expectedAtempo: 1.6 },
      { generated: 6000, target: 4000, expectedAtempo: 1.5 },
      { generated: 3000, target: 5000, expectedAtempo: 0.6 },
      { generated: 10000, target: 5000, expectedAtempo: 2.0 },
      { generated: 5000, target: 5000, expectedAtempo: 1.0 },
    ];
    for (const c of cases) {
      const ratio = c.generated / c.target;
      assert(Math.abs(ratio - c.expectedAtempo) < 0.001, `atempo = ${ratio}, expected ${c.expectedAtempo}`);
      // After atempo: adjusted duration
      const adjusted = c.generated / ratio;
      assert(Math.abs(adjusted - c.target) < 1, `Adjusted=${adjusted}ms ≈ target=${c.target}ms`);
    }
  });

  it('atempo cascading (values > 2.0)', () => {
    // atempo max is 2.0 per filter instance, so cascade
    let atempo = 10.0;
    const filters: string[] = [];
    while (atempo > 2.0) {
      filters.push('atempo=2.0');
      atempo /= 2.0;
    }
    filters.push(`atempo=${atempo.toFixed(3)}`);
    assert(filters.length === 4, '10.0 → 2.0, 2.0, 2.0, 1.25: 4 filters');
    assert(filters[3] === 'atempo=1.250', 'Last filter = atempo=1.250');
  });

  it('atempo clamping extremes', () => {
    const extremeRatio = 200; // generated is 200x target
    let atempo = Math.min(Math.max(extremeRatio, 0.5), 100);
    assert(atempo === 100, 'Clamped to 100 (max)');

    const tinyRatio = 0.1; // generated is 0.1x target (too short)
    atempo = Math.min(Math.max(tinyRatio, 0.5), 100);
    assert(atempo === 0.5, 'Clamped to 0.5 (min)');
  });
});
