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
  throw new Error('Usage: node test/perf/k6/check-summary.mjs <current-summary.json> [baseline-summary.json]');
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

const maxRelativeIncreasePercent = Number(process.env.STYNX_K6_BASELINE_MAX_RELATIVE_INCREASE_PERCENT ?? '10');
const minAbsoluteIncreaseMs = Number(process.env.STYNX_K6_BASELINE_MIN_ABSOLUTE_INCREASE_MS ?? '1');

const degradations = [];
for (const metric of metrics) {
  const currentP99 = metricValue(current, metric);
  const baselineP99 = metricValue(baseline, metric);
  if (!Number.isFinite(currentP99) || !Number.isFinite(baselineP99) || baselineP99 <= 0) {
    continue;
  }
  const absoluteIncrease = currentP99 - baselineP99;
  const increase = (absoluteIncrease / baselineP99) * 100;
  if (increase > maxRelativeIncreasePercent && absoluteIncrease > minAbsoluteIncreaseMs) {
    degradations.push({ metric, currentP99, baselineP99, absoluteIncrease, increase });
  }
}

if (degradations.length > 0) {
  throw new Error(`k6 degradation exceeded thresholds: ${JSON.stringify(degradations, null, 2)}`);
}

console.log('k6 baseline comparison passed.');
