import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
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
