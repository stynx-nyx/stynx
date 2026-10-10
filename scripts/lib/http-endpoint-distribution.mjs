// Statistical reconstruction only. Runtime, outcome, workload and raw-sample
// custody must be independently established by the owning HTTP producer.
// Percentiles match the pinned k6 v0.49.0 TrendSink.P interpolation algorithm.
import { isProxy } from 'node:util/types';

const defaultLimits = Object.freeze({
  read: Object.freeze({ p50Ms: 200, p95Ms: 800 }),
  write: Object.freeze({ p50Ms: 500, p95Ms: 2000 }),
});

function closedObject(value, keys, label) {
  if (
    !value ||
    isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key)) ||
    Reflect.ownKeys(value).some(
      (key) =>
        typeof key !== 'string' ||
        !keys.includes(key) ||
        !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'),
    )
  )
    throw new Error(`Invalid ${label}`);
}

function percentile(sorted, fraction) {
  const index = fraction * (sorted.length - 1);
  const lower = Math.floor(index);
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
}

/**
 * Reconstruct one operation/case from every target outcome, including failures.
 * This function emits no release, census, provenance or measurement verdict.
 */
export function reconstructEndpointDistribution(options) {
  closedObject(
    options,
    ['operationId', 'effect', 'samples', 'expectedCount', 'slo'],
    'endpoint distribution options',
  );
  const { operationId, effect, samples, expectedCount, slo } = options;
  if (typeof operationId !== 'string' || !operationId.trim())
    throw new Error('Invalid endpoint operation identity');
  if (typeof effect !== 'string' || !Object.hasOwn(defaultLimits, effect))
    throw new Error('Unknown endpoint business effect');
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 1)
    throw new Error('Invalid expected endpoint sample count');
  if (
    !Array.isArray(samples) ||
    isProxy(samples) ||
    Object.getPrototypeOf(samples) !== Array.prototype ||
    samples.length !== expectedCount ||
    Reflect.ownKeys(samples).length !== expectedCount + 1
  )
    throw new Error('Missing or invalid endpoint sample population');
  closedObject(slo, ['p50Ms', 'p95Ms'], 'endpoint SLO');
  for (const key of ['p50Ms', 'p95Ms']) {
    if (
      typeof slo[key] !== 'number' ||
      !Number.isFinite(slo[key]) ||
      slo[key] <= 0 ||
      slo[key] > defaultLimits[effect][key]
    )
      throw new Error(`Invalid or weakened endpoint SLO: ${key}`);
  }
  const sequences = new Set();
  const durations = [];
  let unexpectedOutcomes = 0;
  for (let index = 0; index < expectedCount; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(samples, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value'))
      throw new Error('Invalid endpoint sample array member');
    const sample = descriptor.value;
    closedObject(sample, ['sequence', 'durationMs', 'outcomeAccepted'], 'endpoint sample');
    if (
      !Number.isSafeInteger(sample.sequence) ||
      sample.sequence < 0 ||
      sample.sequence >= expectedCount ||
      sequences.has(sample.sequence)
    )
      throw new Error('Invalid or duplicate endpoint sample sequence');
    if (
      typeof sample.durationMs !== 'number' ||
      !Number.isFinite(sample.durationMs) ||
      sample.durationMs <= 0 ||
      typeof sample.outcomeAccepted !== 'boolean'
    )
      throw new Error('Invalid endpoint duration or outcome');
    sequences.add(sample.sequence);
    durations.push(sample.durationMs);
    if (!sample.outcomeAccepted) unexpectedOutcomes += 1;
  }
  durations.sort((left, right) => left - right);
  const distribution = {
    minimumMs: durations[0],
    maximumMs: durations.at(-1),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
  };
  return {
    operationId,
    effect,
    percentileAlgorithm: 'k6-v0.49.0-trend-linear-interpolation',
    expectedCount,
    observedCount: durations.length,
    sampleCountMatches: durations.length === expectedCount,
    unexpectedOutcomes,
    distribution,
    slo: { p50Ms: slo.p50Ms, p95Ms: slo.p95Ms },
    strictLimitBreaches: ['p50Ms', 'p95Ms'].filter((key) => distribution[key] >= slo[key]),
  };
}
