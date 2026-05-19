import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluatePerf, percentile, summarizeSamples } from './perf-smoke.mjs';
import { getPerfThreshold } from '../tools/repo-config/test-thresholds.mjs';

test('getPerfThreshold resolves the workspace perf policy', () => {
  assert.deepEqual(getPerfThreshold('stynx-workspace'), {
    p50_ms: 5000,
    p95_ms: 9000,
    rps_min: 0.2,
  });
});

test('perf summary emits observed values plus threshold data', () => {
  const threshold = { p50_ms: 500, p95_ms: 900, rps_min: 2 };
  const summary = summarizeSamples([270, 241, 244, 312, 237], threshold);

  assert.equal(percentile([237, 241, 244, 270, 312], 50), 244);
  assert.deepEqual(summary, {
    p50_ms: 244,
    p95_ms: 312,
    throughput_rps: 4.1,
    samples: 5,
    threshold,
    pass: true,
  });
});

test('perf evaluation is fatal on latency or throughput misses', () => {
  const threshold = { p50_ms: 500, p95_ms: 900, rps_min: 2 };

  assert.deepEqual(evaluatePerf({ p50_ms: 501, p95_ms: 800, throughput_rps: 2.1 }, threshold), {
    ok: false,
    failures: ['p50 501ms > 500ms'],
  });
  assert.deepEqual(evaluatePerf({ p50_ms: 450, p95_ms: 901, throughput_rps: 2.1 }, threshold), {
    ok: false,
    failures: ['p95 901ms > 900ms'],
  });
  assert.deepEqual(evaluatePerf({ p50_ms: 450, p95_ms: 800, throughput_rps: 1.99 }, threshold), {
    ok: false,
    failures: ['rps 1.99 < 2'],
  });
});
