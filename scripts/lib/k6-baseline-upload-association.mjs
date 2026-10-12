// Append a limited response-byte reconciliation; never rewrite baseline history.
import { createHash } from 'node:crypto';
import { types, isDeepStrictEqual } from 'node:util';
import { parseDocument } from 'yaml';
import { createGithubBaselineTransport } from './k6-baseline-transport.mjs';
import {
  baselineRepository,
  projectBaselineRun,
  projectBaselineArtifact,
  selectPriorBaselineRun,
} from './k6-baseline-identity.mjs';
import { inspectBaselineArchive } from './k6-baseline-archive.mjs';
import { serializeHttpRuntimePlainJson } from './http-runtime-protocol.mjs';

const uploadAction = 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a';
const artifactExpression =
  "k6-results-${{ github.event_name == 'workflow_dispatch' && inputs.scenario || 'all' }}";
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function refuse(message) {
  throw new Error(`BASELINE_UPLOAD_ASSOCIATION_REFUSED: ${message}`);
}
function closed(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    refuse('own data required');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    !isDeepStrictEqual(Reflect.ownKeys(descriptors).sort(), [...keys].sort()) ||
    keys.some((key) => !Object.hasOwn(descriptors[key], 'value'))
  )
    refuse('closed fields required');
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function copyReceipt(value) {
  let count = 0,
    budget = 0;
  const visit = (item, depth) => {
    if (++count > 10_000 || depth > 20) refuse('receipt resource limit');
    budget += 32;
    if (typeof item === 'string') budget += item.length * 6;
    if (budget > 1024 * 1024) refuse('receipt resource limit');
    if (
      item === null ||
      ['string', 'boolean'].includes(typeof item) ||
      (typeof item === 'number' && Number.isFinite(item))
    )
      return;
    if (
      !item ||
      typeof item !== 'object' ||
      types.isProxy(item) ||
      ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(item))
    )
      refuse('receipt own data required');
    for (const key of Reflect.ownKeys(item)) {
      if (Array.isArray(item) && key === 'length') continue;
      const entry = Object.getOwnPropertyDescriptor(item, key);
      if (typeof key !== 'string' || !Object.hasOwn(entry, 'value'))
        refuse('receipt data required');
      budget += key.length * 6;
      visit(entry.value, depth + 1);
    }
  };
  visit(value, 0);
  const text = serializeHttpRuntimePlainJson(value);
  return { value: JSON.parse(text), sha256: hash(text) };
}
function stamp(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value.replace('Z', '.000Z')
  )
    refuse('timestamp required');
  return Date.parse(value);
}
function projectJob(job, run) {
  if (
    !job ||
    !Number.isSafeInteger(job.id) ||
    job.id < 1 ||
    job.run_id !== run.id ||
    job.run_attempt !== run.runAttempt ||
    job.head_sha !== run.headSha ||
    job.head_branch !== 'main' ||
    job.run_url !== `https://api.github.com/repos/stynx-nyx/stynx/actions/runs/${run.id}` ||
    job.url !== `https://api.github.com/repos/stynx-nyx/stynx/actions/jobs/${job.id}` ||
    job.status !== 'completed' ||
    !['success', 'skipped', 'neutral'].includes(job.conclusion) ||
    typeof job.name !== 'string' ||
    job.name.length > 255 ||
    !Array.isArray(job.steps) ||
    job.steps.length > 256
  )
    refuse('job context mismatch');
  const started = stamp(job.started_at),
    completed = stamp(job.completed_at);
  if (started < stamp(run.startedAt) || completed < started || completed > stamp(run.updatedAt))
    refuse('job chronology mismatch');
  const seen = new Set();
  let number = 0;
  const steps = job.steps.map((step) => {
    if (
      !step ||
      !Number.isSafeInteger(step.number) ||
      step.number <= number ||
      typeof step.name !== 'string' ||
      !step.name ||
      step.name.length > 1024 ||
      seen.has(step.name) ||
      step.status !== 'completed' ||
      !['success', 'skipped', 'neutral'].includes(step.conclusion)
    )
      refuse('ambiguous or incomplete job steps');
    const begin = stamp(step.started_at),
      end = stamp(step.completed_at);
    if (begin < started || end < begin || end > completed) refuse('step chronology mismatch');
    number = step.number;
    seen.add(step.name);
    return {
      number: step.number,
      name: step.name,
      status: step.status,
      conclusion: step.conclusion,
      startedAt: step.started_at,
      completedAt: step.completed_at,
    };
  });
  return {
    id: job.id,
    runId: job.run_id,
    runAttempt: job.run_attempt,
    headSha: job.head_sha,
    name: job.name,
    workflowName: job.workflow_name,
    status: job.status,
    conclusion: job.conclusion,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    steps,
  };
}
function sourceBinding(response, run, job) {
  const value = response.value;
  if (
    value?.type !== 'file' ||
    value.path !== baselineRepository.workflowPath ||
    value.encoding !== 'base64' ||
    !Number.isSafeInteger(value.size) ||
    value.size < 1 ||
    value.size > 1024 * 1024 ||
    typeof value.content !== 'string' ||
    !/^[A-Za-z0-9+/=\n]+$/u.test(value.content) ||
    typeof value.sha !== 'string' ||
    !/^[a-f0-9]{40}$/u.test(value.sha)
  )
    refuse('workflow source response mismatch');
  const encoded = value.content.replaceAll('\n', '');
  if (encoded.length !== Math.ceil(value.size / 3) * 4) refuse('workflow encoded size mismatch');
  const bytes = Buffer.from(encoded, 'base64');
  if (
    bytes.length !== value.size ||
    bytes.toString('base64') !== encoded ||
    createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== value.sha
  )
    refuse('workflow source blob mismatch');
  const document = parseDocument(new TextDecoder('utf-8', { fatal: true }).decode(bytes), {
    uniqueKeys: true,
    schema: 'core',
  });
  if (document.errors.length || document.warnings.length) refuse('ambiguous workflow source');
  let source;
  try {
    source = document.toJS({ maxAliasCount: 0 });
  } catch {
    refuse('unsupported workflow YAML alias');
  }
  const declared = source?.jobs?.k6;
  if (
    source?.name !== job.workflowName ||
    declared?.name !== job.name ||
    !Array.isArray(declared.steps) ||
    declared.steps.length > 128 ||
    source.env?.K6_ARTIFACT_NAME !== artifactExpression
  )
    refuse('workflow/job source mismatch');
  const matches = declared.steps.filter((step) => step.uses === uploadAction);
  if (
    matches.length !== 1 ||
    matches[0].name !== 'Upload k6 artifacts' ||
    matches[0].with?.name !== '${{ env.K6_ARTIFACT_NAME }}' ||
    matches[0].with?.path !== 'test/perf/k6/results' ||
    matches[0].with?.['if-no-files-found'] !== 'error'
  )
    refuse('unsupported upload source binding');
  const steps = declared.steps.map((step) => {
    const name = step.name ?? (typeof step.uses === 'string' ? `Run ${step.uses}` : null);
    const actual = job.steps.filter((row) => row.name === name);
    if (!name || actual.length !== 1 || actual[0].conclusion !== 'success')
      refuse('source step absent or unsuccessful');
    return {
      name,
      number: actual[0].number,
      sourceSha256: hash(serializeHttpRuntimePlainJson(step)),
    };
  });
  if (steps.some((step, index) => index && step.number !== steps[index - 1].number + 1))
    refuse('source step order mismatch');
  return {
    bytes,
    binding: {
      path: value.path,
      commit: run.headSha,
      blobSha: value.sha,
      sha256: hash(bytes),
      jobKey: 'k6',
      uploadAction,
      uploadStep: job.steps.find((row) => row.name === matches[0].name),
      artifactNameExpression: artifactExpression,
      steps,
      measurementEnvironmentAsDeclared:
        declared.steps.find((step) => step.name === 'Run isolated k6 scenarios')?.env ?? null,
    },
  };
}
function uploadLog(bytes, source, job, artifact) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 64 * 1024 * 1024)
    refuse('job log bound');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!text.endsWith('\n') || text.includes('\0')) refuse('incomplete job log');
  const rows = [];
  let offset = 0;
  while (offset < text.length) {
    const end = text.indexOf('\n', offset);
    if (end < 0 || end - offset > 64 * 1024 || rows.length >= 100_000) refuse('job log line bound');
    const line = text.slice(offset, end);
    offset = end + 1;
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,9}Z) (.*)$/u.exec(
      line.replace(/\r$/u, ''),
    );
    if (!match || !Number.isFinite(Date.parse(match[1]))) refuse('job log envelope');
    const time = Date.parse(match[1]);
    if (time < stamp(job.startedAt) || time >= stamp(job.completedAt) + 1000)
      refuse('job log chronology');
    rows.push({ line: rows.length + 1, time, text: match[2] });
  }
  if (
    !/^Current runner version: '[^']+'$/u.test(rows[0].text) ||
    rows.at(-1).text !== 'Cleaning up orphan processes'
  )
    refuse('partial runner log envelope');
  const marker = `##[group]Run ${uploadAction}`;
  const starts = rows.filter((row) => row.text === marker);
  if (starts.length !== 1) refuse('upload action log ambiguous');
  const start = starts[0].line - 1;
  const end = rows.findIndex((row, index) => index > start && row.text === '##[endgroup]');
  if (end < start || end - start > 128) refuse('upload action header incomplete');
  const header = rows.slice(start + 1, end).map((row) => row.text);
  for (const field of [
    `  name: ${artifact.name}`,
    '  path: test/perf/k6/results',
    '  if-no-files-found: error',
    `  K6_ARTIFACT_NAME: ${artifact.name}`,
  ])
    if (header.filter((line) => line === field).length !== 1)
      refuse('upload source/action input mismatch');
  const step = source.uploadStep;
  const next = rows.findIndex(
    (row, index) =>
      index > end && (row.text === 'Post job cleanup.' || row.text.startsWith('##[group]')),
  );
  if (next < 0) refuse('upload action output boundary missing');
  const segment = rows.slice(start, next);
  if (
    segment.some(
      (row) => row.time < stamp(step.startedAt) || row.time >= stamp(step.completedAt) + 1000,
    )
  )
    refuse('upload output outside exact step window');
  const output = rows.slice(end + 1, next);
  const required = [
    `Uploaded bytes ${artifact.size}`,
    `SHA256 digest of uploaded artifact is ${artifact.sha256}`,
    `Artifact ${artifact.name} successfully finalized. Artifact ID ${artifact.id}`,
    `Artifact ${artifact.name} has been successfully uploaded! Final size is ${artifact.size} bytes. Artifact ID is ${artifact.id}`,
    `Artifact download URL: https://github.com/stynx-nyx/stynx/actions/runs/${artifact.runId}/artifacts/${artifact.id}`,
  ];
  let previous = -1;
  const witnesses = required.map((expected) => {
    const found = output.filter((row) => row.text === expected);
    if (found.length !== 1 || found[0].line <= previous)
      refuse('upload identity output absent or ambiguous');
    previous = found[0].line;
    return { line: found[0].line, sha256: hash(found[0].text) };
  });
  // Conflicting upload identities inside the source-bound action are refused.
  const identityLines = output.filter((row) =>
    /^(?:Uploaded bytes |SHA256 digest of uploaded artifact is |Artifact .*successfully finalized\.|Artifact .*has been successfully uploaded!|Artifact download URL:)/u.test(
      row.text,
    ),
  );
  if (identityLines.length !== required.length) refuse('conflicting upload output');
  return {
    sha256: hash(bytes),
    size: bytes.length,
    lineCount: rows.length,
    uploadGroupLine: start + 1,
    uploadStepNumber: step.number,
    witnesses,
    runnerEnvelopeObserved: true,
    historicalLogCompleteness: 'UNVERIFIED_BEYOND_COMPLETE_HTTP_BODY_AND_RUNNER_ENVELOPE',
  };
}

/** External acquisition and fetch test ports grant no attestation or baseline eligibility. */
export async function collectLegacyK6BaselineUploadAssociation(input) {
  if (arguments.length !== 1) refuse('one closed input required');
  const { acquisition, token, fetchImpl } = closed(input, ['acquisition', 'token', 'fetchImpl']);
  const retained = closed(acquisition, ['receipt', 'responses', 'archiveBytes', 'files']);
  const copied = copyReceipt(retained.receipt),
    receipt = copied.value;
  if (
    receipt.kind !== 'legacy-k6-baseline-acquisition' ||
    receipt.schemaVersion !== '1.0.0' ||
    !isDeepStrictEqual(receipt.repository, baselineRepository) ||
    !Buffer.isBuffer(retained.archiveBytes) ||
    retained.archiveBytes.length > 32 * 1024 * 1024 ||
    retained.archiveBytes.length !== receipt.archive?.size ||
    hash(retained.archiveBytes) !== receipt.archive.sha256 ||
    receipt.artifact?.sha256 !== receipt.archive.sha256 ||
    receipt.artifact.size !== receipt.archive.size
  )
    refuse('retained acquisition bytes mismatch');
  const scenario = receipt.artifact.name?.slice('k6-results-'.length);
  if (
    !['all', 'auth', 'crud', 'upload', 'cascade-delete'].includes(scenario) ||
    receipt.artifact.name !== `k6-results-${scenario}`
  )
    refuse('retained scenario mismatch');
  const roster = (
    scenario === 'all' ? ['auth', 'crud', 'upload', 'cascade-delete'] : [scenario]
  ).flatMap((name) => [`${name}.summary.json`, `${name}.summary.html`]);
  const retainedArchiveBytes = Buffer.from(retained.archiveBytes);
  const archive = inspectBaselineArchive({
    bytes: retainedArchiveBytes,
    sha256: receipt.archive.sha256,
    roster,
  });
  if (
    !isDeepStrictEqual(
      archive.files.map(({ name, size, sha256 }) => ({ name, size, sha256 })),
      receipt.archive.files,
    )
  )
    refuse('retained archive roster mismatch');
  const client = createGithubBaselineTransport(token, fetchImpl),
    responses = [];
  let responseBytes = 0;
  async function capture(name, operation) {
    const response = await operation;
    responseBytes += response.bytes.length;
    if (responses.length >= 440 || responseBytes > 48 * 1024 * 1024) refuse('API evidence bound');
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
  async function population(member, maximum, prefix, operation) {
    let total;
    const rows = [],
      seen = new Set();
    for (let number = 1; ; number++) {
      const value = await capture(`${prefix}-${number}.json`, operation(number));
      if (
        !Number.isSafeInteger(value?.total_count) ||
        value.total_count < 0 ||
        value.total_count > maximum ||
        !Array.isArray(value[member])
      )
        refuse('discovery population bound');
      total ??= value.total_count;
      if (
        total !== value.total_count ||
        value[member].length !== Math.min(100, total - rows.length)
      )
        refuse('partial or changing discovery');
      for (const row of value[member]) {
        if (!Number.isSafeInteger(row?.id) || row.id < 1 || seen.has(row.id))
          refuse('duplicate discovery identity');
        seen.add(row.id);
        rows.push(row);
      }
      if (rows.length === total) return rows;
    }
  }
  const repository = await capture('repository-before.json', client.repository());
  if (
    repository.id !== baselineRepository.id ||
    repository.full_name !== baselineRepository.fullName
  )
    refuse('repository mismatch');
  const workflow = await capture('workflow-before.json', client.workflow());
  if (
    workflow.id !== baselineRepository.workflowId ||
    workflow.path !== baselineRepository.workflowPath ||
    workflow.state !== 'active'
  )
    refuse('workflow mismatch');
  function expectedCurrent(value) {
    const projected = projectBaselineRun(value);
    for (const key of [
      'id',
      'runAttempt',
      'runNumber',
      'headSha',
      'createdAt',
      'branch',
      'event',
      'startedAt',
    ])
      if (projected[key] !== receipt.current[key]) refuse('current cutoff identity drift');
    return projected;
  }
  const current = await capture('current-before.json', client.run(receipt.current.id));
  expectedCurrent(current);
  const runs = await population('workflow_runs', 999, 'runs', (page) => client.runs(page));
  const discovery = selectPriorBaselineRun(current, runs);
  if (!isDeepStrictEqual(discovery.selected, receipt.selected))
    refuse('prior-success selection drift');
  const selected = await capture('selected-before.json', client.run(receipt.selected.id));
  if (!isDeepStrictEqual(projectBaselineRun(selected), receipt.selected))
    refuse('selected identity drift');
  const attempt = await capture(
    'attempt-before.json',
    client.attempt(receipt.selected.id, receipt.selected.runAttempt),
  );
  if (!isDeepStrictEqual(projectBaselineRun(attempt), receipt.selected))
    refuse('attempt identity drift');
  const artifact = projectBaselineArtifact(
    await capture('artifact-before.json', client.artifact(receipt.artifact.id)),
    selected,
    scenario,
    Date.now(),
  );
  if (!isDeepStrictEqual(artifact, receipt.artifact)) refuse('artifact acquisition drift');
  const jobs = (
    await population('jobs', 10000, 'jobs-before', (page) =>
      client.attemptJobs(receipt.selected.id, receipt.selected.runAttempt, page),
    )
  ).map((job) => projectJob(job, receipt.selected));
  const candidates = jobs.filter((job) => job.name === 'k6' && job.conclusion === 'success');
  if (candidates.length !== 1) refuse('successful source job ambiguous');
  const job = candidates[0];
  if (
    !isDeepStrictEqual(
      projectJob(await capture('job-before.json', client.job(job.id)), receipt.selected),
      job,
    )
  )
    refuse('job identity drift');
  const artifactPopulation = await population('artifacts', 10000, 'artifacts-before', (page) =>
    client.artifacts(receipt.selected.id, page),
  );
  const namedArtifacts = artifactPopulation.filter((row) => row.name === artifact.name);
  if (
    namedArtifacts.length !== 1 ||
    !isDeepStrictEqual(
      projectBaselineArtifact(namedArtifacts[0], selected, scenario, Date.now()),
      artifact,
    )
  )
    refuse('artifact population ambiguity');
  const sourceResponse = await client.sourceWorkflow(receipt.selected.headSha);
  await capture('workflow-source-before.json', Promise.resolve(sourceResponse));
  const source = sourceBinding(sourceResponse, receipt.selected, job);
  const log = await client.jobLog(job.id);
  const association = uploadLog(log.bytes, source.binding, job, artifact);
  const logAfter = await client.jobLog(job.id);
  if (logAfter.size !== log.size || logAfter.sha256 !== log.sha256) refuse('job log changed');
  const artifactPopulationAfter = await population('artifacts', 10000, 'artifacts-after', (page) =>
    client.artifacts(receipt.selected.id, page),
  );
  const namedAfter = artifactPopulationAfter.filter((row) => row.name === artifact.name);
  if (
    !isDeepStrictEqual(
      artifactPopulationAfter.map((row) => row.id),
      artifactPopulation.map((row) => row.id),
    ) ||
    namedAfter.length !== 1 ||
    !isDeepStrictEqual(
      projectBaselineArtifact(namedAfter[0], selected, scenario, Date.now()),
      artifact,
    )
  )
    refuse('artifact population drift');
  const afterJobs = (
    await population('jobs', 10000, 'jobs-after', (page) =>
      client.attemptJobs(receipt.selected.id, receipt.selected.runAttempt, page),
    )
  ).map((row) => projectJob(row, receipt.selected));
  if (
    !isDeepStrictEqual(afterJobs, jobs) ||
    !isDeepStrictEqual(
      projectJob(await capture('job-after.json', client.job(job.id)), receipt.selected),
      job,
    )
  )
    refuse('job population drift');
  for (const [name, operation, expected] of [
    ['selected-after', () => client.run(receipt.selected.id), receipt.selected],
    [
      'attempt-after',
      () => client.attempt(receipt.selected.id, receipt.selected.runAttempt),
      receipt.selected,
    ],
  ])
    if (
      !isDeepStrictEqual(projectBaselineRun(await capture(`${name}.json`, operation())), expected)
    )
      refuse('run identity drift');
  expectedCurrent(await capture('current-after.json', client.run(receipt.current.id)));
  if (
    !isDeepStrictEqual(
      projectBaselineArtifact(
        await capture('artifact-after.json', client.artifact(artifact.id)),
        selected,
        scenario,
        Date.now(),
      ),
      artifact,
    )
  )
    refuse('artifact identity drift');
  const sourceAfter = await client.sourceWorkflow(receipt.selected.headSha);
  await capture('workflow-source-after.json', Promise.resolve(sourceAfter));
  if (sourceAfter.sha256 !== sourceResponse.sha256) refuse('immutable source changed');
  const repoAfter = await capture('repository-after.json', client.repository());
  if (repoAfter.id !== repository.id || repoAfter.full_name !== repository.full_name)
    refuse('repository identity drift');
  const workflowAfter = await capture('workflow-after.json', client.workflow());
  if (
    workflowAfter.id !== workflow.id ||
    workflowAfter.path !== workflow.path ||
    workflowAfter.state !== workflow.state
  )
    refuse('workflow identity drift');
  return Object.freeze({
    assessment: Object.freeze({
      schemaVersion: 1,
      kind: 'legacy-k6-upload-log-association',
      capturedAt: new Date().toISOString(),
      repository: baselineRepository,
      retainedReceiptProjectionSha256: copied.sha256,
      selected: receipt.selected,
      currentCutoff: receipt.current,
      artifact,
      archive: { sha256: archive.archiveSha256, size: archive.archiveBytes },
      job,
      sourceWorkflow: source.binding,
      jobLog: association,
      discoveryCount: runs.length,
      attemptJobPopulationCount: jobs.length,
      artifactPopulationCount: artifactPopulation.length,
      logBeforeAfterReconciled: true,
      jobLogAfter: {
        apiEndpoint: logAfter.apiEndpoint,
        sha256: logAfter.sha256,
        size: logAfter.size,
        signedHost: logAfter.signedHost,
      },
      limitedAssociationReconciled: true,
      externalAcquisitionAndTransportPortAttestation: false,
      authenticationCorroboration: 'REQUIRES_INDEPENDENT_LIVE_PRODUCER_VERIFICATION',
      responses: responses.map((row) => ({
        name: row.name,
        endpoint: row.endpoint,
        sha256: row.sha256,
        size: row.size,
      })),
      logDeliveryHost: log.signedHost,
      originalReceiptUnmodified: true,
      originVerified: false,
      attemptVerified: false,
      profileVerified: false,
      sourceBuildVerified: false,
      nativeOriginVerified: false,
      baselineEligible: false,
      firstSeedAllowed: false,
      measurementComplete: false,
      endpointQualificationVerified: false,
      readinessPromoting: false,
    }),
    responses: Object.freeze(responses),
    jobLogBytes: log.bytes,
    jobLogAfterBytes: logAfter.bytes,
    sourceWorkflowBytes: source.bytes,
  });
}
