import { readFileSync } from 'node:fs';

function readSummary(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function metricValue(summary, name, field = 'p(99)') {
  return Number(summary.metrics?.[name]?.values?.[field] ?? Number.NaN);
}

const currentPath = process.argv[2];
const baselinePath = process.argv[3];

if (!currentPath) {
  throw new Error('Usage: node perf/k6/check-summary.mjs <current-summary.json> [baseline-summary.json]');
}

const current = readSummary(currentPath);
const baseline = baselinePath ? readSummary(baselinePath) : null;
const metrics = [
  'auth_verify_duration_ms',
  'data_tx_overhead_ms',
  'storage_presign_duration_ms',
  'ratelimit_overhead_ms',
  'idempotency_lookup_ms',
];

if (!baseline) {
  console.log('No baseline summary provided; threshold-only validation assumed.');
  process.exit(0);
}

const degradations = [];
for (const metric of metrics) {
  const currentP99 = metricValue(current, metric);
  const baselineP99 = metricValue(baseline, metric);
  if (!Number.isFinite(currentP99) || !Number.isFinite(baselineP99) || baselineP99 <= 0) {
    continue;
  }
  const increase = ((currentP99 - baselineP99) / baselineP99) * 100;
  if (increase > 10) {
    degradations.push({ metric, currentP99, baselineP99, increase });
  }
}

if (degradations.length > 0) {
  throw new Error(`k6 degradation exceeded 10%: ${JSON.stringify(degradations, null, 2)}`);
}

console.log('k6 baseline comparison passed.');
