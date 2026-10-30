import { serializeHttpRuntimePlainJson } from './http-runtime-protocol.mjs';

// Source implementation of manifest.existingProfiles, not execution authority.
// The actual parent must separately match the complete source-bound manifest,
// live build, fixture, official executable, task and baseline before effects.
/** @type {Readonly<Record<'auth' | 'crud' | 'upload' | 'cascade-delete', {local: [number, number, number, number], hardening: [number, number, number, number]}>>} */
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

/** @returns {never} */
function refuse() {
  const error = new Error('Original HTTP scenario accepts only its fixed scenario and profile');
  error.code = 'HTTP_ORIGINAL_SCENARIO_INVALID';
  throw error;
}

/** @param {unknown} value @returns {value is 'auth' | 'crud' | 'upload' | 'cascade-delete'} */
function isScenario(value) {
  return typeof value === 'string' && ['auth', 'crud', 'upload', 'cascade-delete'].includes(value);
}

/** @param {unknown} value @returns {value is 'local' | 'hardening'} */
function isProfile(value) {
  return typeof value === 'string' && ['local', 'hardening'].includes(value);
}

/**
 * @param {unknown} value
 * @returns {value is {scenarioId: 'auth' | 'crud' | 'upload' | 'cascade-delete', profileId: 'local' | 'hardening'}}
 */
function isSelection(value) {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    'scenarioId' in value &&
    'profileId' in value &&
    isScenario(value.scenarioId) &&
    isProfile(value.profileId)
  );
}

/** @param {unknown} input */
export function parseHttpOriginalScenarioSelector(input) {
  if (arguments.length !== 1) refuse();
  /** @type {unknown} */
  let selector;
  try {
    selector = JSON.parse(serializeHttpRuntimePlainJson(input));
  } catch {
    refuse();
  }
  if (
    !selector ||
    Array.isArray(selector) ||
    typeof selector !== 'object' ||
    Object.keys(selector).sort().join(',') !== 'profileId,scenarioId' ||
    !isSelection(selector)
  )
    refuse();
  return selector;
}

/** Closed declaration data only; no environment, paths, command or callbacks.
 * @param {unknown} input
 */
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
