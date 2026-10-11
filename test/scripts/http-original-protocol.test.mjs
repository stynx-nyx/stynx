import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  httpOriginalScenarioProfile,
  parseHttpOriginalScenarioSelector,
} from '../../scripts/lib/http-original-scenarios.mjs';
import {
  createHttpOriginalProtocol,
  emitHttpOriginalPhase,
  openHttpOriginalChannel,
} from '../../scripts/lib/http-original-protocol.mjs';
import { context, exit, h, sha, transcript } from './support/http-original-fixture.mjs';

// INV-PERF-001: original workload declarations and received wire data are never
// actual worker/native custody, application observations or release admission.
const invalid = { code: 'HTTP_ORIGINAL_PROTOCOL_INVALID' };
const selectorInvalid = { code: 'HTTP_ORIGINAL_SCENARIO_INVALID' };
const manifest = JSON.parse(
  readFileSync(new URL('../../law/policy/http-qualification-manifest.json', import.meta.url)),
);
const selectors = ['auth', 'crud', 'upload', 'cascade-delete'].flatMap((scenarioId) =>
  ['local', 'hardening'].map((profileId) => ({ scenarioId, profileId })),
);
function fixture(selector = selectors[0], outcome = 'COMPLETED') {
  const expected = context(selector.scenarioId, selector.profileId);
  const nominal = manifest.existingProfiles[selector.scenarioId][selector.profileId];
  return {
    expected,
    nominal,
    frames: transcript(expected, nominal, outcome),
    protocol: createHttpOriginalProtocol(expected),
  };
}
function refusesMutation(mutator, selector = selectors[0]) {
  const f = fixture(selector);
  mutator(f.frames, f);
  let refused = false;
  for (const frame of f.frames)
    if (!f.protocol.receive(frame)) {
      refused = true;
      break;
    }
  assert.equal(refused, true);
  assert.throws(() => f.protocol.finish(exit(f.expected)), invalid);
  const capture = f.protocol.captured();
  assert.equal(capture.refused, true);
  assert.equal(capture.runtimeCustodyComplete, false);
  assert.equal(capture.performanceQualified, false);
  assert.equal(capture.readinessPromoting, false);
  assert.deepEqual(capture.frames.at(-1), f.frames[capture.frames.length - 1]);
}
for (const selector of selectors) {
  test(`unchanged ${selector.scenarioId}/${selector.profileId} profile matches manifest and full received wire remains nonpromoting`, () => {
    const profile = httpOriginalScenarioProfile(selector);
    const nominal = manifest.existingProfiles[selector.scenarioId][selector.profileId];
    assert.deepEqual(profile.nominalProfile, nominal);
    assert.equal(profile.workerDeadlineSeconds, nominal.durationSeconds + 300);
    assert.equal(profile.fixtureInclusiveDeadlineSeconds, nominal.durationSeconds + 420);
    assert.equal(profile.officialGeneratorRequired, true);
    assert.equal(profile.derivativeSelectionAllowed, false);
    assert.equal(profile.runtimeAdmission, false);
    const f = fixture(selector);
    for (const frame of f.frames) assert.equal(f.protocol.receive(frame), true, frame.phase);
    const result = f.protocol.finish(exit(f.expected));
    assert.equal(result.componentWireComplete, true);
    assert.equal(result.frameCount, 11);
    for (const key of [
      'complete',
      'runtimeCustodyComplete',
      'performanceQualified',
      'readinessPromoting',
    ])
      assert.equal(result[key], false);
    assert.equal(
      result.measurement.completedIterations,
      nominal.rate * nominal.durationSeconds + 1,
    );
    assert.equal(result.measurement.droppedIterations, 17);
    assert.equal(result.measurement.interruptedIterations, 3);
    assert.equal(
      result.actualParentCleanupAndRawCustody,
      'PENDING_INDEPENDENT_ACTUAL_PARENT_BINDING',
    );
    assert.throws(() => f.protocol.finish(exit(f.expected)), invalid);
    if (selector.profileId === 'local') {
      const source = readFileSync(
        new URL(`../../test/perf/k6/${selector.scenarioId}.js`, import.meta.url),
        'utf8',
      );
      assert.equal(
        Number(source.match(/rate: Number\(__ENV.STYNX_K6_RATE \|\| (\d+)\)/u)[1]),
        nominal.rate,
      );
      assert.equal(
        Number(source.match(/duration: __ENV.STYNX_K6_DURATION \|\| '(\d+)m'/u)[1]) * 60,
        nominal.durationSeconds,
      );
      assert.equal(
        Number(
          source.match(/preAllocatedVUs: Number\(__ENV.STYNX_K6_PREALLOCATED_VUS \|\| (\d+)\)/u)[1],
        ),
        nominal.preAllocatedVUs,
      );
      assert.equal(
        Number(source.match(/maxVUs: Number\(__ENV.STYNX_K6_MAX_VUS \|\| (\d+)\)/u)[1]),
        nominal.maxVUs,
      );
    } else {
      const workflow = readFileSync(
        new URL('../../.github/workflows/hardening.yml', import.meta.url),
        'utf8',
      );
      const variable = `STYNX_K6_${selector.scenarioId.toUpperCase().replaceAll('-', '_')}_RATE`;
      const line = workflow
        .split('\n')
        .find((value) => value.trimStart().startsWith(`${variable}:`));
      assert.equal(Number(line.match(/'([0-9]+)'/u)[1]), nominal.rate);
      assert.match(workflow, /STYNX_K6_PREALLOCATED_VUS: '4'/u);
      assert.match(workflow, /STYNX_K6_MAX_VUS: '25'/u);
      assert.equal(nominal.preAllocatedVUs, 4);
      assert.equal(nominal.maxVUs, 25);
    }
    profile.nominalProfile.rate = 0;
    profile.requiredMetrics.length = 0;
    assert.deepEqual(httpOriginalScenarioProfile(selector).nominalProfile, nominal);
    assert.ok(httpOriginalScenarioProfile(selector).requiredMetrics.length > 0);
    const actualScript = readFileSync(
      new URL(`../../test/perf/k6/${selector.scenarioId}.js`, import.meta.url),
      'utf8',
    );
    const actualThresholdMetrics = [...actualScript.matchAll(/^\s+([a-z_]+_ms):/gmu)]
      .map((match) => match[1])
      .sort();
    assert.deepEqual(
      httpOriginalScenarioProfile(selector).requiredMetrics.sort(),
      actualThresholdMetrics,
    );
  });
}
test('selector is closed, rejects caller code without getters, and accepts no rate/environment overrides', () => {
  let calls = 0;
  const accessor = {
    scenarioId: 'auth',
    get profileId() {
      calls++;
      return 'local';
    },
  };
  const proxy = new Proxy(
    {},
    {
      ownKeys() {
        calls++;
        return [];
      },
    },
  );
  for (const input of [
    null,
    [],
    {},
    accessor,
    proxy,
    { scenarioId: 'other', profileId: 'local' },
    { scenarioId: 'auth', profileId: 'LOCAL' },
    { scenarioId: 'auth', profileId: 'local', rate: 1 },
    { scenarioId: 'auth', profileId: 'local', environment: {} },
  ])
    assert.throws(() => parseHttpOriginalScenarioSelector(input), selectorInvalid);
  assert.equal(calls, 0);
  assert.throws(() => httpOriginalScenarioProfile(selectors[0], {}), selectorInvalid);
  assert.throws(() => parseHttpOriginalScenarioSelector(selectors[0], {}), selectorInvalid);
});
test('failed native execution retains null summary/counters and raw hash without being transformed into success', () => {
  const f = fixture(selectors[0], 'FAILED');
  for (const frame of f.frames) assert.equal(f.protocol.receive(frame), true);
  const result = f.protocol.finish(exit(f.expected));
  assert.equal(result.measurement.outcome, 'FAILED');
  for (const key of [
    'nativeSummarySha256',
    'nativeMetricsSha256',
    'completedIterations',
    'droppedIterations',
    'interruptedIterations',
  ])
    assert.equal(result.measurement[key], null);
  assert.equal(result.measurement.rawArtifactsSha256, h);
  assert.equal(result.complete, false);
  assert.equal(result.performanceQualified, false);
});
for (const key of [
  'nativeSummarySha256',
  'nativeMetricsSha256',
  'completedIterations',
  'droppedIterations',
  'interruptedIterations',
])
  test(`COMPLETED native field ${key} cannot be null`, () =>
    refusesMutation((frames) => {
      frames[7].body[key] = null;
    }));
for (const [label, change] of [
  [
    'supplemental mode',
    (frames) => {
      frames[0].mode = 'http-endpoint-qualification';
    },
  ],
  [
    'cross profile',
    (frames) => {
      frames[0].profileId = 'hardening';
    },
  ],
  [
    'cross candidate',
    (frames) => {
      frames[0].candidateCommit = 'c'.repeat(40);
    },
  ],
  [
    'cross worker',
    (frames) => {
      frames[0].workerPid++;
    },
  ],
  [
    'extra frame field',
    (frames) => {
      frames[0].accepted = true;
    },
  ],
  [
    'wrong phase order',
    (frames) => {
      [frames[1], frames[2]] = [frames[2], frames[1]];
    },
  ],
  [
    'backwards time',
    (frames) => {
      frames[2].elapsedNs = '0';
    },
  ],
  [
    'nonzero start',
    (frames) => {
      frames[0].elapsedNs = '1';
    },
  ],
  [
    'rate override',
    (frames) => {
      frames[6].body.ratePerSecond = 2;
    },
  ],
  [
    'VU override',
    (frames) => {
      frames[6].body.maxVUs++;
    },
  ],
  [
    'generator identity reused',
    (frames) => {
      frames[6].body.generatorOperationId = frames[0].operationId;
    },
  ],
  [
    'generator mismatch',
    (frames) => {
      frames[7].body.generatorOperationId = frames[0].operationId;
    },
  ],
  [
    'missing raw body hash',
    (frames) => {
      frames[7].body.rawArtifactsSha256 = null;
    },
  ],
  [
    'negative native count',
    (frames) => {
      frames[7].body.droppedIterations = -1;
    },
  ],
  [
    'native count unsafe integer',
    (frames) => {
      frames[7].body.completedIterations = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    'PASS outcome',
    (frames) => {
      frames[7].body.outcome = 'PASS';
    },
  ],
  [
    'promoting terminal',
    (frames) => {
      frames[10].body.performanceQualified = true;
    },
  ],
  [
    'false transcript digest',
    (frames) => {
      frames[10].body.phaseSha256 = '0'.repeat(64);
    },
  ],
])
  test(`closed original wire refuses ${label} and retains its rejected frame`, () =>
    refusesMutation(change));
for (const [label, index, time] of [
  ['startup over30s', 1, 30_000_000_001n],
  ['preparation over180s', 4, 183_000_000_001n],
  ['completed duration too short', 7, 305_999_999_999n],
  ['measurement grace over60s', 7, 366_000_000_001n],
  ['close over30s', 8, 336_000_000_001n],
  ['final over30s', 9, 366_000_000_001n],
  ['global worker deadline', 7, 600_000_000_001n],
])
  test(`duration-aware original wire refuses ${label}`, () =>
    refusesMutation((frames) => {
      frames[index].elapsedNs = String(time);
    }));
test('invalid exit, incomplete wire, oversized capture and refused continuation never finish', () => {
  const f = fixture();
  assert.throws(() => f.protocol.finish(exit(f.expected)), invalid);
  const complete = fixture();
  for (const frame of complete.frames) assert.equal(complete.protocol.receive(frame), true);
  assert.throws(() => complete.protocol.finish({ ...exit(complete.expected), code: 1 }), invalid);
  const oversized = fixture();
  assert.equal(oversized.protocol.receive({ body: 'x'.repeat(32 * 1024 * 1024) }), false);
  assert.equal(oversized.protocol.captured().captureComplete, false);
  const refused = fixture();
  const frame = { ...refused.frames[0], mode: 'foreign' };
  assert.equal(refused.protocol.receive(frame), false);
  assert.equal(refused.protocol.receive(refused.frames[0]), false);
  assert.equal(refused.protocol.captured().frames.length, 2);
  assert.equal(refused.protocol.captured().captureComplete, true);
  assert.throws(() => refused.protocol.finish(exit(refused.expected)), invalid);
});
test('original live APIs require actual IPC and refuse forged handles without effects', async () => {
  await assert.rejects(openHttpOriginalChannel({ mode: 'http-original-scenario' }), invalid);
  await assert.rejects(
    emitHttpOriginalPhase(Object.freeze(Object.create(null)), 'factory', {}),
    invalid,
  );
  for (const bad of [
    { ...context(), compositionId: 'privacy' },
    { ...context(), extra: true },
    { ...context(), profileSha256: 'bad' },
  ])
    assert.throws(() => createHttpOriginalProtocol(bad), invalid);
  assert.throws(() => createHttpOriginalProtocol(context(), {}), invalid);
});

for (const scenario of [
  'accepted-prefix',
  'send-replaced',
  'clock-replaced',
  'foreign-fixture',
  'job-binding',
  'disconnected',
])
  test(`actual isolated original IPC channel ${scenario} preserves disjoint frames and refuses promotion`, async () => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('./support/http-original-channel-child.mjs', import.meta.url)),
        scenario,
      ],
      {
        env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      },
    );
    const messages = [];
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (bytes) => {
      stdout += bytes;
    });
    child.on('message', (message) => messages.push(message));
    child.stderr.on('data', (bytes) => {
      stderr += bytes;
    });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
    try {
      const closed = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({ code, signal }));
      });
      assert.deepEqual(closed, { code: 0, signal: null }, stderr);
      const report = scenario === 'disconnected' ? JSON.parse(stdout) : messages.at(-1);
      assert.equal(report.kind, 'inspector-original-prefix-complete');
      assert.equal(report.actualPid, child.pid);
      assert.equal(report.complete, false);
      assert.equal(report.performanceQualified, false);
      const frames = scenario === 'disconnected' ? messages : messages.slice(0, -1);
      assert.equal(
        frames.length,
        scenario === 'foreign-fixture' ? 0 : scenario === 'accepted-prefix' ? 2 : 1,
      );
      for (const [index, frame] of frames.entries()) {
        assert.equal(frame.mode, 'http-original-scenario');
        assert.equal(frame.workerPid, child.pid);
        assert.equal(frame.sequence, index + 1);
        assert.equal(frame.phase, index === 0 ? 'start' : 'factory');
        assert.equal(frame.scenarioId, 'auth');
        assert.equal(frame.profileId, 'local');
      }
    } finally {
      clearTimeout(timeout);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  });

test('exact startup/preparation/measurement/close/final time boundaries are accepted for300s and600s profiles', () => {
  for (const scenarioId of ['auth', 'crud']) {
    const f = fixture({ scenarioId, profileId: 'hardening' });
    const end = 211 + f.nominal.durationSeconds;
    const seconds = [0, 30, 30, 30, 210, 210, 211, end, end + 30, end + 60, end + 60];
    for (const [index, frame] of f.frames.entries())
      frame.elapsedNs = String(BigInt(seconds[index]) * 1000000000n);
    f.frames[10].body.phaseSha256 = sha(f.frames.slice(0, 10));
    for (const frame of f.frames) assert.equal(f.protocol.receive(frame), true, frame.phase);
    assert.equal(f.protocol.finish(exit(f.expected)).complete, false);
  }
});

test('bounded refused-frame capture retains1024 actual received frames then refuses truncation without finish', () => {
  const f = fixture();
  const rejected = { ...f.frames[0], mode: 'foreign' };
  for (let i = 0; i < 1024; i++) assert.equal(f.protocol.receive(rejected), false);
  assert.equal(f.protocol.captured().frames.length, 1024);
  assert.equal(f.protocol.captured().captureComplete, true);
  assert.equal(f.protocol.receive(rejected), false);
  assert.equal(f.protocol.captured().frames.length, 1024);
  assert.equal(f.protocol.captured().captureComplete, false);
  assert.throws(() => f.protocol.finish(exit(f.expected)), invalid);
});
