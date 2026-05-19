#!/usr/bin/env node
/**
 * stynx perf smoke
 *
 * Measures latency + throughput of a representative fast operation
 * as a local perf signal. Default operation: cold-cache `packages/data`
 * unit-test suite execution time (proxy for "framework code can be
 * compiled + executed at acceptable speed"). 5 samples; reports p50/p95
 * wall-clock and throughput = (1 / median seconds) requests-per-second.
 *
 * Output: emits a single JSON line on stdout as the last line, matching
 * the shape `devai sense-perf-test` parses (Phase 30.H):
 *   { "p50_ms": number, "p95_ms": number, "throughput_rps": number }
 *
 * Override the probed command via STYNX_PERF_PROBE env var. Sample
 * count via STYNX_PERF_SAMPLES (default 5).
 *
 * NOTE: This is a baseline smoke, NOT a comprehensive load test. A
 * production-grade perf gate would run autocannon/hey against the
 * /_probes/* endpoints with a warmed reference-api process; that's
 * deferred to a future F2xT7+ refinement.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { getPerfThreshold } from '../tools/repo-config/test-thresholds.mjs';

const DEFAULT_PROBE = 'pnpm --dir packages/data exec vitest run --silent --config ./vitest.config.ts test/unit/query-helpers.spec.ts';
const PROBE = process.env.STYNX_PERF_PROBE ?? DEFAULT_PROBE;
const SAMPLES = Number(process.env.STYNX_PERF_SAMPLES ?? '5');
const PROBE_ARGS = PROBE.split(/\s+/);
const PACKAGE_NAME = process.env.STYNX_PERF_PACKAGE ?? 'stynx-workspace';

function runOnce() {
  const start = process.hrtime.bigint();
  const result = spawnSync(PROBE_ARGS[0], PROBE_ARGS.slice(1), {
    stdio: 'ignore',
    timeout: 60_000,
  });
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1_000_000;
  return { ok: result.status === 0, ms };
}

export function percentile(sorted, pct) {
  const idx = Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length));
  return sorted[idx];
}

export function evaluatePerf({ p50_ms, p95_ms, throughput_rps }, threshold) {
  const failures = [];
  if (p50_ms > threshold.p50_ms) {
    failures.push(`p50 ${p50_ms}ms > ${threshold.p50_ms}ms`);
  }
  if (p95_ms > threshold.p95_ms) {
    failures.push(`p95 ${p95_ms}ms > ${threshold.p95_ms}ms`);
  }
  if (throughput_rps < threshold.rps_min) {
    failures.push(`rps ${throughput_rps} < ${threshold.rps_min}`);
  }
  return { ok: failures.length === 0, failures };
}

export function summarizeSamples(samples, threshold) {
  const sorted = [...samples].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const median_s = p50 / 1000;
  const throughput_rps = median_s > 0 ? 1 / median_s : 0;
  const observed = {
    p50_ms: Math.round(p50),
    p95_ms: Math.round(p95),
    throughput_rps: Number(throughput_rps.toFixed(2)),
  };
  return {
    ...observed,
    samples: samples.length,
    threshold,
    pass: evaluatePerf(observed, threshold).ok,
  };
}

function main() {
  const threshold = getPerfThreshold(PACKAGE_NAME);
  const samples = [];
  let okCount = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const { ok, ms } = runOnce();
    samples.push(ms);
    if (ok) okCount += 1;
    process.stderr.write(`[perf-smoke] sample ${i + 1}/${SAMPLES}: ${ms.toFixed(0)}ms ${ok ? 'ok' : 'FAIL'}\n`);
  }
  if (okCount < SAMPLES) {
    process.stderr.write(`[perf-smoke] ${SAMPLES - okCount} of ${SAMPLES} probes failed\n`);
  }
  // Final JSON line on stdout — sense-perf-test parses the last { ... } line.
  const summary = summarizeSamples(samples, threshold);
  const evaluation = evaluatePerf(summary, threshold);
  if (!evaluation.ok) {
    process.stderr.write(`[perf-smoke] threshold failed: ${evaluation.failures.join('; ')}\n`);
  }
  process.stdout.write(JSON.stringify(summary) + '\n');
  process.exit(okCount === SAMPLES && evaluation.ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
