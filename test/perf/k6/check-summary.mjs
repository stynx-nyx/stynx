// Compares a k6 summary with the previous successful main baseline.
//
// Decision record: law/adr/2026-09-12-k6-baseline-comparison.md.
//
// A tracked metric is degraded only when BOTH its p95 and its p99 exceed the
// effective baseline by more than the relative tolerance AND by more than the
// absolute floor. The effective baseline for each statistic is the larger of
// the previous successful run's value and the committed reference floor in
// baseline-reference.json, so a single unusually fast run cannot ratchet the
// bar below the documented steady state. The scenarios' own k6 thresholds
// (for example `p(99)<50` on storage_presign_duration_ms) remain the hard
// line and are enforced by the k6 exit code before this comparison runs.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProxy } from 'node:util/types';

export const trackedMetrics = Object.freeze([
  'auth_verify_duration_ms',
  'data_tx_overhead_ms',
  'storage_presign_duration_ms',
  'ratelimit_overhead_ms',
  'idempotency_lookup_ms',
]);

export const comparedStatistics = Object.freeze(['p(95)', 'p(99)']);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function metricValue(summary, name, field) {
  return Number(summary?.metrics?.[name]?.values?.[field] ?? Number.NaN);
}

export function effectiveBaseline(baseline, reference, metric, statistic) {
  const observed = metricValue(baseline, metric, statistic);
  const floor = Number(reference?.metrics?.[metric]?.[statistic] ?? Number.NaN);
  if (Number.isFinite(observed) && Number.isFinite(floor)) return Math.max(observed, floor);
  return Number.isFinite(observed) ? observed : floor;
}

export function compareSummaries({
  current,
  baseline,
  reference = null,
  maxRelativeIncreasePercent = 10,
  minAbsoluteIncreaseMs = 1,
}) {
  const degradations = [];
  const observations = [];
  for (const metric of trackedMetrics) {
    const statistics = comparedStatistics.map((statistic) => {
      const currentValue = metricValue(current, metric, statistic);
      const baselineValue = effectiveBaseline(baseline, reference, metric, statistic);
      const usable =
        Number.isFinite(currentValue) && Number.isFinite(baselineValue) && baselineValue > 0;
      const absoluteIncrease = usable ? currentValue - baselineValue : Number.NaN;
      const increase = usable ? (absoluteIncrease / baselineValue) * 100 : Number.NaN;
      return {
        statistic,
        current: currentValue,
        baseline: baselineValue,
        absoluteIncrease,
        increase,
        exceeded:
          usable &&
          increase > maxRelativeIncreasePercent &&
          absoluteIncrease > minAbsoluteIncreaseMs,
        usable,
      };
    });
    const comparable = statistics.filter((entry) => entry.usable);
    observations.push({ metric, statistics });
    if (comparable.length === 0) continue;
    if (comparable.every((entry) => entry.exceeded)) {
      degradations.push({ metric, statistics: comparable });
    }
  }
  return { degradations, observations };
}

// Required-tail admission for complete HTTP evidence. This comparison does not
// authenticate a previous-success artifact, establish candidate custody, or
// confer a producer verdict. Those obligations remain with the owning producer.
// Legacy threshold-only and missing-metric behavior above remains unchanged.
export function compareRequiredMetricTails(options) {
  const allowed = new Set(['current', 'baseline', 'reference', 'requiredMetrics']);
  if (
    !options ||
    typeof options !== 'object' ||
    isProxy(options) ||
    Array.isArray(options) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(options)) ||
    Reflect.ownKeys(options).some(
      (key) =>
        !allowed.has(key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(options, key), 'value'),
    )
  )
    throw new Error('Strict k6 comparison requires only declared comparison options');
  const { current, baseline, reference, requiredMetrics } = options;
  if (
    !Array.isArray(requiredMetrics) ||
    isProxy(requiredMetrics) ||
    Object.getPrototypeOf(requiredMetrics) !== Array.prototype ||
    requiredMetrics.length === 0 ||
    Reflect.ownKeys(requiredMetrics).length !== requiredMetrics.length + 1
  )
    throw new Error('Strict k6 comparison requires unique known nonempty requiredMetrics');
  const required = [];
  for (let index = 0; index < requiredMetrics.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(requiredMetrics, String(index));
    if (
      !descriptor ||
      !Object.hasOwn(descriptor, 'value') ||
      !trackedMetrics.includes(descriptor.value)
    )
      throw new Error('Strict k6 comparison requires unique known nonempty requiredMetrics');
    required.push(descriptor.value);
  }
  const requiredSet = new Set(required);
  if (requiredSet.size !== required.length)
    throw new Error('Strict k6 comparison requires unique known nonempty requiredMetrics');
  const selected = {
    current: { metrics: {} },
    baseline: { metrics: {} },
    reference: { metrics: {} },
  };
  for (const metric of required) {
    const tails = {};
    for (const [name, input] of Object.entries({ current, baseline, reference })) {
      tails[name] = {};
      for (const statistic of comparedStatistics) {
        const label = `${name} ${metric} ${statistic}`;
        const path =
          name === 'reference'
            ? ['metrics', metric, statistic]
            : ['metrics', metric, 'values', statistic];
        let value = input;
        for (const key of path) value = strictDataProperty(value, key, label);
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
          throw new Error(`Strict k6 comparison requires usable ${name} ${metric} ${statistic}`);
        tails[name][statistic] = value;
      }
      selected[name].metrics[metric] = name === 'reference' ? tails[name] : { values: tails[name] };
    }
    for (const statistic of comparedStatistics) {
      if (Math.max(tails.baseline[statistic], tails.reference[statistic]) <= 0)
        throw new Error(
          `Strict k6 comparison requires positive effective baseline ${metric} ${statistic}`,
        );
    }
  }
  const report = compareSummaries({
    ...selected,
    maxRelativeIncreasePercent: 10,
    minAbsoluteIncreaseMs: 1,
  });
  return {
    observations: required.map((metric) =>
      report.observations.find((entry) => entry.metric === metric),
    ),
    degradations: report.degradations.filter((entry) => requiredSet.has(entry.metric)),
  };
}

function strictDataProperty(object, key, label) {
  if (object === null || object === undefined) return undefined;
  if (
    typeof object !== 'object' ||
    isProxy(object) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(object))
  )
    throw new Error(`Strict k6 comparison requires usable own data ${label}`);
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) return undefined;
  if (!Object.hasOwn(descriptor, 'value'))
    throw new Error(`Strict k6 comparison requires usable own data ${label}`);
  return descriptor.value;
}

export function loadReference(path) {
  if (!path || !existsSync(path)) return null;
  const reference = readJson(path);
  if (!reference || typeof reference !== 'object' || typeof reference.metrics !== 'object') {
    throw new Error(`k6 baseline reference at ${path} must carry a "metrics" object`);
  }
  return reference;
}

function main() {
  const currentPath = process.argv[2];
  const baselinePath = process.argv[3];
  if (!currentPath) {
    throw new Error(
      'Usage: node test/perf/k6/check-summary.mjs <current-summary.json> [baseline-summary.json]',
    );
  }
  const current = readJson(currentPath);
  if (!baselinePath) {
    console.log('No baseline summary provided; threshold-only validation assumed.');
    return;
  }
  const baseline = readJson(baselinePath);
  const referencePath =
    process.env.STYNX_K6_BASELINE_REFERENCE ??
    resolve(dirname(fileURLToPath(import.meta.url)), 'baseline-reference.json');
  const reference = loadReference(referencePath);
  const { degradations } = compareSummaries({
    current,
    baseline,
    reference,
    maxRelativeIncreasePercent: Number(
      process.env.STYNX_K6_BASELINE_MAX_RELATIVE_INCREASE_PERCENT ?? '10',
    ),
    minAbsoluteIncreaseMs: Number(process.env.STYNX_K6_BASELINE_MIN_ABSOLUTE_INCREASE_MS ?? '1'),
  });
  if (degradations.length > 0) {
    throw new Error(`k6 degradation exceeded thresholds: ${JSON.stringify(degradations, null, 2)}`);
  }
  console.log(`k6 baseline comparison passed${reference ? ' (reference floors applied)' : ''}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
