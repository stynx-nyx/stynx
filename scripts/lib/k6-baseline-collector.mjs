// Acquire legacy component baseline bytes for independent verification.
// This is not endpoint/profile/build/attempt qualification or a release-gate PASS.
import { createGithubBaselineTransport } from './k6-baseline-transport.mjs';
import {
  baselineRepository,
  projectBaselineRun,
  projectBaselineArtifact,
  selectPriorBaselineRun,
} from './k6-baseline-identity.mjs';
import { inspectBaselineArchive } from './k6-baseline-archive.mjs';
import { parseBaselineJson } from './k6-baseline-json.mjs';
import { types } from 'node:util';

const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const refuse = (message) => {
  throw new Error(`BASELINE_COLLECTION_REFUSED: ${message}`);
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function options(value) {
  const keys = ['runId', 'runAttempt', 'headSha', 'scenario', 'token', 'fetchImpl'];
  if (
    !value ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    refuse('invalid options');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== keys.length ||
    Reflect.ownKeys(descriptors).some((key) => !keys.includes(key)) ||
    keys.some((key) => !descriptors[key] || !Object.hasOwn(descriptors[key], 'value'))
  )
    refuse('options must be closed own data');
  const result = Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
  for (const key of ['runId', 'runAttempt'])
    if (!Number.isSafeInteger(result[key]) || result[key] < 1) refuse('invalid expected run');
  if (
    typeof result.headSha !== 'string' ||
    !/^[a-f0-9]{40}$/u.test(result.headSha) ||
    !['all', 'auth', 'crud', 'upload', 'cascade-delete'].includes(result.scenario)
  )
    refuse('invalid expected candidate/scenario');
  return result;
}

export async function collectLegacyK6Baseline(input) {
  const { runId, runAttempt, headSha, scenario, token, fetchImpl } = options(input);
  const client = createGithubBaselineTransport(token, fetchImpl);
  const responses = [];
  let responseBytes = 0;
  async function capture(name, operation) {
    const response = await operation;
    responseBytes += response.bytes.length;
    if (responseBytes > MAX_RESPONSE_BYTES || responses.length >= 205)
      refuse('API evidence resource limit');
    responses.push(
      Object.freeze({
        name,
        endpoint: response.endpoint,
        sha256: response.sha256,
        size: response.bytes.length,
        bytes: response.bytes,
      }),
    );
    return response.value;
  }
  function expectedCurrent(value) {
    const projected = projectBaselineRun(value);
    if (
      projected.id !== runId ||
      projected.runAttempt !== runAttempt ||
      projected.headSha !== headSha
    )
      refuse('current run/attempt/candidate mismatch');
    return projected;
  }
  async function population(member, maximum, operation) {
    let total;
    const rows = [];
    const seen = new Set();
    for (let number = 1; ; number += 1) {
      const value = await capture(`${member}-page-${number}.json`, operation(number));
      if (
        !value ||
        typeof value !== 'object' ||
        !Number.isSafeInteger(value.total_count) ||
        value.total_count < 0 ||
        value.total_count > maximum ||
        !Array.isArray(value[member])
      )
        refuse('invalid or capped discovery population');
      if (number === 1) total = value.total_count;
      if (value.total_count !== total) refuse('discovery population changed during pagination');
      const expectedLength = Math.min(100, total - rows.length);
      if (value[member].length !== expectedLength) refuse('truncated or overfull discovery page');
      for (const row of value[member]) {
        if (!row || !Number.isSafeInteger(row.id) || row.id < 1 || seen.has(row.id))
          refuse('duplicate or invalid discovery identity');
        seen.add(row.id);
        rows.push(row);
      }
      if (rows.length === total) return rows;
    }
  }
  const workflow = await capture('workflow.json', client.workflow());
  if (
    workflow.id !== baselineRepository.workflowId ||
    workflow.path !== baselineRepository.workflowPath ||
    workflow.state !== 'active'
  )
    refuse('workflow metadata mismatch');
  const current = await capture('current-before.json', client.run(runId));
  const currentProjection = expectedCurrent(current);
  // GitHub's branch-filtered search caps at 1000. Never label that cap a complete history.
  const runs = await population('workflow_runs', 999, (number) => client.runs(number));
  const discovery = selectPriorBaselineRun(current, runs);
  if (!discovery.selected)
    refuse('no prior baseline discovered; known history forbids inferred first seed');
  const selectedId = discovery.selected.id;
  const selected = await capture('selected-before.json', client.run(selectedId));
  if (!same(projectBaselineRun(selected), discovery.selected))
    refuse('selected run changed after discovery');
  const selectedAttempt = await capture(
    'selected-attempt-before.json',
    client.attempt(selectedId, discovery.selected.runAttempt),
  );
  if (!same(projectBaselineRun(selectedAttempt), discovery.selected))
    refuse('selected attempt metadata mismatch');
  const artifacts = await population('artifacts', 10_000, (number) =>
    client.artifacts(selectedId, number),
  );
  for (const artifact of artifacts)
    if (typeof artifact.name !== 'string' || artifact.name.length < 1 || artifact.name.length > 255)
      refuse('discovery artifact name is missing or malformed');
  const matches = artifacts.filter((artifact) => artifact.name === `k6-results-${scenario}`);
  if (matches.length !== 1) refuse('required artifact is missing or ambiguous; no older fallback');
  const listedArtifact = projectBaselineArtifact(matches[0], selected, scenario, Date.now());
  const artifact = await capture('artifact-before.json', client.artifact(listedArtifact.id));
  const artifactProjection = projectBaselineArtifact(artifact, selected, scenario, Date.now());
  if (!same(artifactProjection, listedArtifact)) refuse('artifact changed after discovery');
  const downloaded = await client.download(artifactProjection.id);
  if (
    downloaded.size !== artifactProjection.size ||
    downloaded.sha256 !== artifactProjection.sha256
  )
    refuse('downloaded archive size or digest mismatch');
  const scenarios = scenario === 'all' ? ['auth', 'crud', 'upload', 'cascade-delete'] : [scenario];
  const roster = scenarios.flatMap((name) => [`${name}.summary.json`, `${name}.summary.html`]);
  const archive = inspectBaselineArchive({
    bytes: downloaded.bytes,
    sha256: artifactProjection.sha256,
    roster,
  });
  for (const file of archive.files)
    if (file.name.endsWith('.json')) {
      const summary = parseBaselineJson(file.bytes);
      if (
        !summary ||
        typeof summary !== 'object' ||
        Array.isArray(summary) ||
        !summary.metrics ||
        typeof summary.metrics !== 'object' ||
        Array.isArray(summary.metrics)
      )
        refuse('legacy summary metrics object required');
    }
  const selectedAfter = await capture('selected-after.json', client.run(selectedId));
  if (!same(projectBaselineRun(selectedAfter), discovery.selected))
    refuse('selected run changed during download');
  const attemptAfter = await capture(
    'selected-attempt-after.json',
    client.attempt(selectedId, discovery.selected.runAttempt),
  );
  if (!same(projectBaselineRun(attemptAfter), discovery.selected))
    refuse('selected attempt changed during download');
  const artifactAfter = await capture(
    'artifact-after.json',
    client.artifact(artifactProjection.id),
  );
  if (
    !same(
      projectBaselineArtifact(artifactAfter, selectedAfter, scenario, Date.now()),
      artifactProjection,
    )
  )
    refuse('artifact changed or expired during download');
  const currentAfter = expectedCurrent(await capture('current-after.json', client.run(runId)));
  for (const key of ['createdAt', 'branch', 'event', 'startedAt'])
    if (currentAfter[key] !== currentProjection[key])
      refuse('current immutable run identity changed');
  return Object.freeze({
    receipt: Object.freeze({
      schemaVersion: '1.0.0',
      kind: 'legacy-k6-baseline-acquisition',
      capturedAt: new Date().toISOString(),
      repository: baselineRepository,
      current: currentProjection,
      selected: discovery.selected,
      artifact: artifactProjection,
      discoveryCount: runs.length,
      artifactPopulationCount: artifacts.length,
      archive: Object.freeze({
        sha256: archive.archiveSha256,
        size: archive.archiveBytes,
        files: Object.freeze(
          archive.files.map(({ name, size, sha256 }) => Object.freeze({ name, size, sha256 })),
        ),
      }),
      responses: Object.freeze(responses.map(({ bytes, ...record }) => Object.freeze(record))),
      deliveryHost: downloaded.signedHost,
      firstSeedAllowed: false,
      originVerified: false,
      attemptVerified: false,
      profileVerified: false,
      sourceBuildVerified: false,
      endpointQualificationVerified: false,
      measurementComplete: false,
      readinessPromoting: false,
    }),
    responses: Object.freeze(responses),
    archiveBytes: downloaded.bytes,
    files: archive.files,
  });
}
