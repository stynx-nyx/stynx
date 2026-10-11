import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { collectLegacyK6BaselineUploadAssociation } from '../../scripts/lib/k6-baseline-upload-association.mjs';
import {
  acquiredAssociationFixture,
  signed,
  token,
  uploadAction,
} from './support/k6-baseline-association-fixture.mjs';

// INV-PERF-001: real collector and association producer, external transport test
// data only. No synthetic response grants live authentication or baseline admission.
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function refused(
  fixture,
  pattern = /BASELINE_(?:UPLOAD_ASSOCIATION|IDENTITY|ARCHIVE|JSON)_REFUSED/u,
) {
  await assert.rejects(collectLegacyK6BaselineUploadAssociation(fixture.input), (error) => {
    assert.doesNotMatch(
      String(error),
      /inspector-association-external-token|external-secret|sig=/u,
    );
    return pattern.test(String(error));
  });
}
test('actual association reconciles complete two-page populations, exact source/log bytes and limited standing only', async () => {
  const fixture = await acquiredAssociationFixture({
    jobCount: 101,
    artifactCount: 101,
    runCount: 101,
  });
  const before = structuredClone(fixture.acquisition.receipt);
  const result = await collectLegacyK6BaselineUploadAssociation(fixture.input);
  const value = result.assessment;
  assert.equal(value.limitedAssociationReconciled, true);
  assert.equal(value.attemptJobPopulationCount, 101);
  assert.equal(value.artifactPopulationCount, 101);
  assert.equal(value.discoveryCount, 101);
  assert.equal(value.job.id, 701);
  assert.equal(value.sourceWorkflow.uploadAction, uploadAction);
  assert.equal(
    value.sourceWorkflow.blobSha,
    createHash('sha1')
      .update(`blob ${fixture.workflowBytes.length}\0`)
      .update(fixture.workflowBytes)
      .digest('hex'),
  );
  assert.equal(value.sourceWorkflow.sha256, hash(fixture.workflowBytes));
  assert.deepEqual(result.sourceWorkflowBytes, fixture.workflowBytes);
  assert.deepEqual(result.jobLogBytes, fixture.log);
  assert.deepEqual(result.jobLogAfterBytes, fixture.log);
  assert.equal(value.jobLog.sha256, hash(fixture.log));
  assert.equal(value.jobLog.size, fixture.log.length);
  assert.equal(value.jobLog.witnesses.length, 5);
  assert.equal(value.logBeforeAfterReconciled, true);
  assert.equal(value.originalReceiptUnmodified, true);
  assert.deepEqual(fixture.acquisition.receipt, before);
  assert.equal(
    value.authenticationCorroboration,
    'REQUIRES_INDEPENDENT_LIVE_PRODUCER_VERIFICATION',
  );
  assert.equal(
    value.jobLog.historicalLogCompleteness,
    'UNVERIFIED_BEYOND_COMPLETE_HTTP_BODY_AND_RUNNER_ENVELOPE',
  );
  for (const key of [
    'externalAcquisitionAndTransportPortAttestation',
    'originVerified',
    'attemptVerified',
    'profileVerified',
    'sourceBuildVerified',
    'nativeOriginVerified',
    'baselineEligible',
    'firstSeedAllowed',
    'measurementComplete',
    'endpointQualificationVerified',
    'readinessPromoting',
  ])
    assert.equal(value[key], false, key);
  for (const response of result.responses) {
    assert.equal(response.sha256, hash(response.bytes));
    assert.equal(response.size, response.bytes.length);
  }
  const signedCalls = fixture.calls.filter(({ url }) => url === signed);
  assert.equal(signedCalls.length, 2);
  for (const { options } of signedCalls)
    assert.equal(Object.hasOwn(options.headers, 'Authorization'), false);
});
for (const [stage, label, change] of [
  ['repository-before', 'wrong repository', (value) => ({ ...value, id: 7 })],
  [
    'workflow-before',
    'wrong workflow',
    (value) => ({ ...value, path: '.github/workflows/other.yml' }),
  ],
  ['current-before', 'wrong cutoff', (value) => ({ ...value, head_sha: 'd'.repeat(40) })],
  ['selected-before', 'wrong selected attempt', (value) => ({ ...value, run_attempt: 2 })],
  ['attempt-before', 'wrong explicit attempt', (value) => ({ ...value, run_attempt: 2 })],
  ['job-before', 'wrong job identity', (value) => ({ ...value, id: 702 })],
  ['job-before', 'wrong job attempt', (value) => ({ ...value, run_attempt: 2 })],
  ['job-before', 'wrong job head', (value) => ({ ...value, head_sha: 'd'.repeat(40) })],
  [
    'job-before',
    'job chronology outside run',
    (value) => ({ ...value, completed_at: '2020-01-01T10:03:00Z' }),
  ],
  [
    'jobs-before-1',
    'duplicate source jobs',
    (value) => ({
      ...value,
      total_count: 2,
      jobs: [
        value.jobs[0],
        {
          ...value.jobs[0],
          id: 702,
          url: 'https://api.github.com/repos/stynx-nyx/stynx/actions/jobs/702',
        },
      ],
    }),
  ],
  [
    'jobs-before-1',
    'duplicate identity',
    (value) => ({ ...value, total_count: 2, jobs: [value.jobs[0], value.jobs[0]] }),
  ],
  ['jobs-before-1', 'partial discovery', (value) => ({ ...value, total_count: 2 })],
  ['jobs-before-1', 'excessive discovery', (value) => ({ ...value, total_count: 10001 })],
  [
    'artifacts-before-1',
    'duplicate named artifacts',
    (value) => ({
      ...value,
      total_count: 2,
      artifacts: [value.artifacts[0], { ...value.artifacts[0], id: 302 }],
    }),
  ],
  ['source-before', 'wrong Git blob SHA', (value) => ({ ...value, sha: 'a'.repeat(40) })],
  ['source-before', 'noncanonical base64', (value) => ({ ...value, content: `${value.content}=` })],
  [
    'source-before',
    'wrong source path',
    (value) => ({ ...value, path: '.github/workflows/other.yml' }),
  ],
  ['source-before', 'wrong source size', (value) => ({ ...value, size: value.size + 1 })],
  [
    'source-after',
    'immutable source response changed',
    (value) => ({ ...value, marker: 'changed' }),
  ],
  ['job-after', 'job changed after log', (value) => ({ ...value, conclusion: 'neutral' })],
  [
    'jobs-after-1',
    'job population changed after log',
    (value) => ({ ...value, jobs: [{ ...value.jobs[0], name: 'different' }] }),
  ],
  [
    'artifact-after',
    'artifact changed after log',
    (value) => ({ ...value, size_in_bytes: value.size_in_bytes + 1 }),
  ],
  ['selected-after', 'run changed after log', (value) => ({ ...value, run_attempt: 2 })],
  ['workflow-after', 'workflow changed after log', (value) => ({ ...value, state: 'disabled' })],
])
  test(`actual association refuses ${label} at ${stage}`, async () => {
    const fixture = await acquiredAssociationFixture({ hooks: { [stage]: change } });
    await refused(fixture);
    assert.equal(
      fixture.calls.some(({ name }) => name === stage),
      true,
      'target external fault was reached',
    );
  });

for (const [label, mutate] of [
  ['missing final newline', (text) => text.slice(0, -1)],
  ['missing runner start', (text) => text.split('\n').slice(1).join('\n')],
  [
    'missing orphan cleanup tail',
    (text) => text.replace('Cleaning up orphan processes', 'Unknown tail'),
  ],
  ['NUL body', (text) => text.replace('Uploaded bytes', '\0Uploaded bytes')],
  ['wrong artifact ID', (text) => text.replace('Artifact ID 301', 'Artifact ID 302')],
  ['wrong download run', (text) => text.replace('/runs/500/artifacts/', '/runs/501/artifacts/')],
  ['wrong uploaded size', (text) => text.replace(/Uploaded bytes \d+/u, 'Uploaded bytes 1')],
  ['duplicate digest identity', (text) => text.replace(/(^.*SHA256 digest.*$)/mu, '$1\n$1')],
  [
    'conflicting extra identity',
    (text) =>
      text.replace(
        '2020-01-01T10:01:31.0000000Z Post job cleanup.',
        '2020-01-01T10:01:06.0000000Z Uploaded bytes 1\n2020-01-01T10:01:31.0000000Z Post job cleanup.',
      ),
  ],
  [
    'action outside exact step window',
    (text) => text.replace('10:01:01.0000000Z Uploaded', '10:00:59.0000000Z Uploaded'),
  ],
  [
    'upload output out of required order',
    (text) => {
      const lines = text.split('\n');
      [lines[7], lines[8]] = [lines[8], lines[7]];
      return lines.join('\n');
    },
  ],
  [
    'ambiguous action header',
    (text) =>
      text.replace(
        '2020-01-01T10:01:00.1500000Z ##[endgroup]',
        `2020-01-01T10:01:00.1450000Z ##[group]Run ${uploadAction}\n2020-01-01T10:01:00.1500000Z ##[endgroup]`,
      ),
  ],
])
  test(`actual raw job log refuses ${label}`, async () => {
    const fixture = await acquiredAssociationFixture({
      hooks: { 'log-before': (bytes) => Buffer.from(mutate(bytes.toString())) },
    });
    await refused(fixture);
    assert.equal(
      fixture.calls.some(({ name }) => name === 'log-before'),
      true,
      'actual raw log fault was reached',
    );
  });

test('before/after job log bytes must agree even when both independently contain valid upload witnesses', async () => {
  const fixture = await acquiredAssociationFixture({
    hooks: {
      'log-after': (bytes) => Buffer.from(bytes.toString().replace('fixture-1', 'fixture-2')),
    },
  });
  await refused(fixture, /job log changed/u);
});

for (const [index, [stage, options, change]] of [
  ['jobs-before-2', { jobCount: 101 }, (value) => ({ ...value, total_count: 100 })],
  ['jobs-before-2', { jobCount: 101 }, (value) => ({ ...value, jobs: [] })],
  ['jobs-before-2', { jobCount: 101 }, (value, { job }) => ({ ...value, jobs: [job] })],
  ['artifacts-after-2', { artifactCount: 101 }, (value) => ({ ...value, artifacts: [] })],
  ['runs-2', { runCount: 101 }, (value) => ({ ...value, total_count: 100 })],
  ['jobs-after-1', { jobCount: 101 }, (value) => ({ ...value, jobs: [...value.jobs].reverse() })],
  [
    'artifacts-after-1',
    { artifactCount: 101 },
    (value) => ({ ...value, artifacts: [...value.artifacts].reverse() }),
  ],
].entries())
  test(`complete population case ${index + 1} refuses ${stage} change ${JSON.stringify(options)} without accepting a partial prefix`, async () => {
    const fixture = await acquiredAssociationFixture({ ...options, hooks: { [stage]: change } });
    await refused(fixture);
    assert.equal(
      fixture.calls.some(({ name }) => name === stage),
      true,
    );
  });

function changedWorkflow(value, transform) {
  const bytes = Buffer.from(transform(Buffer.from(value.content, 'base64').toString()));
  return {
    ...value,
    size: bytes.length,
    content: bytes.toString('base64'),
    sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
  };
}
for (const [label, transform] of [
  [
    'different immutable action revision',
    (text) =>
      text.replace(
        uploadAction,
        'actions/upload-artifact@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ),
  ],
  [
    'different artifact output directory',
    (text) => text.replace('path: test/perf/k6/results', 'path: test/perf/other'),
  ],
  [
    'non-fail-closed missing-file behavior',
    (text) => text.replace('if-no-files-found: error', 'if-no-files-found: warn'),
  ],
  [
    'different name expression',
    (text) => text.replace("name: '${{ env.K6_ARTIFACT_NAME }}'", "name: 'k6-results-all'"),
  ],
  ['duplicate YAML job key', (text) => `${text}\njobs: {}\n`],
  [
    'different source step order',
    (text) =>
      text
        .replace('      - name: Prepare\n        run: echo preparing\n', '')
        .replace(
          '      - name: Upload k6 artifacts',
          '      - name: Prepare\n        run: echo preparing\n      - name: Upload k6 artifacts',
        ),
  ],
])
  test(`correct Git blob encoding cannot authorize ${label}`, async () => {
    const fixture = await acquiredAssociationFixture({
      hooks: { 'source-before': (value) => changedWorkflow(value, transform) },
    });
    await refused(fixture);
    assert.equal(
      fixture.calls.some(({ name }) => name === 'source-before'),
      true,
    );
  });

for (const [label, change] of [
  [
    'duplicate step name',
    (job) => {
      job.steps[1].name = job.steps[0].name;
      return job;
    },
  ],
  [
    'duplicate step number',
    (job) => {
      job.steps[1].number = job.steps[0].number;
      return job;
    },
  ],
  [
    'reversed step chronology',
    (job) => {
      job.steps[1].started_at = '2020-01-01T10:01:01Z';
      return job;
    },
  ],
  [
    'skipped declared source step',
    (job) => {
      job.steps[1].conclusion = 'skipped';
      return job;
    },
  ],
])
  test(`actual job metadata refuses ${label}`, async () => {
    const fixture = await acquiredAssociationFixture({
      hooks: { 'jobs-before-1': (value) => ({ ...value, jobs: [change(value.jobs[0])] }) },
    });
    await refused(fixture);
    assert.equal(
      fixture.calls.some(({ name }) => name === 'jobs-before-1'),
      true,
    );
  });

for (const [label, change] of [
  ['extra caller authority', (input) => ({ ...input, originVerified: true })],
  ['proxied request', (input) => new Proxy(input, {})],
  [
    'getter acquisition',
    (input) =>
      Object.defineProperty({ ...input }, 'acquisition', {
        get() {
          throw new Error('GETTER EXECUTED');
        },
      }),
  ],
  [
    'retained archive bytes changed',
    (input) => {
      input.acquisition.archiveBytes[0] ^= 1;
      return input;
    },
  ],
])
  test(`actual association refuses ${label} before any new external request`, async () => {
    const fixture = await acquiredAssociationFixture();
    fixture.input = change(fixture.input);
    await refused(fixture);
    assert.deepEqual(fixture.calls, []);
  });

test('actual signed log transport refuses forbidden delivery origin before any authenticated token can cross', async () => {
  const fixture = await acquiredAssociationFixture({
    hooks: {
      'log-redirect-before': () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://attacker.example/job.log' },
        }),
    },
  });
  await refused(fixture, /BASELINE_TRANSPORT_REFUSED: unsafe signed log redirect/u);
  assert.equal(
    fixture.calls.some(({ url }) => url.includes('attacker.example')),
    false,
  );
  assert.equal(
    fixture.calls.some(({ name }) => name === 'log-before'),
    false,
  );
});

test('actual signed log response over declared64MiB bound is cancelled before retaining a body', async () => {
  let cancellations = 0;
  const fixture = await acquiredAssociationFixture({
    hooks: {
      'log-before': () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancellations++;
            },
          }),
          { status: 200, headers: { 'content-length': String(64 * 1024 * 1024 + 1) } },
        ),
    },
  });
  await refused(fixture, /BASELINE_TRANSPORT_REFUSED/u);
  assert.equal(cancellations, 1);
  assert.equal(
    fixture.calls.some(({ name }) => name === 'log-after'),
    false,
  );
});

for (const [label, response] of [
  [
    'truncated declared body',
    (bytes) =>
      new Response(new Uint8Array(bytes), {
        status: 200,
        headers: { 'content-length': String(bytes.length + 1) },
      }),
  ],
  [
    'nonidentity encoded body',
    (bytes) =>
      new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-encoding': 'gzip' } }),
  ],
])
  test(`actual signed log transport refuses ${label}`, async () => {
    const fixture = await acquiredAssociationFixture({ hooks: { 'log-before': response } });
    await refused(fixture, /BASELINE_TRANSPORT_REFUSED/u);
    assert.equal(
      fixture.calls.some(({ name }) => name === 'log-before'),
      true,
    );
  });
