import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  reconcileHttpOriginalBootstrapResults,
  reconcileHttpOriginalResults,
} from '../../scripts/lib/http-original-results.mjs';
import { resultFixture } from './support/http-original-results-fixture.mjs';

// INV-PERF-001: complete source-derived native-format bytes, never executed-origin credit.
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(t, configuration) {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'stynx bootstrap inspector espaço 日本語 ')),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const f = resultFixture(root, configuration);
  const { scenarioId, summaryPath, metricStreamPath, reference } = f.options;
  f.bootstrap = { scenarioId, profileId: 'local', summaryPath, metricStreamPath, reference };
  return f;
}
const run = (f) => reconcileHttpOriginalBootstrapResults(f.root, f.bootstrap);
function nonpromoting(result) {
  assert.equal(result.comparison.verdict, 'NOT_EVALUABLE');
  assert.equal(result.comparison.reason, 'PROSPECTIVE_LOCAL_BOOTSTRAP_HAS_NO_PREDECESSOR');
  for (const key of [
    'fullExecutionComplete',
    'baselineOriginVerified',
    'nativeProcessVerified',
    'readinessPromoting',
  ])
    assert.equal(result[key], false);
  assert.equal(result.profileDeclaration.actualCandidateManifestVerified, false);
  assert.equal(result.accounting.startedIterations, null);
  assert.equal(result.accounting.interruptedIterations, null);
  assert.match(result.accounting.startedInterruptedVerdict, /UNVERIFIED/u);
  assert.match(result.accounting.wholeSchedulerWindowVerdict, /UNVERIFIED/u);
  assert.match(result.accounting.runtimeErrorVerdict, /UNVERIFIED/u);
}
for (const [scenarioId, completed, rate, durationSeconds] of [
  ['auth', 30001, 100, 300],
  ['crud', 6001, 10, 600],
  ['upload', 15001, 50, 300],
  ['cascade-delete', 7501, 25, 300],
]) {
  test(`complete ${scenarioId} local bootstrap preserves its unchanged population and stays UNKNOWN`, async (t) => {
    const f = fixture(t, { scenarioId, completed });
    const raw = readFileSync(f.bootstrap.metricStreamPath);
    const result = await run(f);
    assert.equal(result.kind, 'http-original-local-bootstrap-native-results-component');
    assert.equal(result.verdict, 'UNKNOWN');
    assert.deepEqual(result.failures, []);
    assert.deepEqual(result.declaredProfile, {
      rate,
      durationSeconds,
      preAllocatedVUs: scenarioId === 'auth' ? 20 : scenarioId === 'crud' ? 2 : 10,
      maxVUs: scenarioId === 'auth' ? 200 : scenarioId === 'crud' ? 20 : 100,
    });
    assert.equal(result.accounting.minimumNominalIterations, completed - 1);
    assert.equal(result.accounting.completedIterations, completed);
    assert.equal(result.accounting.completedAboveNominalMinimum, 1);
    assert.equal(result.artifacts.metricStream.sha256, hash(raw));
    assert.equal(result.artifacts.metricStream.recordCount, f.records.length);
    assert.equal(result.artifacts.metricStream.completeGzipAndDescriptorEof, true);
    assert.equal(result.streamReconstructionComplete, true);
    assert.equal(result.nativeSummaryReconciled, true);
    assert.equal(result.accounting.droppedIterations, null);
    assert.equal(result.accounting.droppedObservation, 'UNVERIFIED_NO_NATIVE_SAMPLE');
    assert.deepEqual(
      result.comparison.referenceFloors,
      Object.entries(f.bootstrap.reference.metrics).map(([metric, values]) => ({ metric, values })),
    );
    assert.deepEqual(readFileSync(f.bootstrap.metricStreamPath), raw);
    nonpromoting(result);
  });
}
test('zero reference floors are reported data and never become a fabricated predecessor or regression gate', async (t) => {
  const f = fixture(t, { completed: 30001, component: 0.5 });
  f.bootstrap.reference.metrics.auth_verify_duration_ms = { 'p(95)': 0, 'p(99)': 0 };
  const result = await run(f);
  assert.equal(result.verdict, 'UNKNOWN');
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.comparison.referenceFloors, [
    { metric: 'auth_verify_duration_ms', values: { 'p(95)': 0, 'p(99)': 0 } },
  ]);
  f.bootstrap.reference.metrics.auth_verify_duration_ms['p(95)'] = 123;
  assert.equal(result.comparison.referenceFloors[0].values['p(95)'], 0);
  nonpromoting(result);
});
for (const [component, verdict] of [
  [9.999, 'UNKNOWN'],
  [10, 'FAIL'],
]) {
  test(`bootstrap retains strict absolute component boundary ${component}`, async (t) => {
    const result = await run(fixture(t, { completed: 30001, component }));
    assert.equal(result.verdict, verdict);
    assert.equal(result.hardGates[0].maximum, 10);
    if (verdict === 'FAIL') assert.ok(result.failures.includes('native-threshold-failure'));
    else assert.deepEqual(result.failures, []);
    nonpromoting(result);
  });
}
test('local bootstrap retains population, native drops and short-window failures without predecessor comparison', async (t) => {
  const result = await run(fixture(t, { completed: 700, dropped: 3, durationMs: 200000 }));
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.accounting.minimumNominalIterations, 30000);
  assert.equal(result.accounting.completedIterations, 700);
  assert.equal(result.accounting.droppedIterations, 3);
  assert.equal(result.accounting.droppedObservation, 'NATIVE_COUNTER');
  for (const reason of [
    'completed-iterations-below-original-profile-minimum',
    'native-dropped-iterations',
    'reported-run-duration-below-original-window',
  ])
    assert.ok(result.failures.includes(reason));
  assert.equal(result.failures.includes('required-component-tail-regression'), false);
  nonpromoting(result);
});
for (const [label, change] of [
  ['baseline', (options) => ({ ...options, baseline: {} })],
  ['seed designation', (options) => ({ ...options, seedDesignation: true })],
  ['profile override', (options) => ({ ...options, profile: { rate: 1 } })],
  ['hardening', (options) => ({ ...options, profileId: 'hardening' })],
  ['other scenario', (options) => ({ ...options, scenarioId: 'other' })],
  ['missing reference', ({ reference: _reference, ...options }) => options],
  [
    'proxy',
    (options) =>
      new Proxy(options, {
        ownKeys() {
          throw Error('must not run');
        },
      }),
  ],
]) {
  test(`bootstrap refuses ${label} through its closed public boundary`, async (t) => {
    const f = fixture(t);
    const before = readFileSync(f.bootstrap.metricStreamPath);
    await assert.rejects(reconcileHttpOriginalBootstrapResults(f.root, change(f.bootstrap)));
    assert.deepEqual(readFileSync(f.bootstrap.metricStreamPath), before);
  });
}
test('bootstrap options accessors, extra arity and comparison without baseline cannot acquire standing', async (t) => {
  const f = fixture(t);
  let accesses = 0;
  const hostile = { ...f.bootstrap };
  Object.defineProperty(hostile, 'baseline', {
    enumerable: true,
    get() {
      accesses++;
      throw Error('must not run');
    },
  });
  await assert.rejects(reconcileHttpOriginalBootstrapResults(f.root, hostile));
  assert.equal(accesses, 0);
  await assert.rejects(
    reconcileHttpOriginalBootstrapResults(f.root, f.bootstrap, {}),
    /closed arguments/u,
  );
  await assert.rejects(reconcileHttpOriginalBootstrapResults(f.bootstrap));
  await assert.rejects(reconcileHttpOriginalResults(f.root, f.bootstrap), /closed own-data/u);
});
for (const [label, reference] of [
  ['missing metric', { metrics: {} }],
  ['missing tail', { metrics: { auth_verify_duration_ms: { 'p(95)': 1 } } }],
  ['negative tail', { metrics: { auth_verify_duration_ms: { 'p(95)': -1, 'p(99)': 1 } } }],
  ['NaN tail', { metrics: { auth_verify_duration_ms: { 'p(95)': NaN, 'p(99)': 1 } } }],
  ['infinite tail', { metrics: { auth_verify_duration_ms: { 'p(95)': 1, 'p(99)': Infinity } } }],
  ['string tail', { metrics: { auth_verify_duration_ms: { 'p(95)': '1', 'p(99)': 1 } } }],
  [
    'inherited metric',
    { metrics: Object.create({ auth_verify_duration_ms: { 'p(95)': 1, 'p(99)': 1 } }) },
  ],
]) {
  test(`bootstrap refuses ${label} reference data`, async (t) => {
    const f = fixture(t);
    f.bootstrap.reference = reference;
    await assert.rejects(run(f));
  });
}
test('bootstrap reference getters and proxies never execute as measurement authority', async (t) => {
  const f = fixture(t);
  let accesses = 0;
  for (const reference of [
    {
      get metrics() {
        accesses++;
        throw Error('must not run');
      },
    },
    new Proxy(
      {},
      {
        getPrototypeOf() {
          accesses++;
          throw Error('must not run');
        },
      },
    ),
  ]) {
    f.bootstrap.reference = reference;
    await assert.rejects(run(f));
  }
  assert.equal(accesses, 0);
});
for (const [label, change] of [
  [
    'gzip trailer truncation',
    (f) => {
      const bytes = readFileSync(f.bootstrap.metricStreamPath);
      writeFileSync(f.bootstrap.metricStreamPath, bytes.subarray(0, -1));
    },
  ],
  [
    'summary/stream disagreement',
    (f) => {
      f.summary.metrics.iterations.values.count++;
      f.save();
    },
  ],
  ['public metric body', (f) => chmodSync(f.bootstrap.metricStreamPath, 0o644)],
  [
    'hardlinked metric body',
    (f) => linkSync(f.bootstrap.metricStreamPath, join(f.root, 'alias.gz')),
  ],
]) {
  test(`bootstrap retains actual byte acquisition refusal for ${label}`, async (t) => {
    const f = fixture(t);
    change(f);
    const before = readFileSync(f.bootstrap.metricStreamPath);
    await assert.rejects(run(f));
    assert.deepEqual(readFileSync(f.bootstrap.metricStreamPath), before);
  });
}
