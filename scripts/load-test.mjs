const BASE = process.argv[2] || 'http://localhost:3000';

const endpoints = [
  { method: 'GET', url: '/api/health', name: 'GET /api/health' },
  { method: 'GET', url: '/api/ready', name: 'GET /api/ready' },
  { method: 'GET', url: '/api/metrics', name: 'GET /api/metrics' },
  { method: 'GET', url: '/api/voices', name: 'GET /api/voices' },
  { method: 'GET', url: '/api/queue/stats', name: 'GET /api/queue/stats' },
  { method: 'GET', url: '/api/cache/stats', name: 'GET /api/cache/stats' },
  { method: 'POST', url: '/api/generate', name: 'POST /api/generate (validation)', body: { text: 123, voice: true } },
  { method: 'POST', url: '/api/jobs', name: 'POST /api/jobs (validation)', body: { text: 'test', voice: 'invalid' } },
];

const CONCURRENCY = 10;
const REQUESTS_PER_ENDPOINT = 20;
const TOTAL = endpoints.length * REQUESTS_PER_ENDPOINT;

async function fetchWithTiming(endpoint) {
  const start = Date.now();
  let status;
  try {
    const res = await fetch(`${BASE}${endpoint.url}`, {
      method: endpoint.method,
      headers: endpoint.body ? { 'Content-Type': 'application/json' } : {},
      body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
    });
    status = res.status;
  } catch (err) {
    status = 0;
  }
  return { ...endpoint, status, duration: Date.now() - start };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function worker(tasks) {
  const results = [];
  for (const t of tasks) {
    results.push(await fetchWithTiming(t));
  }
  return results;
}

async function main() {
  console.log(`Load test: ${BASE}`);
  console.log(`Endpoints: ${endpoints.length}, Concurrency: ${CONCURRENCY}, Per endpoint: ${REQUESTS_PER_ENDPOINT}`);
  console.log('');

  const tasks = shuffle(
    endpoints.flatMap(e =>
      Array.from({ length: REQUESTS_PER_ENDPOINT }, () => e)
    )
  );

  const chunks = [];
  for (let i = 0; i < tasks.length; i += Math.ceil(tasks.length / CONCURRENCY)) {
    chunks.push(tasks.slice(i, i + Math.ceil(tasks.length / CONCURRENCY)));
  }

  const overallStart = Date.now();
  const allResults = (await Promise.all(chunks.map(worker))).flat();
  const totalDuration = Date.now() - overallStart;

  const byName = {};
  for (const r of allResults) {
    if (!byName[r.name]) byName[r.name] = [];
    byName[r.name].push(r);
  }

  let passed = 0;
  let failed = 0;

  for (const [name, results] of Object.entries(byName).sort()) {
    const durations = results.map(r => r.duration).sort((a, b) => a - b);
    const ok = results.filter(r => r.status >= 200 && r.status < 500).length;
    const err = results.length - ok;
    const min = durations[0];
    const max = durations[durations.length - 1];
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const p50 = durations[Math.floor(durations.length * 0.5)];
    const p95 = durations[Math.floor(durations.length * 0.95)];
    const p99 = durations[Math.floor(durations.length * 0.99)];
    passed += ok;
    failed += err;
    console.log(`${name}`);
    console.log(`  ok=${ok} err=${err} | min=${min}ms avg=${avg.toFixed(0)}ms max=${max}ms p50=${p50}ms p95=${p95}ms p99=${p99}ms`);
  }

  console.log('');
  console.log(`Total: ${TOTAL} requests in ${totalDuration}ms (${(TOTAL / totalDuration * 1000).toFixed(1)} req/s)`);
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Load test failed:', err);
  process.exit(1);
});
