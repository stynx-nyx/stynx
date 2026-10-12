import { serializeHttpRuntimePlainJson } from './http-runtime-protocol.mjs';

// Source implementation of manifest.existingProfiles, not execution authority.
// The actual parent must separately match the complete source-bound manifest,
// live build, fixture, official executable, task and baseline before effects.
const profiles = Object.freeze({
  auth: { local: [100, 300, 20, 200], hardening: [10, 300, 4, 25] },
  crud: { local: [10, 600, 2, 20], hardening: [4, 600, 4, 25] },
  upload: { local: [50, 300, 10, 100], hardening: [5, 300, 4, 25] },
  'cascade-delete': { local: [25, 300, 10, 100], hardening: [2, 300, 4, 25] },
});
const metrics = Object.freeze({
  auth: ['auth_verify_duration_ms'],
  crud: ['data_tx_overhead_ms', 'ratelimit_overhead_ms', 'idempotency_lookup_ms'],
  upload: ['storage_presign_duration_ms'],
  'cascade-delete': ['data_tx_overhead_ms'],
});

function refuse() {
  const error = new Error('Original HTTP scenario accepts only its fixed scenario and profile');
  error.code = 'HTTP_ORIGINAL_SCENARIO_INVALID';
  throw error;
}

export function parseHttpOriginalScenarioSelector(input) {
  if (arguments.length !== 1) refuse();
  let selector;
  try {
    selector = JSON.parse(serializeHttpRuntimePlainJson(input));
  } catch {
    refuse();
  }
  if (
    !selector ||
    Array.isArray(selector) ||
    Object.keys(selector).sort().join(',') !== 'profileId,scenarioId' ||
    !['auth', 'crud', 'upload', 'cascade-delete'].includes(selector.scenarioId) ||
    !['local', 'hardening'].includes(selector.profileId)
  )
    refuse();
  return selector;
}

/** Closed declaration data only; no environment, paths, command or callbacks. */
export function httpOriginalScenarioProfile(input) {
  if (arguments.length !== 1) refuse();
  const { scenarioId, profileId } = parseHttpOriginalScenarioSelector(input);
  const [rate, durationSeconds, preAllocatedVUs, maxVUs] = profiles[scenarioId][profileId];
  return {
    scenarioId,
    profileId,
    nominalProfile: { rate, durationSeconds, preAllocatedVUs, maxVUs },
    requiredMetrics: [...metrics[scenarioId]],
    workerDeadlineSeconds: durationSeconds + 300,
    fixtureInclusiveDeadlineSeconds: durationSeconds + 420,
    officialGeneratorRequired: true,
    derivativeSelectionAllowed: false,
    runtimeAdmission: false,
    performanceQualified: false,
    readinessPromoting: false,
  };
}
