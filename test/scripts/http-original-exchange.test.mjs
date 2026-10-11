import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { context, generatorId, h } from './support/http-original-fixture.mjs';

// INV-PERF-001: actual private Node IPC and original source API, never a native
// workload/process result origin or full runtime custody assertion.
const profiles = {
  auth: { local: [100, 300, 20, 200], hardening: [10, 300, 4, 25] },
  crud: { local: [10, 600, 2, 20], hardening: [4, 600, 4, 25] },
  upload: { local: [50, 300, 10, 100], hardening: [5, 300, 4, 25] },
  'cascade-delete': { local: [25, 300, 10, 100], hardening: [2, 300, 4, 25] },
};
async function probe(kind = 'positive', scenarioId = 'auth', profileId = 'hardening', mutate) {
  const expected = context(scenarioId, profileId);
  const [rate, duration, pre, max] = profiles[scenarioId][profileId];
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('./support/http-original-exchange-child.mjs', import.meta.url)),
      kind,
      scenarioId,
      profileId,
    ],
    {
      env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, NODE_DISABLE_COMPILE_CACHE: '1' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      timeout: 6000,
      killSignal: 'SIGKILL',
    },
  );
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (bytes) => {
    stdout += bytes;
    if (stdout.length > 65536) child.kill('SIGKILL');
  });
  child.stderr.on('data', (bytes) => {
    stderr += bytes;
    if (stderr.length > 65536) child.kill('SIGKILL');
  });
  child.on('message', (message) => {
    if (kind === 'disconnect') return;
    const command = message.phase === 'begin-ready' ? 'begin-measurement' : 'finish-measurement';
    const frame = {
      schemaVersion: 1,
      mode: 'http-original-scenario',
      operationId: expected.operationId,
      nonce: expected.nonce,
      candidateCommit: expected.candidateCommit,
      tree: expected.tree,
      workerPid: child.pid,
      scenarioId,
      profileId,
      command,
      body:
        command === 'begin-measurement'
          ? {
              generatorOperationId: generatorId,
              generatorExecutableSha256: h,
              generatorInputsSha256: h,
              durationSeconds: duration,
              ratePerSecond: rate,
              preAllocatedVUs: pre,
              maxVUs: max,
            }
          : {
              generatorOperationId:
                kind === 'mutate-return' ? '12345678-1234-4123-8123-123456789015' : generatorId,
              rawArtifactsSha256: h,
              nativeSummarySha256: kind === 'failed' ? null : h,
              nativeMetricsSha256: kind === 'failed' ? null : h,
              completedIterations: kind === 'failed' ? null : duration * rate + 1,
              droppedIterations: kind === 'failed' ? null : 0,
              interruptedIterations: kind === 'failed' ? null : 0,
              outcome: kind === 'failed' ? 'FAILED' : 'COMPLETED',
            },
    };
    mutate?.(frame);
    child.send(frame, (error) => {
      if (error) child.kill('SIGKILL');
    });
    if (kind === 'duplicate' && command === 'begin-measurement')
      child.send(frame, (error) => {
        if (error) child.kill('SIGKILL');
      });
  });
  const exit = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Owned IPC child close deadline expired'));
    }, 7000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
  assert.deepEqual(exit, { code: 0, signal: null }, stderr);
  assert.equal(stderr, '');
  assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
  const report = JSON.parse(stdout);
  for (const key of ['runtimeCustodyComplete', 'performanceQualified', 'readinessPromoting'])
    assert.equal(report[key], false);
  return report;
}
for (const scenarioId of Object.keys(profiles))
  for (const profileId of ['local', 'hardening'])
    test(`actual closed IPC ${scenarioId}/${profileId} retains the unchanged eight profiles`, async () => {
      const result = await probe('positive', scenarioId, profileId);
      assert.equal(result.refused, undefined);
      assert.deepEqual(result.repeatedBegin, result.begin);
      assert.deepEqual(result.close, {
        commandCount: 2,
        refused: false,
        complete: true,
        readinessPromoting: false,
      });
    });
test('actual FAILED exchange retains null native counters and full raw hash', async () => {
  const result = await probe('failed');
  for (const key of [
    'nativeSummarySha256',
    'nativeMetricsSha256',
    'completedIterations',
    'droppedIterations',
    'interruptedIterations',
  ])
    assert.equal(result.finish[key], null);
  assert.equal(result.finish.rawArtifactsSha256, h);
  assert.equal(result.finish.outcome, 'FAILED');
  assert.equal(result.close.complete, true);
  assert.equal(result.readinessPromoting, false);
});
for (const [label, mutate] of [
  [
    'foreign candidate',
    (frame) => {
      frame.candidateCommit = 'c'.repeat(40);
    },
  ],
  [
    'wrong worker',
    (frame) => {
      frame.workerPid++;
    },
  ],
  [
    'caller capacity',
    (frame) => {
      frame.capacity = 1;
    },
  ],
  [
    'lowered rate',
    (frame) => {
      if (frame.command === 'begin-measurement') frame.body.ratePerSecond = 1;
    },
  ],
  [
    'wrong operation',
    (frame) => {
      frame.operationId = generatorId;
    },
  ],
  [
    'out-of-order finish',
    (frame) => {
      frame.command = 'finish-measurement';
    },
  ],
  [
    'invented native completion',
    (frame) => {
      if (frame.command === 'finish-measurement') frame.body.completedIterations = null;
    },
  ],
  [
    'missing raw failure hash',
    (frame) => {
      if (frame.command === 'finish-measurement') frame.body.rawArtifactsSha256 = null;
    },
  ],
])
  test(`actual IPC refuses ${label} and preserves failure through closure`, async () => {
    const result = await probe('positive', 'auth', 'hardening', mutate);
    assert.ok(result.refused);
    assert.equal(result.close.refused, true);
    assert.equal(result.close.complete, false);
  });
test('mutating a delivered begin body cannot authorize a different generator finish', async (t) => {
  const result = await probe('mutate-return');
  t.diagnostic(JSON.stringify(result));
  assert.equal(result.repeatedBegin.generatorOperationId, generatorId);
  assert.ok(result.refused);
  assert.equal(result.close.refused, true);
  assert.equal(result.close.complete, false);
});

for (const kind of ['disconnect', 'duplicate'])
  test(`actual parent ${kind} preserves sticky exchange failure and private listener cleanup`, async () => {
    const result = await probe(kind);
    assert.ok(result.refused);
    assert.equal(result.close.refused, true);
    assert.equal(result.close.complete, false);
    assert.equal(result.close.readinessPromoting, false);
  });
