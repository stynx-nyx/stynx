// Pure publication decisions shared by the release preflight and its sensors.
import { registryVersionPolicyConstants } from './registry-version-policy.mjs';

export const publicationPlanConstants = Object.freeze({
  packageCount: registryVersionPolicyConstants.packageCount,
  canaryPackage: '@stynx-nyx/angular',
  maxVisibilityRereads: 5,
  visibilityRereadDelayMs: 2_000,
});

export class PublicationDistTagError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'PublicationDistTagError';
    this.code = code;
  }
}

/** @param {string} code @param {string} message @returns {never} */
function fail(code, message) {
  throw new PublicationDistTagError(code, message);
}

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const rcVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-rc\.(0|[1-9]\d*)$/u;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value */
function checkedDistTags(value) {
  if (
    !isRecord(value) ||
    Object.keys(value).length === 0 ||
    Object.entries(value).some(([tag, version]) => !tag || typeof version !== 'string' || !version)
  ) {
    fail('PUBLICATION_DIST_TAG_UNKNOWN', 'registry dist-tags are absent or malformed');
  }
  return value;
}

/** @param {unknown} packages @param {string} version */
export function validatePublicationRoster(packages, version) {
  if (
    !isUnknownArray(packages) ||
    packages.length !== publicationPlanConstants.packageCount ||
    optionalJsonProperty(packages[0], 'name') !== publicationPlanConstants.canaryPackage ||
    new Set(packages.map((entry) => optionalJsonProperty(entry, 'name'))).size !== packages.length
  ) {
    fail(
      'PUBLICATION_ROSTER_DRIFT',
      'publication roster is incomplete, duplicated, or does not start with the angular canary',
    );
  }
  for (const entry of packages) {
    if (optionalJsonProperty(optionalJsonProperty(entry, 'manifest'), 'version') !== version) {
      fail(
        'PUBLICATION_VERSION_DRIFT',
        `${optionalJsonProperty(entry, 'name') ?? 'unknown package'}: expected exact ${version}`,
      );
    }
  }
}

/** @param {{version: string, preState?: unknown}} input */
export function selectPublicationDistTag({ version, preState }) {
  if (rcVersion.test(version)) {
    if (!isRecord(preState) || preState.mode !== 'pre' || preState.tag !== 'rc') {
      fail(
        'PUBLICATION_DIST_TAG_INVALID',
        'an RC candidate requires committed pre mode with the rc tag',
      );
    }
    return 'rc';
  }
  if (stableVersion.test(version) && (preState === null || preState === undefined)) return 'latest';
  fail(
    'PUBLICATION_DIST_TAG_INVALID',
    'version and Changesets pre state do not select an approved dist-tag',
  );
}

/** @param {{tarball: string, registry: string, tag: string, version: string}} input */
export function buildNpmPublishArgs({ tarball, registry, tag, version }) {
  if (
    typeof tarball !== 'string' ||
    !tarball ||
    typeof registry !== 'string' ||
    !registry ||
    !(
      (rcVersion.test(version) && tag === 'rc') ||
      (stableVersion.test(version) && tag === 'latest')
    )
  ) {
    fail(
      'PUBLICATION_DIST_TAG_INVALID',
      'npm publish arguments do not match the candidate dist-tag',
    );
  }
  return ['publish', tarball, '--registry', registry, '--tag', tag, '--access', 'restricted'];
}

/** @param {{preflightLatest: string, preflightRc?: string, distTags: unknown}} input */
export function validatePreflightDistTags({ preflightLatest, preflightRc, distTags }) {
  const snapshot = checkedDistTags(distTags);
  if (typeof snapshot.latest !== 'string') {
    fail('PUBLICATION_DIST_TAG_UNKNOWN', 'registry latest dist-tag is absent');
  }
  if (snapshot.latest !== preflightLatest) {
    fail('PUBLICATION_DIST_TAG_DRIFT', 'registry latest dist-tag differs from the policy baseline');
  }
  if (preflightRc !== undefined) {
    if (typeof snapshot.rc !== 'string') {
      fail('PUBLICATION_DIST_TAG_UNKNOWN', 'registry rc dist-tag is absent');
    }
    if (snapshot.rc !== preflightRc) {
      fail(
        'PUBLICATION_DIST_TAG_DRIFT',
        'registry rc dist-tag differs from the previous candidate',
      );
    }
  }
  return { ...snapshot };
}

/** @param {{candidate: string, preflightLatest: string, preflightDistTags: unknown, distTags: unknown, firstPublication?: boolean}} input */
export function verifyPostPublishDistTags({
  candidate,
  preflightLatest,
  preflightDistTags,
  distTags,
  firstPublication = false,
}) {
  // An approved first publication has no registry dist-tags before it publishes.
  const before = firstPublication
    ? checkedFirstPublicationPreflight(preflightDistTags)
    : validatePreflightDistTags({ preflightLatest, distTags: preflightDistTags });
  const after = checkedDistTags(distTags);
  const mutableTag = rcVersion.test(candidate)
    ? 'rc'
    : stableVersion.test(candidate)
      ? 'latest'
      : null;
  if (!mutableTag) fail('PUBLICATION_DIST_TAG_INVALID', 'candidate version is unsupported');
  for (const [tag, value] of Object.entries(before)) {
    if (tag !== mutableTag && after[tag] !== value) {
      fail('PUBLICATION_DIST_TAG_DRIFT', `registry dist-tag ${tag} changed during publication`);
    }
  }
  for (const tag of Object.keys(after)) {
    if (tag !== mutableTag && !Object.hasOwn(before, tag)) {
      fail(
        'PUBLICATION_DIST_TAG_DRIFT',
        `unexpected registry dist-tag ${tag} appeared during publication`,
      );
    }
  }
  if (after[mutableTag] !== candidate) {
    if (after[mutableTag] !== undefined && after[mutableTag] !== before[mutableTag]) {
      fail(
        'PUBLICATION_DIST_TAG_DRIFT',
        `registry dist-tag ${mutableTag} points to an unexpected version`,
      );
    }
    fail(
      'PUBLICATION_DIST_TAG_UNKNOWN',
      `the candidate is not yet visible under the ${mutableTag} dist-tag`,
    );
  }
}

/** @param {unknown} value */
function checkedFirstPublicationPreflight(value) {
  if (!isRecord(value) || Object.keys(value).length !== 0) {
    fail(
      'PUBLICATION_DIST_TAG_DRIFT',
      'an approved first publication had registry dist-tags before publication',
    );
  }
  return value;
}

/** @param {{preState?: unknown, changesetIds: unknown}} input */
export function assertNoPendingPreChangesets({ preState, changesetIds }) {
  if (
    !isUnknownArray(changesetIds) ||
    changesetIds.some(
      (id) => typeof id !== 'string' || !id || id.includes('/') || id.includes('..'),
    ) ||
    new Set(changesetIds).size !== changesetIds.length
  ) {
    fail('PUBLICATION_DIST_TAG_INVALID', 'changeset IDs are malformed');
  }
  if (preState === null || preState === undefined) {
    if (changesetIds.length > 0)
      fail('PUBLICATION_DIST_TAG_INVALID', 'stable publication has pending changesets');
    return;
  }
  if (
    !isRecord(preState) ||
    preState.mode !== 'pre' ||
    preState.tag !== 'rc' ||
    !isUnknownArray(preState.changesets) ||
    preState.changesets.some((id) => typeof id !== 'string') ||
    new Set(preState.changesets).size !== preState.changesets.length ||
    changesetIds.length !== preState.changesets.length ||
    changesetIds.some((id) => !preChangesets(preState).includes(id))
  ) {
    fail('PUBLICATION_DIST_TAG_INVALID', 'prerelease changesets are pending or missing');
  }
}

/**
 * Preserve native property reads of opaque JSON, including primitive boxing.
 * Nullish wording follows the pinned Node runtime at the original read position.
 * @param {unknown} value
 * @param {string} key
 * @returns {unknown}
 */
function jsonProperty(value, key) {
  if (value === null) throw new TypeError(`Cannot read properties of null (reading '${key}')`);
  if (value === undefined)
    throw new TypeError(`Cannot read properties of undefined (reading '${key}')`);
  return Reflect.get(jsonObject(value), key, value);
}

/** @param {unknown} value @param {string} key @returns {unknown} */
function optionalJsonProperty(value, key) {
  return value === null || value === undefined ? undefined : jsonProperty(value, key);
}

/** @param {unknown} value */
function jsonObject(value) {
  /** @type {unknown} */
  const boxed = Object(value);
  if ((typeof boxed !== 'object' || boxed === null) && typeof boxed !== 'function') {
    throw new TypeError('native Object boxing returned a non-object');
  }
  return boxed;
}

/** @param {unknown} value @returns {value is unknown[]} */
function isUnknownArray(value) {
  return Array.isArray(value);
}

/**
 * These reads follow the existing Array.isArray guard of the same fresh JSON
 * field. The descriptor is neither mutated nor exposed to a writer between them.
 * @param {unknown} state
 * @returns {unknown[]}
 */
function preChangesets(state) {
  const changesets = jsonProperty(state, 'changesets');
  if (!Array.isArray(changesets))
    throw new TypeError('guarded pre-state changesets ceased to be an array');
  return changesets;
}
