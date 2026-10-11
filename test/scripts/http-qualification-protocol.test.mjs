import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createHttpQualificationProtocol,
  emitHttpQualificationPhase,
  finishHttpQualificationChannel,
  openHttpQualificationChannel,
} from '../../scripts/lib/http-qualification-protocol.mjs';
import { serializeHttpRuntimePlainJson } from '../../scripts/lib/http-runtime-protocol.mjs';
import {
  generatorId,
  qualificationContext,
  sha256,
} from './support/http-qualification-fixture.mjs';

// INV-PERF-001: chronology and custody bounds remain distinct from qualification.
const invalid = { code: 'HTTP_QUALIFICATION_PROTOCOL_INVALID' };
const h = '1'.repeat(64);
function transcript(context = qualificationContext()) {
  const bodies = [
    [
      'start',
      0,
      {
        fixtureSha256: context.fixtureSha256,
        controlClosureSha256: context.controlClosureSha256,
        caseSha256: context.caseSha256,
        manifestSha256: context.manifestSha256,
        parentCorroborationRequired: true,
      },
    ],
    [
      'factory',
      1,
      { actualFactoryInvoked: true, actualAdapterCount: 1, appRetainedBeforeFactoryReturn: true },
    ],
    [
      'init',
      2,
      { layerCount: 1, controllerCount: 1, routeCount: 1, runtimeObjectSnapshotSha256: h },
    ],
    ['listen', 3, { host: '127.0.0.1', port: 12345 }],
    [
      'preparation-complete',
      4,
      {
        caseSha256: context.caseSha256,
        evidenceSha256: h,
        trafficCount: 1,
        sqlEffectCount: 1,
        objectEffectCount: 0,
      },
    ],
    [
      'ready',
      5,
      {
        host: '127.0.0.1',
        port: 12345,
        caseSha256: context.caseSha256,
        manifestSha256: context.manifestSha256,
        preparationEvidenceSha256: h,
        sessionEvidenceSha256: h,
      },
    ],
    [
      'measurement-start',
      6,
      {
        generatorOperationId: generatorId,
        generatorExecutableSha256: h,
        generatorInputsSha256: h,
        durationSeconds: 300,
        ratePerSecond: 2,
        scheduledTargetCount: 600,
      },
    ],
    [
      'measurement-complete',
      306,
      {
        generatorOperationId: generatorId,
        rawArtifactsSha256: h,
        rawOutcomeCount: 600,
        startedTargetCount: 600,
        completedTargetCount: 600,
        droppedTargetCount: 0,
        unexpectedOutcomeCount: 0,
        effectEvidenceSha256: h,
      },
    ],
    [
      'close',
      336,
      {
        actualAppCloseResolved: true,
        ownedSocketCloseEventsComplete: true,
        listenerClosed: true,
        openSocketCount: 0,
        clientDisposalEvidenceSha256: h,
      },
    ],
    [
      'final',
      366,
      {
        runtimeEvidenceSha256: h,
        sourceEvidenceSha256: h,
        fixtureFinalEvidenceSha256: h,
        parentFixtureCleanupRequired: true,
      },
    ],
  ];
  const frames = bodies.map(([phase, seconds, body], i) => ({
    schemaVersion: 1,
    mode: 'http-endpoint-qualification',
    sequence: i + 1,
    phase,
    ...Object.fromEntries(
      [
        'candidateCommit',
        'tree',
        'nonce',
        'operationId',
        'workerPid',
        'compositionId',
        'caseId',
      ].map((key) => [key, context[key]]),
    ),
    elapsedNs: String(BigInt(seconds) * 1_000_000_000n),
    body,
  }));
  frames.push({
    ...frames[0],
    sequence: 11,
    phase: 'terminal',
    elapsedNs: '366000000000',
    body: {
      phaseCount: 10,
      phaseSha256: sha256(serializeHttpRuntimePlainJson(frames)),
      resultArtifactSha256: h,
      parentCorroborationRequired: true,
      runtimeCustodyComplete: false,
      performanceQualified: false,
      readinessPromoting: false,
    },
  });
  return frames;
}
const cleanExit = (context) => ({
  workerPid: context.workerPid,
  code: 0,
  signal: null,
  operationId: context.operationId,
});
function refusedTranscript(frames, context = qualificationContext()) {
  const protocol = createHttpQualificationProtocol(context);
  const received = frames.map((frame) => protocol.receive(frame));
  assert.equal(received.includes(false), true);
  assert.throws(() => protocol.finish(cleanExit(context)), invalid);
  const captured = protocol.captured();
  assert.equal(captured.refused, true);
  assert.deepEqual(captured.frames, frames);
  assert.equal(captured.performanceQualified, false);
}

test('complete component transcript allows separate 30-second shutdown and final bounds without qualification', () => {
  const context = qualificationContext();
  const frames = transcript(context);
  const protocol = createHttpQualificationProtocol(context);
  assert.deepEqual(
    frames.map((frame) => protocol.receive(frame)),
    Array(11).fill(true),
  );
  const result = protocol.finish(cleanExit(context));
  assert.equal(result.componentWireComplete, true);
  assert.equal(result.frameCount, 11);
  assert.equal(result.transcriptSha256, sha256(serializeHttpRuntimePlainJson(frames)));
  assert.deepEqual(result.listener, { host: '127.0.0.1', port: 12345 });
  for (const key of [
    'complete',
    'runtimeCustodyComplete',
    'performanceQualified',
    'readinessPromoting',
  ])
    assert.equal(result[key], false);
  assert.throws(() => protocol.finish(cleanExit(context)), invalid);
});

for (const [name, mutate] of [
  [
    'shutdown exceeds 30 seconds',
    (frames) => {
      frames[8].elapsedNs = '336000000001';
    },
  ],
  [
    'final checks exceed their separate 30 seconds',
    (frames) => {
      frames[9].elapsedNs = '366000000001';
    },
  ],
  [
    'measurement under 300 seconds',
    (frames) => {
      frames[7].elapsedNs = '305999999999';
    },
  ],
  [
    'measurement exceeds completion grace',
    (frames) => {
      frames[7].elapsedNs = '336000000001';
    },
  ],
  [
    'startup exceeds 30 seconds',
    (frames) => {
      frames[3].elapsedNs = '30000000001';
    },
  ],
  [
    'preparation exceeds 180 seconds',
    (frames) => {
      frames[4].elapsedNs = '183000000001';
    },
  ],
  [
    'overall exceeds 600 seconds',
    (frames) => {
      frames[10].elapsedNs = '600000000001';
    },
  ],
  [
    'clock moves backward',
    (frames) => {
      frames[2].elapsedNs = '0';
    },
  ],
  [
    'start is not zero',
    (frames) => {
      frames[0].elapsedNs = '1';
    },
  ],
  [
    'phase is skipped',
    (frames) => {
      frames.splice(4, 1);
    },
  ],
  [
    'phase is duplicated',
    (frames) => {
      frames.splice(4, 0, structuredClone(frames[3]));
    },
  ],
  [
    'wrong worker PID',
    (frames) => {
      frames[4].workerPid++;
    },
  ],
  [
    'wrong operation',
    (frames) => {
      frames[4].operationId = generatorId;
    },
  ],
  [
    'wrong candidate',
    (frames) => {
      frames[4].candidateCommit = '0'.repeat(40);
    },
  ],
  [
    'wrong case',
    (frames) => {
      frames[4].caseId += '.different';
    },
  ],
  [
    'wrong nonce',
    (frames) => {
      frames[4].nonce = generatorId;
    },
  ],
  [
    'diagnostic wire substitution',
    (frames) => {
      frames[4].mode = 'http-runtime-diagnostic';
    },
  ],
  [
    'READY changes listener',
    (frames) => {
      frames[5].body.port++;
    },
  ],
  [
    'READY changes preparation digest',
    (frames) => {
      frames[5].body.preparationEvidenceSha256 = '0'.repeat(64);
    },
  ],
  [
    'measurement pools only 599 outcomes',
    (frames) => {
      frames[7].body.rawOutcomeCount = 599;
    },
  ],
  [
    'measurement drops an iteration',
    (frames) => {
      frames[7].body.droppedTargetCount = 1;
    },
  ],
  [
    'app shutdown leaves a socket',
    (frames) => {
      frames[8].body.openSocketCount = 1;
    },
  ],
  [
    'terminal forges qualification',
    (frames) => {
      frames[10].body.performanceQualified = true;
    },
  ],
  [
    'terminal has wrong prefix digest',
    (frames) => {
      frames[10].body.phaseSha256 = '0'.repeat(64);
    },
  ],
  [
    'unknown frame field',
    (frames) => {
      frames[4].extra = true;
    },
  ],
])
  test(`qualification protocol refuses and preserves ${name}`, () => {
    const frames = transcript();
    mutate(frames);
    refusedTranscript(frames);
  });

test('unexpected outcomes remain captured and wire completion never becomes performance PASS', () => {
  const context = qualificationContext();
  const frames = transcript(context);
  frames[7].body.unexpectedOutcomeCount = 600;
  frames[10].body.phaseSha256 = sha256(serializeHttpRuntimePlainJson(frames.slice(0, 10)));
  const protocol = createHttpQualificationProtocol(context);
  assert.deepEqual(
    frames.map((frame) => protocol.receive(frame)),
    Array(11).fill(true),
  );
  const result = protocol.finish(cleanExit(context));
  assert.equal(result.measurement.unexpectedOutcomeCount, 600);
  assert.equal(result.performanceQualified, false);
});

test('context and frame inputs reject accessors and proxies without evaluation', () => {
  let calls = 0;
  const context = qualificationContext();
  Object.defineProperty(context, 'caseId', {
    enumerable: true,
    get() {
      calls++;
      return 'changed';
    },
  });
  assert.throws(() => createHttpQualificationProtocol(context), invalid);
  assert.throws(
    () => createHttpQualificationProtocol(new Proxy(qualificationContext(), {})),
    invalid,
  );
  const protocol = createHttpQualificationProtocol(qualificationContext());
  const frame = transcript()[0];
  Object.defineProperty(frame, 'body', {
    enumerable: true,
    get() {
      calls++;
      return {};
    },
  });
  assert.equal(protocol.receive(frame), false);
  assert.equal(protocol.captured().captureComplete, false);
  assert.equal(calls, 0);
});

test('channel cannot be opened without actual private IPC and forged handles cannot emit', async () => {
  assert.equal(typeof process.send, 'undefined');
  await assert.rejects(
    openHttpQualificationChannel({ mode: 'http-endpoint-qualification' }),
    invalid,
  );
  for (const forged of [{}, Object.freeze(Object.create(null)), qualificationContext()]) {
    await assert.rejects(emitHttpQualificationPhase(forged, 'factory', {}), invalid);
    await assert.rejects(finishHttpQualificationChannel(forged, h), invalid);
  }
});
