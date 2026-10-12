import assert from 'node:assert/strict';
import {
  emitHttpQualificationPhase,
  finishHttpQualificationChannel,
  openHttpQualificationChannel,
} from '../../../scripts/lib/http-qualification-protocol.mjs';
import { qualificationContext } from './http-qualification-fixture.mjs';

const expected = qualificationContext();
const send = process.send;
const invalid = { code: 'HTTP_QUALIFICATION_PROTOCOL_INVALID' };
const job = {
  mode: 'http-endpoint-qualification',
  candidateCommit: expected.candidateCommit,
  tree: expected.tree,
  nonce: expected.nonce,
  compositionId: expected.compositionId,
  qualification: Object.fromEntries(
    ['operationId', 'caseId', 'caseSha256', 'manifestSha256'].map((key) => [key, expected[key]]),
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
const scenario = process.argv[2];
if (scenario === 'foreign-fixture') {
  job.referenceFixture.identity.tree = '0'.repeat(40);
  await assert.rejects(openHttpQualificationChannel(job), invalid);
} else {
  const handle = await openHttpQualificationChannel(job);
  assert.equal(Object.isFrozen(handle), true);
  assert.deepEqual(Reflect.ownKeys(handle), []);
  assert.equal(Object.getPrototypeOf(handle), null);
  await assert.rejects(openHttpQualificationChannel(job), invalid);
  await assert.rejects(
    emitHttpQualificationPhase(Object.freeze(Object.create(null)), 'factory', {}),
    invalid,
  );
  let substitutedCalls = 0;
  if (scenario === 'send-replaced')
    process.send = () => {
      substitutedCalls++;
    };
  if (scenario === 'clock-replaced')
    process.hrtime.bigint = () => {
      substitutedCalls++;
      return 0n;
    };
  const body = {
    actualFactoryInvoked: true,
    actualAdapterCount: 1,
    appRetainedBeforeFactoryReturn: true,
  };
  if (scenario === 'accepted-prefix') {
    await emitHttpQualificationPhase(handle, 'factory', body);
    await assert.rejects(finishHttpQualificationChannel(handle, '1'.repeat(64)), invalid);
  } else await assert.rejects(emitHttpQualificationPhase(handle, 'factory', body), invalid);
  assert.equal(substitutedCalls, 0);
}
await new Promise((resolve, reject) =>
  Reflect.apply(send, process, [
    {
      kind: 'inspector-child-complete',
      scenario,
      actualPid: process.pid,
      qualificationComplete: false,
    },
    (error) => (error ? reject(error) : resolve()),
  ]),
);
process.disconnect();
