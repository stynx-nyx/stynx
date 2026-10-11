import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { reconcileHttpOriginalResults } from '../../scripts/lib/http-original-results.mjs';
import { resultFixture } from './support/http-original-results-fixture.mjs';

// INV-PERF-001: these real files contain explicitly source-derived native-format
// fixture data. No executed native origin, scheduler window or runtime is claimed.
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function root(t) {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'stynx original gzip espaço 日本語 ')));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}
function fixture(t, options) {
  return resultFixture(root(t), options);
}
const reconcile = (f) => reconcileHttpOriginalResults(f.root, f.options);

for (const scenarioId of ['auth', 'crud', 'upload', 'cascade-delete'])
  test(`complete ${scenarioId} source-grounded summary/full gzip reconciles actual bytes without native execution credit`, async (t) => {
    const f = fixture(t, { scenarioId });
    const compressed = readFileSync(f.options.metricStreamPath);
    const before = lstatSync(f.options.metricStreamPath, { bigint: true });
    const result = await reconcile(f);
    assert.equal(result.verdict, 'UNVERIFIED');
    assert.deepEqual(result.failures, []);
    assert.equal(result.streamReconstructionComplete, true);
    assert.equal(result.nativeSummaryReconciled, true);
    for (const key of [
      'fullExecutionComplete',
      'baselineOriginVerified',
      'nativeProcessVerified',
      'readinessPromoting',
    ])
      assert.equal(result[key], false);
    assert.equal(result.artifacts.metricStream.sha256, hash(compressed));
    assert.equal(result.artifacts.metricStream.recordCount, f.records.length);
    assert.equal(result.artifacts.metricStream.completeGzipAndDescriptorEof, true);
    assert.equal(result.artifacts.metricStream.originVerified, false);
    assert.equal(result.accounting.completedIterations, f.count);
    assert.ok(f.count > 600);
    assert.equal(result.accounting.completedAboveNominalMinimum, 1);
    assert.equal(result.accounting.startedIterations, null);
    assert.equal(result.accounting.interruptedIterations, null);
    assert.equal(result.accounting.droppedIterations, null);
    assert.equal(result.accounting.droppedObservation, 'UNVERIFIED_NO_NATIVE_SAMPLE');
    assert.match(result.accounting.wholeSchedulerWindowVerdict, /UNVERIFIED/u);
    assert.equal(result.profileDeclaration.actualCandidateManifestVerified, false);
    assert.deepEqual(result.native.metrics.generic_gauge.values, { value: -2, min: -4, max: 0 });
    assert.equal(result.native.metrics.generic_rate.values.rate, 2 / 3);
    // Native binary64 interpolation of this four-point witness is one ULP below the decimal7.4.
    assert.equal(result.native.metrics.generic_trend.values['p(95)'], 7.399999999999999);
    const after = lstatSync(f.options.metricStreamPath, { bigint: true });
    for (const key of ['dev', 'ino', 'mode', 'size', 'mtimeNs', 'ctimeNs', 'nlink'])
      assert.equal(after[key], before[key], key);
    assert.deepEqual(readFileSync(f.options.metricStreamPath), compressed);
  });
test('all1001 trend points beyond the supplemental600 remain in the original tail and accounting', async (t) => {
  const f = fixture(t, { tail: true });
  const result = await reconcile(f);
  const metric = result.native.metrics.auth_verify_duration_ms;
  assert.equal(metric.sampleCount, 1001);
  assert.equal(metric.values.avg, 4209 / 1001);
  assert.equal(metric.values['p(99)'], 9);
  assert.equal(result.accounting.completedIterations, 3001);
  assert.equal(result.verdict, 'UNVERIFIED');
});
for (const [label, change, pattern] of [
  [
    'missing exact statistic',
    (f) => {
      delete f.summary.metrics.generic_trend.values['p(99)'];
    },
    /closed own-data/u,
  ],
  [
    'extra statistic',
    (f) => {
      f.summary.metrics.generic_trend.values['p(50)'] = 3;
    },
    /closed own-data/u,
  ],
  [
    'counter missing rate',
    (f) => {
      delete f.summary.metrics.iterations.values.rate;
    },
    /closed own-data/u,
  ],
  [
    'summary value mismatch',
    (f) => {
      f.summary.metrics.generic_trend.values.avg = 8;
    },
    /disagreement/u,
  ],
  [
    'statistic roster order',
    (f) => {
      f.summary.options.summaryTrendStats.reverse();
    },
    /native summary shape/u,
  ],
  [
    'statistic roster omission',
    (f) => {
      f.summary.options.summaryTrendStats.pop();
    },
    /native summary shape/u,
  ],
  [
    'native summary-only metric',
    (f) => {
      f.summary.metrics.unseen = f.summary.metrics.generic_trend;
    },
    /unreconstructed/u,
  ],
  [
    'missing native stream metric',
    (f) => {
      delete f.summary.metrics.generic_trend;
    },
    /missing\/mismatched/u,
  ],
  [
    'duplicate metric declaration',
    (f) => {
      f.records.splice(1, 0, f.records[0]);
    },
    /native metric declaration/u,
  ],
  [
    'point before declaration',
    (f) => {
      [f.records[0], f.records[1]] = [f.records[1], f.records[0]];
    },
    /point before/u,
  ],
  [
    'nonbinary checks',
    (f) => {
      f.records.find((r) => r.type === 'Point' && r.metric === 'checks').data.value = 2;
    },
    /native value domain/u,
  ],
  [
    'check outcome mismatch',
    (f) => {
      f.summary.root_group.checks[0].passes = 2;
    },
    /check outcome mismatch/u,
  ],
  [
    'missing check summary',
    (f) => {
      f.summary.root_group.checks = [];
    },
    /incomplete native checks/u,
  ],
  [
    'negative required metric',
    (f) => {
      f.records.find(
        (r) => r.type === 'Point' && r.metric === 'auth_verify_duration_ms',
      ).data.value = -1;
    },
    /native value domain/u,
  ],
  [
    'native threshold declaration mismatch',
    (f) => {
      delete f.summary.metrics.auth_verify_duration_ms.thresholds['p(99)<10'];
    },
    /threshold declarations/u,
  ],
  [
    'native threshold outcome disagreement',
    (f) => {
      f.summary.metrics.auth_verify_duration_ms.thresholds['p(99)<10'].ok = false;
    },
    /outcome disagreement/u,
  ],
])
  test(`reconciliation refuses ${label} without changing the files`, async (t) => {
    const f = fixture(t);
    change(f);
    f.save();
    const bytes = readFileSync(f.options.metricStreamPath);
    await assert.rejects(reconcile(f), pattern);
    assert.deepEqual(readFileSync(f.options.metricStreamPath), bytes);
  });
for (const [component, expected] of [
  [9.999, 'UNVERIFIED'],
  [10, 'FAIL'],
])
  test(`unchanged strict component p99 boundary ${component} remains ${expected}`, async (t) => {
    const f = fixture(t, { component });
    const result = await reconcile(f);
    assert.equal(result.verdict, expected);
    assert.equal(result.hardGates[0].maximum, 10);
    if (expected === 'FAIL') assert.ok(result.failures.includes('native-threshold-failure'));
  });
test('native dropped samples, short windows and insufficient iterations remain failures with exact counters', async (t) => {
  const f = fixture(t, { completed: 700, dropped: 3, durationMs: 200000 });
  const result = await reconcile(f);
  assert.equal(result.accounting.completedIterations, 700);
  assert.equal(result.accounting.droppedIterations, 3);
  assert.equal(result.accounting.droppedObservation, 'NATIVE_COUNTER');
  for (const reason of [
    'completed-iterations-below-original-profile-minimum',
    'native-dropped-iterations',
    'reported-run-duration-below-original-window',
  ])
    assert.ok(result.failures.includes(reason));
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.readinessPromoting, false);
});
for (const [value, expected] of [
  [22, 'UNVERIFIED'],
  [22.0001, 'FAIL'],
])
  test(`strict relative10percent comparison boundary at${value} preserves unchanged dual-tail rule`, async (t) => {
    const f = fixture(t, { scenarioId: 'upload', component: value });
    const result = await reconcile(f);
    assert.equal(result.verdict, expected);
    assert.equal(result.comparison.degradations.length, expected === 'FAIL' ? 1 : 0);
  });
test('missing/zero/non-own baseline tails refuse rather than becoming a passing comparison', async (t) => {
  const f = fixture(t);
  for (const bad of [
    { metrics: {} },
    { metrics: { auth_verify_duration_ms: { values: { 'p(95)': 0, 'p(99)': 0 } } } },
  ]) {
    f.options.baseline = bad;
    f.options.reference = { metrics: { auth_verify_duration_ms: { 'p(95)': 0, 'p(99)': 0 } } };
    await assert.rejects(reconcile(f), /Strict k6 comparison/u);
  }
  let calls = 0;
  f.options.baseline = {
    get metrics() {
      calls++;
      throw new Error('caller getter');
    },
  };
  await assert.rejects(reconcile(f), /Strict k6 comparison/u);
  assert.equal(calls, 0);
});
test('fixed profile is independent of caller-checkout law and accepts no tuple/limit overrides', async (t) => {
  const f = fixture(t, { completed: 700 });
  mkdirSync(join(f.root, 'law/policy'), { recursive: true });
  writeFileSync(
    join(f.root, 'law/policy/http-qualification-manifest.json'),
    JSON.stringify({ existingProfiles: { auth: { hardening: { rate: 1, durationSeconds: 1 } } } }),
  );
  const result = await reconcile(f);
  assert.equal(result.declaredProfile.rate, 10);
  assert.equal(result.accounting.minimumNominalIterations, 3000);
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.profileDeclaration.actualCandidateManifestVerified, false);
  await assert.rejects(
    reconcileHttpOriginalResults(f.root, {
      ...f.options,
      profile: { rate: 1, durationSeconds: 1 },
    }),
    /closed own-data/u,
  );
  await assert.rejects(
    reconcileHttpOriginalResults(f.root, { ...f.options, scenarioId: 'other' }),
    /fixed scenario/u,
  );
  await assert.rejects(reconcileHttpOriginalResults(f.root, f.options, {}), /closed arguments/u);
});

for (const [label, change, pattern] of [
  [
    'omitted iteration point',
    (f) => {
      f.records.splice(
        f.records.findIndex((r) => r.type === 'Point' && r.metric === 'iterations'),
        1,
      );
    },
    /disagreement/u,
  ],
  [
    'fractional native iteration',
    (f) => {
      f.records.find((r) => r.type === 'Point' && r.metric === 'iterations').data.value = 0.5;
    },
    /nonnegative integer/u,
  ],
  [
    'unknown envelope field',
    (f) => {
      f.records[0].authority = true;
    },
    /closed own-data/u,
  ],
  [
    'unknown point field',
    (f) => {
      f.records[1].data.started = true;
    },
    /closed own-data/u,
  ],
  [
    'missing check group tag',
    (f) => {
      delete f.records.find((r) => r.type === 'Point' && r.metric === 'checks').data.tags.group;
    },
    /check\/group/u,
  ],
  [
    'invalid native timestamp',
    (f) => {
      f.records[1].data.time = 'not-a-time';
    },
    /sample timestamp/u,
  ],
  [
    'native metadata nonstring',
    (f) => {
      f.records[1].data.metadata = { operation: 42 };
    },
    /tag\/metadata/u,
  ],
  [
    'duplicate check identity',
    (f) => {
      f.summary.root_group.checks.push(f.summary.root_group.checks[0]);
    },
    /duplicate\/too many/u,
  ],
  [
    'metric population above512',
    (f) => {
      for (let i = 0; i < 513; i++)
        f.records.push({
          type: 'Metric',
          metric: `extra${i}`,
          data: {
            name: `extra${i}`,
            type: 'counter',
            contains: 'default',
            thresholds: [],
            submetrics: null,
          },
        });
    },
    /native metric declaration/u,
  ],
  [
    'submetric population above128',
    (f) => {
      f.records.find((r) => r.metric === 'generic_counter' && r.type === 'Metric').data.submetrics =
        Array.from({ length: 129 }, (_, i) => ({
          name: `generic_counter{slot:${i}}`,
          suffix: `slot:${i}`,
          tags: { slot: String(i) },
        }));
    },
    /native submetric declaration/u,
  ],
])
  test(`actual full-stream reconciliation refuses ${label}`, async (t) => {
    const f = fixture(t);
    change(f);
    f.save();
    const compressed = readFileSync(f.options.metricStreamPath);
    await assert.rejects(reconcile(f), pattern);
    assert.deepEqual(readFileSync(f.options.metricStreamPath), compressed);
  });

test('native submetrics reconstruct only tag-matching samples and omit an actually empty subpopulation', async (t) => {
  const f = fixture(t);
  const declaration = f.records.find((r) => r.type === 'Metric' && r.metric === 'generic_counter');
  declaration.data.submetrics = [
    { name: 'generic_counter{slot:a}', suffix: 'slot:a', tags: { slot: 'a' } },
    { name: 'generic_counter{slot:empty}', suffix: 'slot:empty', tags: { slot: 'empty' } },
  ];
  const points = f.records.filter((r) => r.type === 'Point' && r.metric === 'generic_counter');
  points[0].data.tags.slot = 'a';
  points[1].data.tags.slot = 'b';
  f.summary.metrics['generic_counter{slot:a}'] = {
    type: 'counter',
    contains: 'data',
    values: { count: 2, rate: 2000 / 300000 },
  };
  f.save();
  const result = await reconcile(f);
  assert.equal(result.native.metrics['generic_counter{slot:a}'].sampleCount, 1);
  assert.equal(result.native.metrics['generic_counter{slot:a}'].values.count, 2);
  assert.equal(Object.hasOwn(result.native.metrics, 'generic_counter{slot:empty}'), false);
  assert.equal(result.verdict, 'UNVERIFIED');
  f.summary.metrics['generic_counter{slot:a}'].values.count = 7;
  f.save();
  await assert.rejects(reconcile(f), /disagreement/u);
});

for (const [label, bytes] of [
  [
    'duplicate NDJSON field',
    Buffer.from('{"type":"Metric","type":"Point","metric":"iterations","data":{}}\n'),
  ],
  ['invalid UTF8 NDJSON', Buffer.from([0xff, 0x0a])],
  ['malformed NDJSON', Buffer.from('{not-json}\n')],
])
  test(`actual gzip containing ${label} never yields a reconstructed observation`, async (t) => {
    const f = fixture(t);
    const raw = gzipSync(bytes);
    writeFileSync(f.options.metricStreamPath, raw);
    await assert.rejects(reconcile(f));
    assert.deepEqual(readFileSync(f.options.metricStreamPath), raw);
  });

test('summary duplicate keys refuse before any reconstruction credit', async (t) => {
  const f = fixture(t);
  writeFileSync(f.options.summaryPath, '{"metrics":{},"metrics":{}}');
  await assert.rejects(reconcile(f), /ambiguous or invalid JSON/u);
});

test('check failures and zero native drops retain their actual independent observations', async (t) => {
  const f = fixture(t, { dropped: 0 });
  f.records.find((r) => r.type === 'Point' && r.metric === 'checks').data.value = 0;
  f.summary.metrics.checks.values = { rate: 0, passes: 0, fails: 1 };
  f.summary.root_group.checks[0].passes = 0;
  f.summary.root_group.checks[0].fails = 1;
  f.save();
  const result = await reconcile(f);
  assert.equal(result.accounting.droppedIterations, 0);
  assert.equal(result.accounting.droppedObservation, 'NATIVE_COUNTER');
  assert.deepEqual(result.failures, ['native-check-failure']);
  assert.equal(result.verdict, 'FAIL');
});

for (const [durationMs, refused] of [
  [600000, false],
  [600001, true],
  [0, true],
])
  test(`actual reported duration${durationMs} retains exact fixed-profile bound`, async (t) => {
    const f = fixture(t, { durationMs: durationMs || 300000 });
    if (durationMs === 0) {
      f.summary.state.testRunDurationMs = 0;
      f.save();
    }
    if (refused) await assert.rejects(reconcile(f), /reported duration/u);
    else {
      const result = await reconcile(f);
      assert.equal(result.native.reportedTestRunDurationMs, 600000);
      assert.equal(result.verdict, 'UNVERIFIED');
    }
  });

test('closed own-data options reject proxies and accessors without evaluating caller authority', async (t) => {
  const f = fixture(t);
  let calls = 0;
  const accessor = { ...f.options };
  Object.defineProperty(accessor, 'summaryPath', {
    enumerable: true,
    get() {
      calls++;
      throw new Error('not evidence');
    },
  });
  await assert.rejects(reconcileHttpOriginalResults(f.root, accessor), /closed own-data/u);
  await assert.rejects(
    reconcileHttpOriginalResults(
      f.root,
      new Proxy(f.options, {
        ownKeys() {
          calls++;
          throw new Error('not evidence');
        },
      }),
    ),
    /closed own-data/u,
  );
  assert.equal(calls, 0);
});

for (const mode of [0o400, 0o644, 0o660])
  test(`actual summary mode${mode.toString(8)} grants no byte custody`, async (t) => {
    const f = fixture(t);
    chmodSync(f.options.summaryPath, mode);
    await assert.rejects(reconcile(f));
    assert.equal(lstatSync(f.options.summaryPath).mode & 0o777, mode);
  });

for (const [value, expected] of [
  [1.5, 'UNVERIFIED'],
  [1.5001, 'FAIL'],
])
  test(`strict absolute1ms dual-tail boundary${value} preserves the unchanged comparison`, async (t) => {
    const f = fixture(t, { scenarioId: 'upload', component: value });
    f.options.baseline.metrics.storage_presign_duration_ms.values = { 'p(95)': 0.5, 'p(99)': 0.5 };
    f.options.reference.metrics.storage_presign_duration_ms = { 'p(95)': 0.5, 'p(99)': 0.5 };
    const result = await reconcile(f);
    assert.equal(result.verdict, expected);
    assert.equal(result.comparison.degradations.length, expected === 'FAIL' ? 1 : 0);
  });
for (const [value, expected] of [
  [499.999, 'UNVERIFIED'],
  [500, 'FAIL'],
])
  test(`strict native HTTP p95 boundary${value} preserves the unchanged500ms gate`, async (t) => {
    const f = fixture(t);
    for (const point of f.records.filter(
      (r) => r.type === 'Point' && r.metric === 'http_req_duration',
    ))
      point.data.value = value;
    for (const statistic of Object.keys(f.summary.metrics.http_req_duration.values))
      f.summary.metrics.http_req_duration.values[statistic] = value;
    f.summary.metrics.http_req_duration.thresholds['p(95)<500'].ok = value < 500;
    f.save();
    const result = await reconcile(f);
    assert.equal(result.verdict, expected);
    assert.equal(result.hardGates.find((row) => row.metric === 'http_req_duration').maximum, 500);
  });
