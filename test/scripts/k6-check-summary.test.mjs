import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  compareRequiredMetricTails,
  compareSummaries,
  comparedStatistics,
  effectiveBaseline,
  loadReference,
  trackedMetrics,
} from '../perf/k6/check-summary.mjs';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const scriptPath = join(repoRoot, 'test', 'perf', 'k6', 'check-summary.mjs');
const referencePath = join(repoRoot, 'test', 'perf', 'k6', 'baseline-reference.json');

// Numbers below are the storage_presign_duration_ms statistics observed on the
// 1.3.0 candidate during the 2026-09-12 hardening runs and bisect:
//   baseline (run 34645168917): p95 7.835  p99 10.57
//   run 34684152419:            p95 22.846 p99 117.816  (max 327; breaches the 50 ms threshold)
//   run 34685475432:            p95 8.114  p99 35.646   (median unchanged)
//   run 34687645676:            p95 4.875  p99 8.214    (the passing run; would become the ratchet)
function summary(values) {
  return {
    metrics: Object.fromEntries(
      Object.entries(values).map(([metric, stats]) => [
        metric,
        { values: { med: stats.med ?? 1, 'p(95)': stats.p95, 'p(99)': stats.p99 } },
      ]),
    ),
  };
}

const steady = {
  auth_verify_duration_ms: { p95: 0.261, p99: 0.318 },
  data_tx_overhead_ms: { p95: 0.213, p99: 0.225 },
  storage_presign_duration_ms: { p95: 7.835, p99: 10.57 },
  ratelimit_overhead_ms: { p95: 0.15, p99: 0.163 },
  idempotency_lookup_ms: { p95: 0.148, p99: 0.165 },
};

test('the tracked metric roster and compared statistics are the documented ones', () => {
  assert.deepEqual(
    [...trackedMetrics],
    [
      'auth_verify_duration_ms',
      'data_tx_overhead_ms',
      'storage_presign_duration_ms',
      'ratelimit_overhead_ms',
      'idempotency_lookup_ms',
    ],
  );
  assert.deepEqual([...comparedStatistics], ['p(95)', 'p(99)']);
  const reference = loadReference(referencePath);
  assert.deepEqual(Object.keys(reference.metrics).sort(), [...trackedMetrics].sort());
  for (const metric of trackedMetrics) {
    for (const statistic of comparedStatistics) {
      assert.ok(reference.metrics[metric][statistic] > 0, `${metric} ${statistic}`);
    }
    assert.ok(reference.metrics[metric]['p(95)'] <= reference.metrics[metric]['p(99)']);
  }
});

function strictInput(requiredMetrics = [...trackedMetrics]) {
  return {
    current: summary(steady),
    baseline: summary(steady),
    reference: loadReference(referencePath),
    requiredMetrics,
  };
}

test('strict comparison requires both real observed tails and reference floors for every declared metric', () => {
  const input = strictInput();
  const original = structuredClone(input);
  const report = compareRequiredMetricTails(input);
  assert.deepEqual(Object.keys(report).sort(), ['degradations', 'observations']);
  assert.deepEqual(report.degradations, []);
  assert.deepEqual(
    report.observations.map(({ metric }) => metric),
    [...trackedMetrics],
  );
  for (const observation of report.observations) {
    assert.deepEqual(
      observation.statistics.map(({ statistic }) => statistic),
      ['p(95)', 'p(99)'],
    );
    assert.equal(
      observation.statistics.every(({ usable }) => usable),
      true,
    );
  }
  assert.deepEqual(input, original);
});

test('strict comparison reports only the declared metric population in declaration order', () => {
  const requiredMetrics = ['storage_presign_duration_ms', 'auth_verify_duration_ms'];
  const input = strictInput(requiredMetrics);
  input.current.metrics.ratelimit_overhead_ms.values['p(95)'] = 'unrelated';
  const report = compareRequiredMetricTails(input);
  assert.deepEqual(
    report.observations.map(({ metric }) => metric),
    requiredMetrics,
  );
  assert.deepEqual(report.degradations, []);
});

test('strict comparison rejects missing, empty, duplicate, unknown and non-array required populations', () => {
  for (const requiredMetrics of [
    undefined,
    null,
    [],
    '',
    'auth_verify_duration_ms',
    ['unknown_duration_ms'],
    ['auth_verify_duration_ms', 'auth_verify_duration_ms'],
    [undefined],
    Array(1),
    [1],
  ]) {
    assert.throws(
      () => compareRequiredMetricTails({ ...strictInput(), requiredMetrics }),
      /requiredMetrics/u,
    );
  }
});

test('strict comparison rejects unknown options and threshold overrides rather than ignoring them', () => {
  for (const field of [
    'maxRelativeIncreasePercent',
    'minAbsoluteIncreaseMs',
    'allowMissing',
    'verdict',
  ]) {
    assert.throws(
      () => compareRequiredMetricTails({ ...strictInput(), [field]: 9999 }),
      /options/u,
    );
  }
  for (const input of [undefined, null, [], false, 'input'])
    assert.throws(() => compareRequiredMetricTails(input), /options/u);
  for (const field of ['hiddenThresholdOverride', Symbol('thresholdOverride')]) {
    const input = strictInput();
    Object.defineProperty(input, field, { value: 9999 });
    assert.throws(() => compareRequiredMetricTails(input), /options/u);
  }
});

test('strict comparison rejects every missing, coerced, nonfinite or negative required tail independently', () => {
  const metric = 'storage_presign_duration_ms';
  for (const name of ['current', 'baseline', 'reference']) {
    for (const statistic of ['p(95)', 'p(99)']) {
      for (const invalid of [undefined, null, '10', true, NaN, Infinity, -Infinity, -1, {}, []]) {
        const input = strictInput([metric]);
        const tails =
          name === 'reference' ? input[name].metrics[metric] : input[name].metrics[metric].values;
        tails[statistic] = invalid;
        assert.throws(
          () => compareRequiredMetricTails(input),
          (error) =>
            error instanceof Error &&
            error.message.includes(name) &&
            error.message.includes(metric) &&
            error.message.includes(statistic),
        );
      }
    }
    const absentMetric = strictInput([metric]);
    delete absentMetric[name].metrics[metric];
    assert.throws(() => compareRequiredMetricTails(absentMetric), /usable/u);
    const absentSummary = strictInput([metric]);
    delete absentSummary[name];
    assert.throws(() => compareRequiredMetricTails(absentSummary), /usable/u);
  }
});

test('strict comparison refuses legacy missing-metric skips and reference-only baseline rescue', () => {
  const metric = 'storage_presign_duration_ms';
  const absent = {
    current: {},
    baseline: {},
    reference: loadReference(referencePath),
    requiredMetrics: [metric],
  };
  assert.deepEqual(compareSummaries(absent).degradations, []);
  assert.throws(() => compareRequiredMetricTails(absent), /current/u);
  const rescued = { ...strictInput([metric]), baseline: {} };
  const legacy = compareSummaries(rescued).observations.find((entry) => entry.metric === metric);
  assert.equal(
    legacy.statistics.every(({ usable }) => usable),
    true,
  );
  assert.throws(() => compareRequiredMetricTails(rescued), /baseline/u);
});

test('strict comparison refuses numeric-string coercion and a single remaining usable tail', () => {
  const metric = 'storage_presign_duration_ms';
  const coerced = strictInput([metric]);
  coerced.current.metrics[metric].values['p(95)'] = '7.835';
  assert.equal(
    compareSummaries(coerced).observations.find((entry) => entry.metric === metric).statistics[0]
      .usable,
    true,
  );
  assert.throws(() => compareRequiredMetricTails(coerced), /current/u);
  const partial = strictInput([metric]);
  delete partial.current.metrics[metric].values['p(99)'];
  const legacy = compareSummaries(partial).observations.find((entry) => entry.metric === metric);
  assert.equal(legacy.statistics.filter(({ usable }) => usable).length, 1);
  assert.deepEqual(compareSummaries(partial).degradations, []);
  assert.throws(() => compareRequiredMetricTails(partial), /p\(99\)/u);
});

test('zero measured tails remain valid with positive floors but zero effective baselines refuse', () => {
  const metric = 'storage_presign_duration_ms';
  const input = strictInput([metric]);
  for (const name of ['current', 'baseline'])
    input[name].metrics[metric].values = { 'p(95)': 0, 'p(99)': 0 };
  const report = compareRequiredMetricTails(input);
  assert.deepEqual(report.degradations, []);
  assert.equal(
    report.observations[0].statistics.every(
      ({ current, baseline, usable }) => current === 0 && baseline > 0 && usable,
    ),
    true,
  );
  for (const statistic of ['p(95)', 'p(99)']) {
    const zero = structuredClone(input);
    zero.reference.metrics[metric][statistic] = 0;
    assert.throws(() => compareRequiredMetricTails(zero), /positive effective baseline/u);
  }
});

test('strict comparison preserves both-tail AND math and the exclusive 10 percent and 1 ms boundaries', () => {
  const metric = 'storage_presign_duration_ms';
  for (const { previous, current, degraded } of [
    { previous: 20, current: 22, degraded: false },
    { previous: 20, current: 22.001, degraded: true },
    { previous: 5, current: 6, degraded: false },
    { previous: 5, current: 6.001, degraded: true },
  ]) {
    const input = strictInput([metric]);
    input.baseline.metrics[metric].values = { 'p(95)': previous, 'p(99)': previous };
    input.reference.metrics[metric] = { 'p(95)': previous, 'p(99)': previous };
    input.current.metrics[metric].values = { 'p(95)': current, 'p(99)': current };
    assert.equal(compareRequiredMetricTails(input).degradations.length, degraded ? 1 : 0);
    for (const statistic of ['p(95)', 'p(99)']) {
      const single = structuredClone(input);
      single.current.metrics[metric].values[statistic] = previous;
      assert.deepEqual(compareRequiredMetricTails(single).degradations, []);
    }
  }
});

test('strict comparison uses the larger actual previous tail or committed reference floor independently', () => {
  const metric = 'storage_presign_duration_ms';
  const input = strictInput([metric]);
  input.baseline.metrics[metric].values = { 'p(95)': 30, 'p(99)': 5 };
  input.reference.metrics[metric] = { 'p(95)': 20, 'p(99)': 40 };
  input.current.metrics[metric].values = { 'p(95)': 35, 'p(99)': 50 };
  const report = compareRequiredMetricTails(input);
  assert.deepEqual(
    report.observations[0].statistics.map(({ baseline }) => baseline),
    [30, 40],
  );
  assert.deepEqual(
    report.degradations.map(({ metric }) => metric),
    [metric],
  );
  assert.equal(report.degradations[0].statistics.length, 2);
});

test('strict comparison cannot inherit permissive environment threshold overrides', () => {
  const metric = 'storage_presign_duration_ms';
  const input = strictInput([metric]);
  input.current.metrics[metric].values = { 'p(95)': 100, 'p(99)': 200 };
  const run = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      'import {compareRequiredMetricTails} from "./test/perf/k6/check-summary.mjs"; const input=JSON.parse(process.argv[1]); console.log(JSON.stringify(compareRequiredMetricTails(input)));',
      JSON.stringify(input),
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        STYNX_K6_BASELINE_MAX_RELATIVE_INCREASE_PERCENT: '999999',
        STYNX_K6_BASELINE_MIN_ABSOLUTE_INCREASE_MS: '999999',
      },
    },
  );
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.deepEqual(
    report.degradations.map(({ metric }) => metric),
    [metric],
  );
  assert.deepEqual(Object.keys(report).sort(), ['degradations', 'observations']);
});

test('a tail-only spike with an unchanged p95 is not a degradation', () => {
  const current = summary({
    ...steady,
    storage_presign_duration_ms: { p95: 8.114, p99: 35.646 },
  });
  const { degradations, observations } = compareSummaries({
    current,
    baseline: summary(steady),
  });
  assert.deepEqual(degradations, []);
  const presign = observations.find((entry) => entry.metric === 'storage_presign_duration_ms');
  assert.equal(presign.statistics.find((s) => s.statistic === 'p(95)').exceeded, false);
  assert.equal(presign.statistics.find((s) => s.statistic === 'p(99)').exceeded, true);
});

test('a shift of the whole distribution is a degradation', () => {
  const current = summary({
    ...steady,
    storage_presign_duration_ms: { p95: 22.846, p99: 117.816 },
  });
  const { degradations } = compareSummaries({ current, baseline: summary(steady) });
  assert.equal(degradations.length, 1);
  assert.equal(degradations[0].metric, 'storage_presign_duration_ms');
  assert.deepEqual(
    degradations[0].statistics.map((s) => s.statistic),
    ['p(95)', 'p(99)'],
  );
});

test('sub-millisecond metrics still need to cross the absolute floor', () => {
  const current = summary({
    ...steady,
    ratelimit_overhead_ms: { p95: 0.9, p99: 1.1 },
  });
  assert.deepEqual(compareSummaries({ current, baseline: summary(steady) }).degradations, []);
  const worse = summary({
    ...steady,
    ratelimit_overhead_ms: { p95: 1.4, p99: 1.6 },
  });
  assert.deepEqual(
    compareSummaries({ current: worse, baseline: summary(steady) }).degradations.map(
      (entry) => entry.metric,
    ),
    ['ratelimit_overhead_ms'],
  );
});

test('an unusually fast previous run does not ratchet the bar below the reference floor', () => {
  const lucky = summary({
    ...steady,
    storage_presign_duration_ms: { p95: 4.875, p99: 8.214 },
  });
  const healthy = summary({
    ...steady,
    storage_presign_duration_ms: { p95: 8.315, p99: 10.896 },
  });
  const withoutReference = compareSummaries({ current: healthy, baseline: lucky });
  assert.deepEqual(
    withoutReference.degradations.map((entry) => entry.metric),
    ['storage_presign_duration_ms'],
  );
  const reference = loadReference(referencePath);
  assert.equal(
    effectiveBaseline(lucky, reference, 'storage_presign_duration_ms', 'p(99)'),
    reference.metrics.storage_presign_duration_ms['p(99)'],
  );
  assert.equal(
    effectiveBaseline(
      summary({ storage_presign_duration_ms: { p95: 9, p99: 12 } }),
      reference,
      'storage_presign_duration_ms',
      'p(99)',
    ),
    12,
  );
  assert.deepEqual(
    compareSummaries({ current: healthy, baseline: lucky, reference }).degradations,
    [],
  );
});

test('metrics missing from either summary are skipped rather than failed', () => {
  const current = summary({ storage_presign_duration_ms: { p95: 8, p99: 10 } });
  const baseline = summary({ auth_verify_duration_ms: { p95: 0.2, p99: 0.3 } });
  const { degradations, observations } = compareSummaries({ current, baseline });
  assert.deepEqual(degradations, []);
  assert.equal(observations.length, trackedMetrics.length);
});

test('the CLI fails closed on a degradation and passes with the reference applied', () => {
  const root = mkdtempSync(join(tmpdir(), 'stynx-k6-check-'));
  try {
    const baselineFile = join(root, 'baseline.summary.json');
    const passingFile = join(root, 'passing.summary.json');
    const failingFile = join(root, 'failing.summary.json');
    writeFileSync(baselineFile, JSON.stringify(summary(steady)));
    writeFileSync(
      passingFile,
      JSON.stringify(
        summary({ ...steady, storage_presign_duration_ms: { p95: 8.114, p99: 35.646 } }),
      ),
    );
    writeFileSync(
      failingFile,
      JSON.stringify(
        summary({ ...steady, storage_presign_duration_ms: { p95: 22.846, p99: 117.816 } }),
      ),
    );
    const run = (file) =>
      spawnSync(process.execPath, [scriptPath, file, baselineFile], {
        cwd: repoRoot,
        encoding: 'utf8',
      });
    const passing = run(passingFile);
    assert.equal(passing.status, 0, passing.stderr);
    assert.match(passing.stdout, /k6 baseline comparison passed \(reference floors applied\)/u);
    const failing = run(failingFile);
    assert.notEqual(failing.status, 0);
    assert.match(failing.stderr, /k6 degradation exceeded thresholds/u);
    assert.match(failing.stderr, /storage_presign_duration_ms/u);
    const thresholdOnly = spawnSync(process.execPath, [scriptPath, passingFile], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(thresholdOnly.status, 0);
    assert.match(thresholdOnly.stdout, /threshold-only validation/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
