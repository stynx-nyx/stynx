import { createHash } from 'node:crypto';
import { serializeHttpRuntimePlainJson } from '../../../scripts/lib/http-runtime-protocol.mjs';

export const h = '1'.repeat(64);
export const generatorId = '12345678-1234-4123-8123-123456789012';
export const sha = (value) =>
  createHash('sha256').update(serializeHttpRuntimePlainJson(value)).digest('hex');
export function context(scenarioId = 'auth', profileId = 'local') {
  return {
    candidateCommit: 'a'.repeat(40),
    tree: 'b'.repeat(40),
    nonce: '12345678-1234-4123-8123-123456789013',
    operationId: '12345678-1234-4123-8123-123456789014',
    workerPid: 12345,
    compositionId: 'reference',
    scenarioId,
    profileId,
    profileSha256: h,
    manifestSha256: h,
    fixtureSha256: h,
    controlClosureSha256: h,
  };
}
export const exit = (expected) => ({
  workerPid: expected.workerPid,
  code: 0,
  signal: null,
  operationId: expected.operationId,
});
// Received-frame component data, never evidence that any application ran.
export function transcript(expected, nominal, outcome = 'COMPLETED') {
  const end = outcome === 'FAILED' ? 7 : nominal.durationSeconds + 6;
  const bodies = [
    [
      'start',
      0,
      {
        fixtureSha256: expected.fixtureSha256,
        controlClosureSha256: expected.controlClosureSha256,
        profileSha256: expected.profileSha256,
        manifestSha256: expected.manifestSha256,
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
        profileSha256: expected.profileSha256,
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
        profileSha256: expected.profileSha256,
        manifestSha256: expected.manifestSha256,
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
        durationSeconds: nominal.durationSeconds,
        ratePerSecond: nominal.rate,
        preAllocatedVUs: nominal.preAllocatedVUs,
        maxVUs: nominal.maxVUs,
      },
    ],
    [
      'measurement-complete',
      end,
      {
        generatorOperationId: generatorId,
        rawArtifactsSha256: h,
        nativeSummarySha256: outcome === 'FAILED' ? null : h,
        nativeMetricsSha256: outcome === 'FAILED' ? null : h,
        completedIterations:
          outcome === 'FAILED' ? null : nominal.rate * nominal.durationSeconds + 1,
        droppedIterations: outcome === 'FAILED' ? null : 17,
        interruptedIterations: outcome === 'FAILED' ? null : 3,
        outcome,
      },
    ],
    [
      'close',
      end + 30,
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
      end + 60,
      {
        runtimeEvidenceSha256: h,
        sourceEvidenceSha256: h,
        fixtureFinalEvidenceSha256: h,
        parentFixtureCleanupRequired: true,
      },
    ],
  ];
  const keys = [
    'candidateCommit',
    'tree',
    'nonce',
    'operationId',
    'workerPid',
    'compositionId',
    'scenarioId',
    'profileId',
  ];
  const frames = bodies.map(([phase, seconds, body], i) => ({
    schemaVersion: 1,
    mode: 'http-original-scenario',
    sequence: i + 1,
    phase,
    ...Object.fromEntries(keys.map((key) => [key, expected[key]])),
    elapsedNs: String(BigInt(seconds) * 1000000000n),
    body,
  }));
  frames.push({
    ...frames[0],
    sequence: 11,
    phase: 'terminal',
    elapsedNs: frames.at(-1).elapsedNs,
    body: {
      phaseCount: 10,
      phaseSha256: sha(frames),
      resultArtifactSha256: h,
      parentCorroborationRequired: true,
      runtimeCustodyComplete: false,
      performanceQualified: false,
      readinessPromoting: false,
    },
  });
  return frames;
}
