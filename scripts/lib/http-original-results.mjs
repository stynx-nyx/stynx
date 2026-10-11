import { types } from 'node:util';
import { compareRequiredMetricTails } from '../../test/perf/k6/check-summary.mjs';
import { parseBaselineJson } from './k6-baseline-json.mjs';
import { readHttpQualificationArtifact } from './http-qualification-artifacts.mjs';
import { httpOriginalScenarioProfile } from './http-original-scenarios.mjs';
import { readHttpOriginalMetricStream } from './http-original-stream.mjs';

// Reconstruction only. Neither structural selector data, valid gzip, a native
// threshold nor a supplied baseline is process/origin/profile admission.
// Exact unchanged run-scenarios.mjs K6_SUMMARY_TREND_STATS projection. The
// parent binds that runner/helper and actual manifest to its candidate; this
// component never reads a different checkout's law to select a profile.
const trendStatistics = Object.freeze(['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)']);
const statisticRosters = Object.freeze({
  counter: ['count', 'rate'],
  gauge: ['value', 'min', 'max'],
  rate: ['rate', 'passes', 'fails'],
  trend: trendStatistics,
});
const requirements = Object.freeze({
  auth: {
    name: 'auth_flow',
    components: { auth_verify_duration_ms: 10 },
    httpMs: 500,
    failureRate: 0.01,
  },
  crud: {
    name: 'crud_flow',
    components: { data_tx_overhead_ms: 2, ratelimit_overhead_ms: 1, idempotency_lookup_ms: 5 },
    httpMs: 750,
    failureRate: 0.02,
  },
  upload: {
    name: 'upload_flow',
    components: { storage_presign_duration_ms: 50 },
    httpMs: 1000,
    failureRate: 0.02,
  },
  'cascade-delete': {
    name: 'cascade_delete',
    components: { data_tx_overhead_ms: 2 },
    httpMs: 1000,
    failureRate: 0.02,
  },
});
const limits = Object.freeze({
  metrics: 512,
  submetrics: 128,
  trendSamples: 8_000_000,
  checks: 4096,
});
function refuse(message) {
  throw new Error(`HTTP_ORIGINAL_RESULTS_REFUSED: ${message}`);
}
const plain = (value) =>
  !!value &&
  typeof value === 'object' &&
  !types.isProxy(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
function closed(value, keys) {
  if (
    !plain(value) ||
    Reflect.ownKeys(value).length !== keys.length ||
    keys.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value');
    })
  )
    refuse('closed own-data fields');
}
function strings(value) {
  if (value === null) return;
  if (
    !plain(value) ||
    Object.entries(value).some(([key, entry]) => !key || typeof entry !== 'string')
  )
    refuse('native tag/metadata map');
}
function finite(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) refuse('finite native value');
  return value;
}
function natural(value) {
  if (!Number.isSafeInteger(value) || value < 0) refuse('native nonnegative integer');
  return value;
}
function equal(actual, expected, label) {
  // IEEE arithmetic may differ by a few final bits between Go and JS. This
  // bound only reconciles arithmetic; hard thresholds/comparison remain strict.
  if (
    Math.abs(finite(actual) - finite(expected)) >
    Number.EPSILON * 16 * Math.max(1, Math.abs(actual), Math.abs(expected))
  )
    refuse(`summary/stream disagreement: ${label}`);
}
function sink(type, name) {
  if (!['counter', 'gauge', 'rate', 'trend'].includes(type)) refuse('native metric type');
  return {
    type,
    name,
    count: 0,
    sum: 0,
    nonzero: 0,
    minimum: null,
    maximum: null,
    last: null,
    chunks: [],
  };
}
function add(state, value, budget) {
  state.count += 1;
  if (state.type === 'trend') {
    budget.samples += 1;
    if (budget.samples > limits.trendSamples) refuse('complete trend sample memory bound');
    const offset = (state.count - 1) % 16_384;
    if (!offset) state.chunks.push(new Float64Array(16_384));
    state.chunks.at(-1)[offset] = value;
  }
  state.sum += value;
  if (!Number.isFinite(state.sum)) refuse('native aggregate overflow');
  state.nonzero += value !== 0 ? 1 : 0;
  state.minimum = state.minimum === null ? value : Math.min(state.minimum, value);
  state.maximum = state.maximum === null ? value : Math.max(state.maximum, value);
  state.last = value;
}
function values(state, durationMs) {
  if (!state.count) refuse(`empty metric ${state.name}`);
  if (state.type === 'counter') return { count: state.sum, rate: (state.sum * 1000) / durationMs };
  if (state.type === 'gauge')
    return { value: state.last, min: state.minimum, max: Math.max(0, state.maximum) };
  if (state.type === 'rate')
    return {
      rate: state.nonzero / state.count,
      passes: state.nonzero,
      fails: state.count - state.nonzero,
    };
  const sorted = new Float64Array(state.count);
  let offset = 0;
  for (const chunk of state.chunks) {
    const length = Math.min(chunk.length, sorted.length - offset);
    sorted.set(chunk.subarray(0, length), offset);
    offset += length;
  }
  state.chunks = [];
  sorted.sort();
  const percentile = (fraction) => {
    const index = fraction * (sorted.length - 1);
    return (
      sorted[Math.floor(index)] +
      (sorted[Math.ceil(index)] - sorted[Math.floor(index)]) * (index - Math.floor(index))
    );
  };
  const result = {
    min: state.minimum,
    max: state.maximum,
    avg: state.sum / state.count,
    med: percentile(0.5),
  };
  for (const fraction of [0.5, 0.9, 0.95, 0.99])
    result[`p(${fraction * 100})`] = percentile(fraction);
  return result;
}

function checkSummaryGroups(group, expected, seen, depth = 0) {
  if (
    !plain(group) ||
    depth > 32 ||
    typeof group.path !== 'string' ||
    !Array.isArray(group.checks) ||
    !Array.isArray(group.groups)
  )
    refuse('native check group');
  for (const check of group.checks) {
    if (
      !plain(check) ||
      typeof check.name !== 'string' ||
      typeof check.id !== 'string' ||
      typeof check.path !== 'string'
    )
      refuse('native check identity');
    const key = JSON.stringify([group.path, check.name]);
    if (seen.has(key) || seen.size >= limits.checks) refuse('duplicate/too many native checks');
    seen.add(key);
    const actual = expected.get(key);
    if (!actual || natural(check.passes) !== actual.passes || natural(check.fails) !== actual.fails)
      refuse('native check outcome mismatch');
  }
  for (const child of group.groups) checkSummaryGroups(child, expected, seen, depth + 1);
}

export async function reconcileHttpOriginalResults(root, options) {
  if (arguments.length !== 2 || typeof root !== 'string') refuse('closed arguments');
  closed(options, [
    'scenarioId',
    'profileId',
    'summaryPath',
    'metricStreamPath',
    'baseline',
    'reference',
  ]);
  return reconcileOriginalResults(root, options, false);
}

/** Numeric bootstrap reconstruction only. No predecessor, seed designation,
 * native lifetime or host capability is inferred from these structural inputs.
 */
export async function reconcileHttpOriginalBootstrapResults(root, options) {
  if (arguments.length !== 2 || typeof root !== 'string') refuse('closed arguments');
  closed(options, ['scenarioId', 'profileId', 'summaryPath', 'metricStreamPath', 'reference']);
  if (options.profileId !== 'local') refuse('bootstrap requires the unchanged local profile');
  return reconcileOriginalResults(root, options, true);
}

function referenceFloors(reference, required) {
  const own = (value, key) => {
    if (!plain(value)) refuse('bootstrap reference own-data object');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
      refuse('bootstrap reference own-data field');
    return descriptor.value;
  };
  const metrics = own(reference, 'metrics');
  return Object.keys(required.components).map((metric) => {
    const tails = own(metrics, metric);
    const values = Object.fromEntries(
      ['p(95)', 'p(99)'].map((statistic) => {
        const value = finite(own(tails, statistic));
        if (value < 0) refuse('bootstrap reference floor domain');
        return [statistic, value];
      }),
    );
    return { metric, values };
  });
}

async function reconcileOriginalResults(root, options, bootstrap) {
  const { scenarioId, profileId, summaryPath, metricStreamPath, baseline, reference } = options;
  if (
    typeof scenarioId !== 'string' ||
    typeof profileId !== 'string' ||
    !Object.hasOwn(requirements, scenarioId) ||
    !['local', 'hardening'].includes(profileId) ||
    typeof summaryPath !== 'string' ||
    typeof metricStreamPath !== 'string' ||
    summaryPath === metricStreamPath
  )
    refuse('fixed scenario/profile/artifact paths');
  const required = requirements[scenarioId];
  const profile = httpOriginalScenarioProfile({ scenarioId, profileId }).nominalProfile;
  const expectedMinimum = profile.rate * profile.durationSeconds;
  natural(expectedMinimum);
  const summaryArtifact = readHttpQualificationArtifact(root, summaryPath);
  const summary = parseBaselineJson(summaryArtifact.bytes);
  if (
    !plain(summary) ||
    !plain(summary.metrics) ||
    !plain(summary.state) ||
    !plain(summary.options) ||
    !Array.isArray(summary.options.summaryTrendStats) ||
    summary.options.summaryTrendStats.length !== trendStatistics.length ||
    trendStatistics.some(
      (statistic, index) => summary.options.summaryTrendStats[index] !== statistic,
    )
  )
    refuse('native summary shape');
  const durationMs = finite(summary.state.testRunDurationMs);
  if (durationMs <= 0 || durationMs > (profile.durationSeconds + 300) * 1000)
    refuse('reported duration');
  const budget = { samples: 0 };
  const metrics = new Map();
  const checks = new Map();
  let points = 0;
  let firstTimestamp = null;
  let lastTimestamp = null;
  const iterator = readHttpOriginalMetricStream(root, metricStreamPath);
  let streamArtifact;
  try {
    while (true) {
      const item = await iterator.next();
      if (item.done) {
        streamArtifact = item.value;
        break;
      }
      const envelope = parseBaselineJson(item.value);
      closed(envelope, ['type', 'metric', 'data']);
      if (typeof envelope.metric !== 'string' || !envelope.metric || envelope.metric.length > 512)
        refuse('metric name');
      const { metric: name, data } = envelope;
      if (envelope.type === 'Metric') {
        closed(data, ['name', 'type', 'contains', 'thresholds', 'submetrics']);
        if (
          data.name !== name ||
          metrics.has(name) ||
          metrics.size >= limits.metrics ||
          !['default', 'time', 'data'].includes(data.contains) ||
          !Array.isArray(data.thresholds) ||
          data.thresholds.some((entry) => typeof entry !== 'string') ||
          new Set(data.thresholds).size !== data.thresholds.length ||
          !(data.submetrics === null || Array.isArray(data.submetrics))
        )
          refuse('native metric declaration');
        const state = {
          ...sink(data.type, name),
          contains: data.contains,
          thresholds: data.thresholds,
          submetrics: [],
          nativeDeclaration: true,
        };
        metrics.set(name, state);
        for (const submetric of data.submetrics ?? []) {
          closed(submetric, ['name', 'suffix', 'tags']);
          strings(submetric.tags);
          if (
            !submetric.tags ||
            typeof submetric.name !== 'string' ||
            typeof submetric.suffix !== 'string' ||
            submetric.name !== `${name}{${submetric.suffix}}` ||
            metrics.has(submetric.name) ||
            metrics.size >= limits.metrics ||
            state.submetrics.length >= limits.submetrics
          )
            refuse('native submetric declaration');
          const sub = {
            ...sink(data.type, submetric.name),
            contains: data.contains,
            tags: submetric.tags,
            nativeDeclaration: false,
          };
          state.submetrics.push(sub);
          metrics.set(submetric.name, sub);
        }
        continue;
      }
      if (envelope.type !== 'Point') refuse('native envelope type');
      closed(
        data,
        Object.hasOwn(data, 'metadata')
          ? ['time', 'value', 'tags', 'metadata']
          : ['time', 'value', 'tags'],
      );
      const state = metrics.get(name);
      if (!state?.nativeDeclaration) refuse('point before native declaration');
      if (
        typeof data.time !== 'string' ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/u.test(data.time) ||
        !Number.isFinite(Date.parse(data.time))
      )
        refuse('native sample timestamp');
      const timestamp = Date.parse(data.time);
      firstTimestamp = firstTimestamp === null ? timestamp : Math.min(firstTimestamp, timestamp);
      lastTimestamp = lastTimestamp === null ? timestamp : Math.max(lastTimestamp, timestamp);
      const value = finite(data.value);
      strings(data.tags);
      if (Object.hasOwn(data, 'metadata')) strings(data.metadata);
      if (
        (['checks', 'http_req_failed'].includes(name) && value !== 0 && value !== 1) ||
        ((Object.hasOwn(required.components, name) || name === 'http_req_duration') && value < 0)
      )
        refuse('native value domain');
      if (['iterations', 'dropped_iterations', 'http_reqs'].includes(name)) natural(value);
      add(state, value, budget);
      for (const sub of state.submetrics)
        if (Object.entries(sub.tags).every(([key, expected]) => data.tags?.[key] === expected))
          add(sub, value, budget);
      points += 1;
      if (name === 'checks') {
        if (typeof data.tags?.check !== 'string' || typeof data.tags?.group !== 'string')
          refuse('missing native check/group system tags');
        const key = JSON.stringify([data.tags.group, data.tags.check]);
        if (!checks.has(key)) {
          if (checks.size >= limits.checks) refuse('check population bound');
          checks.set(key, { group: data.tags.group, name: data.tags.check, passes: 0, fails: 0 });
        }
        checks.get(key)[value ? 'passes' : 'fails'] += 1;
      }
    }
  } finally {
    await iterator.return();
  }
  const reconstructed = Object.create(null);
  const nativeThresholds = [];
  for (const [name, state] of metrics) {
    // Empty native submetrics do not appear in the native end summary.
    if (!state.count && !Object.hasOwn(summary.metrics, name)) continue;
    const metric = summary.metrics[name];
    if (
      !plain(metric) ||
      metric.type !== state.type ||
      metric.contains !== state.contains ||
      !plain(metric.values)
    )
      refuse(`missing/mismatched summary metric ${name}`);
    closed(metric.values, statisticRosters[state.type]);
    const actual = values(state, durationMs);
    for (const [statistic, value] of Object.entries(metric.values)) {
      if (!Object.hasOwn(actual, statistic)) refuse(`unsupported native statistic ${statistic}`);
      equal(value, actual[statistic], `${name}.${statistic}`);
    }
    reconstructed[name] = {
      type: state.type,
      contains: state.contains,
      sampleCount: state.count,
      values: actual,
    };
    if (metric.thresholds !== undefined) {
      if (!plain(metric.thresholds)) refuse('native threshold results');
      for (const [expression, result] of Object.entries(metric.thresholds)) {
        closed(result, ['ok']);
        if (typeof result.ok !== 'boolean') refuse('native threshold outcome');
        nativeThresholds.push({ metric: name, expression, ok: result.ok });
      }
    }
    if (state.nativeDeclaration) {
      const declared = Object.keys(metric.thresholds ?? {});
      if (
        declared.length !== state.thresholds.length ||
        state.thresholds.some((expression) => !declared.includes(expression))
      )
        refuse('native stream/summary threshold declarations');
    }
  }
  if (Object.keys(summary.metrics).some((name) => !Object.hasOwn(reconstructed, name)))
    refuse('unreconstructed summary metric');
  const seenChecks = new Set();
  checkSummaryGroups(summary.root_group, checks, seenChecks);
  if (seenChecks.size !== checks.size || !checks.size) refuse('incomplete native checks');
  const hardGates = [
    ...Object.entries(required.components).map(([metric, maximum]) => ({
      metric,
      statistic: 'p(99)',
      maximum,
    })),
    { metric: 'http_req_duration', statistic: 'p(95)', maximum: required.httpMs },
    { metric: 'http_req_failed', statistic: 'rate', maximum: required.failureRate },
  ].map(({ metric, statistic, maximum }) => {
    const value = reconstructed[metric]?.values?.[statistic];
    if (value === undefined) refuse(`missing required metric tail ${metric}.${statistic}`);
    const expression = `${statistic}<${maximum}`;
    const native = nativeThresholds.find(
      (row) => row.metric === metric && row.expression === expression,
    );
    if (!native) refuse(`missing unchanged native threshold ${metric}:${expression}`);
    const ok = value < maximum;
    if (native.ok !== ok) refuse('native threshold/reconstructed outcome disagreement');
    return { metric, statistic, expression, value, maximum, ok };
  });
  // A bootstrap has no predecessor. The committed floors are required data,
  // never a fabricated prior run or a new regression-to-reference threshold.
  const comparison = bootstrap
    ? {
        verdict: 'NOT_EVALUABLE',
        reason: 'PROSPECTIVE_LOCAL_BOOTSTRAP_HAS_NO_PREDECESSOR',
        referenceFloors: referenceFloors(reference, required),
      }
    : compareRequiredMetricTails({
        current: summary,
        baseline,
        reference,
        requiredMetrics: Object.keys(required.components),
      });
  const completed = natural(reconstructed.iterations?.values?.count);
  const dropped =
    reconstructed.dropped_iterations === undefined
      ? null
      : natural(reconstructed.dropped_iterations.values.count);
  const failures = [];
  if (completed < expectedMinimum)
    failures.push('completed-iterations-below-original-profile-minimum');
  if (dropped !== null && dropped > 0) failures.push('native-dropped-iterations');
  if (durationMs < profile.durationSeconds * 1000)
    failures.push('reported-run-duration-below-original-window');
  if (hardGates.some((row) => !row.ok) || nativeThresholds.some((row) => !row.ok))
    failures.push('native-threshold-failure');
  if (!bootstrap && comparison.degradations.length)
    failures.push('required-component-tail-regression');
  if ([...checks.values()].some((row) => row.fails > 0)) failures.push('native-check-failure');
  return {
    schemaVersion: '1.0.0',
    kind: bootstrap
      ? 'http-original-local-bootstrap-native-results-component'
      : 'http-original-native-results-component',
    scenarioId,
    profileId,
    scenarioName: required.name,
    declaredProfile: profile,
    profileDeclaration: {
      sourcePath: 'scripts/lib/http-original-scenarios.mjs',
      fixedSourceOwnedTuple: true,
      actualCandidateManifestVerified: false,
    },
    artifacts: { summary: summaryArtifact.row, metricStream: streamArtifact },
    native: {
      metrics: reconstructed,
      checks: [...checks.values()],
      thresholds: nativeThresholds,
      pointCount: points,
      firstPointUnixMs: firstTimestamp,
      lastPointUnixMs: lastTimestamp,
      reportedTestRunDurationMs: durationMs,
    },
    hardGates,
    comparison,
    failures,
    accounting: {
      minimumNominalIterations: expectedMinimum,
      completedIterations: completed,
      completedAboveNominalMinimum: Math.max(0, completed - expectedMinimum),
      droppedIterations: dropped,
      droppedObservation: dropped === null ? 'UNVERIFIED_NO_NATIVE_SAMPLE' : 'NATIVE_COUNTER',
      startedIterations: null,
      interruptedIterations: null,
      startedInterruptedVerdict: 'UNVERIFIED_NOT_EXPORTED_BY_NATIVE_SUMMARY_OR_METRIC_STREAM',
      wholeSchedulerWindowVerdict: 'UNVERIFIED_REPORTED_TEST_DURATION_IS_NOT_SCHEDULER_CUSTODY',
      runtimeErrorVerdict: 'UNVERIFIED_REQUIRES_OWNED_PROCESS_LOG_AND_EXIT',
    },
    verdict: failures.length ? 'FAIL' : bootstrap ? 'UNKNOWN' : 'UNVERIFIED',
    streamReconstructionComplete: true,
    nativeSummaryReconciled: true,
    fullExecutionComplete: false,
    baselineOriginVerified: false,
    nativeProcessVerified: false,
    readinessPromoting: false,
  };
}
