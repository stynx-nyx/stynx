// Validate projected GitHub metadata. Authentication and complete pagination are external.
import { types } from 'node:util';

export const baselineRepository = Object.freeze({
  id: 1221320856,
  fullName: 'stynx-nyx/stynx',
  workflowId: 266480675,
  workflowPath: '.github/workflows/hardening.yml',
});
const refuse = (message) => {
  throw new Error(`BASELINE_IDENTITY_REFUSED: ${message}`);
};
function own(value, key) {
  if (
    !value ||
    typeof value !== 'object' ||
    types.isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    refuse('metadata must be plain own data');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) refuse(`missing own data ${key}`);
  return descriptor.value;
}
function positive(value) {
  if (!Number.isSafeInteger(value) || value < 1) refuse('invalid numeric identity');
  return value;
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value))
    refuse('invalid timestamp');
  const result = Date.parse(value);
  if (!Number.isFinite(result) || new Date(result).toISOString() !== value.replace('Z', '.000Z'))
    refuse('invalid calendar timestamp');
  return result;
}
function sha(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/u.test(value)) refuse('invalid commit SHA');
  return value;
}
function repository(value) {
  if (
    own(value, 'id') !== baselineRepository.id ||
    own(value, 'full_name') !== baselineRepository.fullName
  )
    refuse('repository identity mismatch');
}
function dense(values) {
  if (
    types.isProxy(values) ||
    !Array.isArray(values) ||
    Object.getPrototypeOf(values) !== Array.prototype
  )
    refuse('invalid population');
  const properties = Object.getOwnPropertyDescriptors(values);
  const length = properties.length?.value;
  if (
    !Number.isSafeInteger(length) ||
    length > 10_000 ||
    Reflect.ownKeys(properties).length !== length + 1
  )
    refuse('population is not closed and bounded');
  return Array.from({ length }, (_, index) => {
    const property = properties[index];
    if (!property || !Object.hasOwn(property, 'value')) refuse('population must be dense own data');
    return property.value;
  });
}
export function projectBaselineRun(run) {
  repository(own(run, 'repository'));
  repository(own(run, 'head_repository'));
  if (
    own(run, 'workflow_id') !== baselineRepository.workflowId ||
    own(run, 'path') !== baselineRepository.workflowPath
  )
    refuse('workflow identity mismatch');
  const createdAt = own(run, 'created_at');
  const updatedAt = own(run, 'updated_at');
  const startedAt = own(run, 'run_started_at');
  const created = timestamp(createdAt);
  const updated = timestamp(updatedAt);
  const started = startedAt === null ? null : timestamp(startedAt);
  if (updated < created || (started !== null && (started < created || updated < started)))
    refuse('run chronology mismatch');
  const branch = own(run, 'head_branch');
  const status = own(run, 'status');
  const conclusion = own(run, 'conclusion');
  const event = own(run, 'event');
  if (
    typeof branch !== 'string' ||
    branch.length < 1 ||
    branch.length > 255 ||
    typeof event !== 'string' ||
    event.length < 1 ||
    event.length > 80 ||
    !['queued', 'in_progress', 'completed', 'waiting', 'requested', 'pending'].includes(status) ||
    !(
      conclusion === null ||
      [
        'success',
        'failure',
        'neutral',
        'cancelled',
        'skipped',
        'timed_out',
        'action_required',
        'stale',
        'startup_failure',
      ].includes(conclusion)
    ) ||
    (status === 'completed') !== (conclusion !== null) ||
    (started === null && ['in_progress', 'completed'].includes(status))
  )
    refuse('invalid run state');
  return Object.freeze({
    id: positive(own(run, 'id')),
    runAttempt: positive(own(run, 'run_attempt')),
    runNumber: positive(own(run, 'run_number')),
    headSha: sha(own(run, 'head_sha')),
    branch,
    event,
    status,
    conclusion,
    createdAt,
    updatedAt,
    startedAt,
  });
}

/** Select the latest eligible prior successful main run, independent of artifact availability. */
export function selectPriorBaselineRun(currentRun, runs) {
  const current = projectBaselineRun(currentRun);
  const population = dense(runs).map(projectBaselineRun);
  const ids = new Set();
  for (const run of population) {
    if (ids.has(run.id)) refuse('duplicate workflow run');
    ids.add(run.id);
    if (run.branch !== 'main') refuse('discovery population contains non-main run');
  }
  const cutoff = timestamp(current.createdAt);
  for (const run of population) {
    if (
      run.id !== current.id &&
      timestamp(run.createdAt) <= cutoff &&
      run.runAttempt > 1 &&
      timestamp(run.updatedAt) > cutoff
    )
      refuse('historical rerun state at cutoff is unknown');
    if (
      run.id !== current.id &&
      timestamp(run.createdAt) <= cutoff &&
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      timestamp(run.updatedAt) === cutoff
    )
      refuse('same-second completion order at cutoff is unknown');
  }
  const eligible = population.filter(
    (run) =>
      run.id !== current.id &&
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      timestamp(run.createdAt) < cutoff &&
      timestamp(run.updatedAt) < cutoff,
  );
  eligible.sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt) || b.id - a.id);
  // Empty discovery is not a proof of no history (deletion, truncation and API errors remain possible).
  return Object.freeze({
    current,
    selected: eligible[0] ?? null,
    examined: population.length,
    firstSeedAllowed: false,
    originVerified: false,
  });
}

export function projectBaselineArtifact(artifact, selectedRun, scenario, now) {
  const scenarios = ['auth', 'crud', 'upload', 'cascade-delete', 'all'];
  if (!scenarios.includes(scenario) || !Number.isSafeInteger(now) || now < 0)
    refuse('invalid artifact inputs');
  const selected = projectBaselineRun(selectedRun);
  if (
    selected.branch !== 'main' ||
    selected.status !== 'completed' ||
    selected.conclusion !== 'success'
  )
    refuse('artifact run is not a successful main run');
  const workflow = own(artifact, 'workflow_run');
  if (
    own(workflow, 'id') !== selected.id ||
    own(workflow, 'repository_id') !== baselineRepository.id ||
    own(workflow, 'head_repository_id') !== baselineRepository.id ||
    own(workflow, 'head_branch') !== 'main' ||
    own(workflow, 'head_sha') !== selected.headSha
  )
    refuse('artifact run/repository/commit mismatch');
  const name = own(artifact, 'name');
  if (name !== `k6-results-${scenario}` || own(artifact, 'expired') !== false)
    refuse('missing or expired required artifact');
  const digest = own(artifact, 'digest');
  if (typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(digest))
    refuse('artifact digest required');
  const size = positive(own(artifact, 'size_in_bytes'));
  if (size > 32 * 1024 * 1024) refuse('artifact size limit');
  const createdAt = own(artifact, 'created_at');
  const updatedAt = own(artifact, 'updated_at');
  const expiresAt = own(artifact, 'expires_at');
  const created = timestamp(createdAt);
  const updated = timestamp(updatedAt);
  const expires = timestamp(expiresAt);
  if (
    created < timestamp(selected.startedAt) ||
    updated < created ||
    updated > timestamp(selected.updatedAt) ||
    updated > now ||
    timestamp(selected.updatedAt) > now ||
    expires <= now ||
    expires <= updated
  )
    refuse('artifact chronology or expiry mismatch');
  return Object.freeze({
    id: positive(own(artifact, 'id')),
    name,
    size,
    sha256: digest.slice(7),
    createdAt,
    updatedAt,
    expiresAt,
    runId: selected.id,
    runAttempt: selected.runAttempt,
    headSha: selected.headSha,
    originVerified: false,
    attemptVerified: false,
  });
}
