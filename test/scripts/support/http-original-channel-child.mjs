import assert from 'node:assert/strict';
import {
  assertHttpOriginalChannel,
  emitHttpOriginalPhase,
  finishHttpOriginalChannel,
  openHttpOriginalChannel,
} from '../../../scripts/lib/http-original-protocol.mjs';
import { context } from './http-original-fixture.mjs';

// Controlled actual IPC prefix only. No app, generator, fixture or qualification
// is claimed by these received component frames.
const expected = context();
const nativeSend = process.send;
const invalid = { code: 'HTTP_ORIGINAL_PROTOCOL_INVALID' };
const scenario = process.argv[2];
const job = {
  mode: 'http-original-scenario',
  candidateCommit: expected.candidateCommit,
  tree: expected.tree,
  nonce: expected.nonce,
  compositionId: expected.compositionId,
  originalScenario: Object.fromEntries(
    ['operationId', 'scenarioId', 'profileId', 'profileSha256', 'manifestSha256'].map((key) => [
      key,
      expected[key],
    ]),
  ),
  referenceFixture: {
    identity: {
      candidateCommit: expected.candidateCommit,
      tree: expected.tree,
      nonce: expected.nonce,
    },
  },
  controls: [],
};
if (scenario === 'foreign-fixture') {
  job.referenceFixture.identity.tree = 'c'.repeat(40);
  await assert.rejects(openHttpOriginalChannel(job), invalid);
} else {
  const handle = await openHttpOriginalChannel(job);
  assert.equal(Object.isFrozen(handle), true);
  assert.equal(Object.getPrototypeOf(handle), null);
  assert.deepEqual(Reflect.ownKeys(handle), []);
  assertHttpOriginalChannel(handle, job);
  await assert.rejects(openHttpOriginalChannel(job), invalid);
  await assert.rejects(
    emitHttpOriginalPhase(Object.freeze(Object.create(null)), 'factory', {}),
    invalid,
  );
  if (scenario === 'job-binding') {
    assert.throws(
      () =>
        assertHttpOriginalChannel(handle, {
          ...job,
          originalScenario: { ...job.originalScenario, profileId: 'hardening' },
        }),
      invalid,
    );
  } else {
    let calls = 0;
    if (scenario === 'disconnected') process.disconnect();
    if (scenario === 'send-replaced')
      process.send = () => {
        calls++;
      };
    if (scenario === 'clock-replaced')
      process.hrtime.bigint = () => {
        calls++;
        return 0n;
      };
    const body = {
      actualFactoryInvoked: true,
      actualAdapterCount: 1,
      appRetainedBeforeFactoryReturn: true,
    };
    if (scenario === 'accepted-prefix') {
      await emitHttpOriginalPhase(handle, 'factory', body);
      await assert.rejects(finishHttpOriginalChannel(handle, '1'.repeat(64)), invalid);
    } else await assert.rejects(emitHttpOriginalPhase(handle, 'factory', body), invalid);
    assert.equal(calls, 0);
  }
}
const report = {
  kind: 'inspector-original-prefix-complete',
  scenario,
  actualPid: process.pid,
  complete: false,
  performanceQualified: false,
};
if (scenario === 'disconnected') process.stdout.write(JSON.stringify(report));
else {
  await new Promise((resolve, reject) =>
    Reflect.apply(nativeSend, process, [report, (error) => (error ? reject(error) : resolve())]),
  );
  process.disconnect();
}
