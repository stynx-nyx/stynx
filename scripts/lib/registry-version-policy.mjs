import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Native fetch supplies these fields; injected failure responses may omit fields
 * never reached by their HTTP branch. A JSON method may return a value or promise.
 * @typedef {(input: string, init: RequestInit) => Promise<Pick<Response, 'status'> & Partial<Pick<Response, 'ok'>> & {json?: () => unknown}>} RegistryFetch
 */

export const registryVersionPolicyConstants = Object.freeze({
  anomalyPolicyPath: 'law/policy/registry-version-anomalies.json',
  anomalyPolicySha256: 'dc6fbbd33f153b20e470d254f33a9c46aaa6d485743b19c4938c49659aac3ca9',
  candidate: '3.0.0',
  previousCandidate: '1.5.0-rc.2',
  preflightLatestVersion: '1.6.2',
  canonicalMajor: 3,
  packageCount: 47,
  approvedFirstPublications: Object.freeze([
    '@stynx-nyx/eslint-config',
    '@stynx-nyx/migration-linter',
    '@stynx-nyx/tsconfig',
  ]),
  registryUrl: 'https://npm.pkg.github.com',
});

export class RegistryVersionPolicyError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'RegistryVersionPolicyError';
    this.code = code;
  }
}

/** @param {string} code @param {string} message @returns {never} */
function fail(code, message) {
  throw new RegistryVersionPolicyError(code, message);
}

/** @param {string} repoRoot @param {string} candidate */
export function loadRegistryAnomalyPolicy(repoRoot, candidate) {
  const policyPath = resolve(repoRoot, registryVersionPolicyConstants.anomalyPolicyPath);
  let bytes;
  try {
    bytes = readFileSync(policyPath);
  } catch {
    fail('REGISTRY_ANOMALY_POLICY_MISSING', 'the Architect-owned anomaly policy is unavailable');
  }

  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== registryVersionPolicyConstants.anomalyPolicySha256) {
    fail(
      'REGISTRY_ANOMALY_POLICY_MODIFIED',
      'the Architect-owned anomaly policy does not match its approved digest',
    );
  }

  /** @type {unknown} */
  let policy;
  try {
    policy = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('REGISTRY_ANOMALY_POLICY_MALFORMED', 'the Architect-owned anomaly policy is not JSON');
  }

  const anomalies = jsonProperty(policy, 'anomalies');
  if (
    jsonProperty(policy, 'schemaVersion') !== '1.0.0' ||
    jsonProperty(policy, 'policy_id') !== 'stynx.registry-version-anomalies' ||
    jsonProperty(policy, 'canonical_line') !==
      `${registryVersionPolicyConstants.canonicalMajor}.x` ||
    jsonProperty(policy, 'next_unified_version') !== registryVersionPolicyConstants.candidate ||
    jsonProperty(policy, 'preflight_latest_version') !==
      registryVersionPolicyConstants.preflightLatestVersion ||
    candidate !== jsonProperty(policy, 'next_unified_version') ||
    !isUnknownArray(anomalies) ||
    anomalies.length !== 1
  ) {
    fail(
      'REGISTRY_ANOMALY_POLICY_UNSUPPORTED',
      'the anomaly policy is broader than, expired for, or unmatched to the exact candidate',
    );
  }

  const [anomaly] = anomalies;
  if (
    jsonProperty(anomaly, 'anomaly_id') !== 'REGISTRY-VERSION-ANOMALY-0001' ||
    jsonProperty(anomaly, 'package') !== '@stynx-nyx/angular-profile' ||
    jsonProperty(anomaly, 'version') !== '2.0.0' ||
    jsonProperty(anomaly, 'github_package_version_id') !== 1024692931 ||
    jsonProperty(anomaly, 'classification') !== 'erroneous-semver-publication' ||
    jsonProperty(anomaly, 'allowed_candidate') !== candidate ||
    JSON.stringify(jsonProperty(anomaly, 'allowed_effects')) !==
      JSON.stringify(['noncanonical-history-census']) ||
    jsonProperty(anomaly, 'applies_to_other_packages') !== false ||
    jsonProperty(anomaly, 'applies_to_other_versions') !== false
  ) {
    fail(
      'REGISTRY_ANOMALY_POLICY_UNSUPPORTED',
      'the anomaly policy does not describe the one exact Architect-approved exception',
    );
  }

  return anomaly;
}

/**
 * Package names come from the validated workspace roster; observation and policy
 * values retain their native JSON representations until the existing checks.
 * @param {{packageNames: string[], registryStatesByPackage?: Map<string, unknown>, metadataByPackage?: Map<string, unknown>, githubPackagesInventory?: unknown, candidate: string, anomaly?: unknown, anomalyPolicy?: unknown, campaignPolicy?: unknown}} input
 */
export function validateRegistryCensus({
  packageNames,
  registryStatesByPackage,
  metadataByPackage,
  githubPackagesInventory,
  candidate,
  anomaly,
  anomalyPolicy,
  campaignPolicy,
}) {
  if (candidate !== registryVersionPolicyConstants.candidate) {
    fail(
      'REGISTRY_CANDIDATE_UNSUPPORTED',
      `only the Architect-approved ${registryVersionPolicyConstants.candidate} candidate is valid`,
    );
  }
  if (
    packageNames.length !== registryVersionPolicyConstants.packageCount ||
    new Set(packageNames).size !== packageNames.length
  ) {
    fail(
      'REGISTRY_ROSTER_DRIFT',
      `registry validation requires exactly ${registryVersionPolicyConstants.packageCount} unique packages`,
    );
  }
  const states =
    registryStatesByPackage ??
    (metadataByPackage instanceof Map
      ? new Map(
          [...metadataByPackage].map(([name, metadata]) => [
            name,
            { authenticated: true, status: 200, metadata },
          ]),
        )
      : undefined);
  if (!(states instanceof Map) || states.size !== packageNames.length) {
    fail('REGISTRY_CENSUS_INCOMPLETE', 'registry metadata is incomplete for the package roster');
  }

  const policy = campaignPolicy;
  if (policy) validateCampaignPolicy(policy, packageNames, candidate);
  const approvedAbsent = new Set(
    validatedPolicyArray(optionalJsonProperty(policy, 'approved_first_publications') ?? []),
  );
  const expectedPublished = packageNames.filter((name) => !approvedAbsent.has(name));
  validateInventory(githubPackagesInventory, expectedPublished);

  let anomalyMatches = 0;
  let absentPackageCount = 0;
  let publishedPackageCount = 0;
  for (const packageName of packageNames) {
    if (!states.has(packageName)) {
      fail('REGISTRY_CENSUS_INCOMPLETE', `registry metadata is missing for ${packageName}`);
    }
    const state = states.get(packageName);
    if (!isRecord(state) || state.authenticated !== true) {
      fail('REGISTRY_AUTH_MISSING', `${packageName}: registry observation is not authenticated`);
    }
    if (state.status === 404) {
      if (!approvedAbsent.has(packageName)) {
        fail('REGISTRY_UNAPPROVED_ABSENCE', `${packageName}: absence is not approved`);
      }
      absentPackageCount += 1;
      continue;
    }
    if (state.status !== 200) {
      fail(
        'REGISTRY_REQUEST_FAILED',
        `${packageName}: unsupported registry status ${state.status}`,
      );
    }
    const packageAnomalyMatches = validatePackageMetadata(
      packageName,
      state.metadata,
      candidate,
      anomaly ?? exactAnomalyFromPolicy(anomalyPolicy, candidate),
    );
    if (approvedAbsent.has(packageName)) {
      fail(
        'REGISTRY_FIRST_PUBLICATION_PRESENT',
        `${packageName}: approved first publication already exists`,
      );
    }
    publishedPackageCount += 1;
    anomalyMatches += packageAnomalyMatches;
  }

  for (const packageName of states.keys()) {
    if (!packageNames.includes(packageName)) {
      fail('REGISTRY_ROSTER_DRIFT', `registry metadata contains unexpected package ${packageName}`);
    }
  }
  if (anomalyMatches !== 1) {
    fail(
      'REGISTRY_ANOMALY_UNMATCHED',
      'the approved angular-profile 2.0.0 anomaly must occur exactly once in registry history',
    );
  }

  return {
    anomalyMatches,
    absentPackageCount,
    packageCount: packageNames.length,
    publishedPackageCount,
  };
}

/** @param {unknown} policy @param {string[]} packageNames @param {string} candidate */
function validateCampaignPolicy(policy, packageNames, candidate) {
  const approved = optionalJsonProperty(policy, 'approved_first_publications');
  // ADR-RELEASE-0006: the three tool packages joining the fixed group at 3.0.0
  // are the only approved absences; every other package has registry history.
  const expected = [...registryVersionPolicyConstants.approvedFirstPublications];
  if (
    optionalJsonProperty(optionalJsonProperty(policy, 'candidate'), 'version') !== candidate ||
    !isUnknownArray(approved) ||
    JSON.stringify([...approved].sort()) !== JSON.stringify(expected) ||
    JSON.stringify(
      [...jsonIterable(jsonProperty(policy, 'publishable_packages') ?? [], 'campaign')].sort(),
    ) !== JSON.stringify([...packageNames].sort())
  ) {
    fail(
      'REGISTRY_FIRST_PUBLICATION_POLICY_UNSUPPORTED',
      'the first-publication policy does not match the exact 47/44/3 roster',
    );
  }
}

/** @param {unknown} policy @param {string} candidate */
function exactAnomalyFromPolicy(policy, candidate) {
  const [anomaly] = jsonIterable(optionalJsonProperty(policy, 'anomalies') ?? [], 'anomaly');
  if (
    !anomaly ||
    jsonProperty(jsonProperty(policy, 'anomalies'), 'length') !== 1 ||
    jsonProperty(anomaly, 'package') !== '@stynx-nyx/angular-profile' ||
    jsonProperty(anomaly, 'version') !== '2.0.0' ||
    jsonProperty(anomaly, 'allowed_candidate') !== candidate ||
    jsonProperty(anomaly, 'applies_to_other_packages') !== false ||
    jsonProperty(anomaly, 'applies_to_other_versions') !== false
  ) {
    fail(
      'REGISTRY_ANOMALY_POLICY_UNSUPPORTED',
      'the anomaly policy is not the exact approved exception',
    );
  }
  return anomaly;
}

/** @param {unknown} inventory @param {string[]} expectedPublished */
function validateInventory(inventory, expectedPublished) {
  if (inventory === undefined) return;
  if (!isRecord(inventory) || inventory.authenticated !== true) {
    fail('REGISTRY_AUTH_MISSING', 'GitHub package inventory is not authenticated');
  }
  if (inventory.complete !== true || !isUnknownArray(inventory.packageNames)) {
    fail('REGISTRY_INVENTORY_INCOMPLETE', 'GitHub package inventory is incomplete');
  }
  if (
    JSON.stringify([...inventory.packageNames].sort()) !==
    JSON.stringify([...expectedPublished].sort())
  ) {
    fail(
      'REGISTRY_INVENTORY_DISAGREEMENT',
      'GitHub package inventory disagrees with registry census',
    );
  }
}

/** @param {string} packageName @param {unknown} metadata @param {string} candidate @param {unknown} anomaly */
function validatePackageMetadata(packageName, metadata, candidate, anomaly) {
  if (!isRecord(metadata) || metadata.name !== packageName) {
    fail('REGISTRY_METADATA_MALFORMED', `${packageName}: registry package identity is malformed`);
  }
  if (!isRecord(metadata.versions) || Object.keys(metadata.versions).length === 0) {
    fail('REGISTRY_METADATA_MALFORMED', `${packageName}: versions metadata is absent or empty`);
  }
  if (!isRecord(metadata['dist-tags'])) {
    fail('REGISTRY_METADATA_MALFORMED', `${packageName}: dist-tags metadata is absent`);
  }
  const latest = metadata['dist-tags'].latest;
  if (typeof latest !== 'string' || !Object.hasOwn(metadata.versions, latest)) {
    fail('REGISTRY_METADATA_MALFORMED', `${packageName}: latest does not identify a known version`);
  }

  const candidateVersion = parseSemver(candidate, 'candidate');
  let anomalyMatches = 0;
  for (const [version, manifest] of Object.entries(metadata.versions)) {
    const parsed = parseSemver(version, `${packageName}@${version}`);
    if (!isRecord(manifest) || manifest.name !== packageName || manifest.version !== version) {
      fail(
        'REGISTRY_METADATA_MALFORMED',
        `${packageName}@${version}: version manifest identity is malformed`,
      );
    }
    if (version === candidate) {
      fail('REGISTRY_CANDIDATE_EXISTS', `${packageName}@${candidate} already exists`);
    }

    const comparison = compareSemver(parsed, candidateVersion);
    // The 2.0.0 anomaly sits below the 3.x line; the census still observes it once.
    if (
      packageName === jsonProperty(anomaly, 'package') &&
      version === jsonProperty(anomaly, 'version') &&
      jsonProperty(anomaly, 'allowed_candidate') === candidate
    ) {
      anomalyMatches += 1;
      if (comparison < 0) continue;
      fail(
        'REGISTRY_UNADJUDICATED_VERSION',
        `${packageName}@${version} is not below candidate ${candidate}`,
      );
    }
    // ADR-RELEASE-0006: the skipped 2.x line holds only the one recorded anomaly.
    if (parsed.major > 1 && parsed.major < registryVersionPolicyConstants.canonicalMajor) {
      fail(
        'REGISTRY_UNADJUDICATED_VERSION',
        `${packageName}@${version} is on a skipped major line and has no exact exception`,
      );
    }
    if (parsed.major === registryVersionPolicyConstants.canonicalMajor && comparison >= 0) {
      fail(
        'REGISTRY_CANONICAL_LINE_NOT_MONOTONIC',
        `${packageName}@${version} is not below canonical candidate ${candidate}`,
      );
    }
    if (comparison >= 0) {
      fail(
        'REGISTRY_UNADJUDICATED_VERSION',
        `${packageName}@${version} is not below candidate ${candidate} and has no exact exception`,
      );
    }
  }

  if (!Object.hasOwn(metadata.versions, registryVersionPolicyConstants.previousCandidate)) {
    fail(
      'REGISTRY_PREVIOUS_CANDIDATE_MISSING',
      `${packageName}: previous candidate ${registryVersionPolicyConstants.previousCandidate} is absent from registry history`,
    );
  }

  return anomalyMatches;
}

/** @param {{packageNames: string[], token: unknown, fetchImpl?: RegistryFetch}} input */
export async function fetchRegistryCensus({ packageNames, token, fetchImpl = fetch }) {
  if (typeof token !== 'string' || token.trim() === '') {
    fail('REGISTRY_AUTH_MISSING', 'authenticated registry validation requires a protected token');
  }

  /** @type {Map<string, {authenticated: true, status: number, metadata?: unknown}>} */
  const metadataByPackage = new Map();
  for (const packageName of packageNames) {
    const encodedName = encodeURIComponent(packageName);
    let response;
    try {
      response = await fetchImpl(`${registryVersionPolicyConstants.registryUrl}/${encodedName}`, {
        headers: {
          accept: 'application/vnd.npm.install-v1+json',
          authorization: `Bearer ${token}`,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      fail('REGISTRY_REQUEST_FAILED', `${packageName}: registry request did not complete`);
    }
    if (response.status === 404) {
      metadataByPackage.set(packageName, { authenticated: true, status: 404 });
      continue;
    }
    if (!response.ok) {
      const kind = response.status === 401 || response.status === 403 ? 'authentication' : 'HTTP';
      fail(
        'REGISTRY_REQUEST_FAILED',
        `${packageName}: registry ${kind} failure (${response.status})`,
      );
    }

    /** @type {unknown} */
    let metadata;
    try {
      const json = response.json;
      if (typeof json !== 'function') throw new TypeError('response.json is not a function');
      metadata = await Reflect.apply(json, response, []);
    } catch {
      fail('REGISTRY_METADATA_MALFORMED', `${packageName}: registry response is not JSON`);
    }
    metadataByPackage.set(packageName, { authenticated: true, status: 200, metadata });
  }
  return metadataByPackage;
}

/** @param {{packageNames: string[], token: unknown, organization?: string, fetchImpl?: RegistryFetch}} input */
export async function fetchGithubPackagesInventory({
  packageNames,
  token,
  organization = 'stynx-nyx',
  fetchImpl = fetch,
}) {
  if (typeof token !== 'string' || token.trim() === '') {
    fail(
      'REGISTRY_AUTH_MISSING',
      'authenticated GitHub package inventory requires a protected token',
    );
  }
  const observed = [];
  for (let page = 1; ; page += 1) {
    let response;
    try {
      response = await fetchImpl(
        `https://api.github.com/orgs/${organization}/packages?package_type=npm&per_page=100&page=${page}`,
        {
          headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${token}`,
            'x-github-api-version': '2022-11-28',
          },
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch {
      fail('REGISTRY_REQUEST_FAILED', 'GitHub package inventory request did not complete');
    }
    if (!response.ok)
      fail('REGISTRY_REQUEST_FAILED', `GitHub package inventory failed (${response.status})`);
    /** @type {unknown} */
    let entries;
    try {
      const json = response.json;
      if (typeof json !== 'function') throw new TypeError('response.json is not a function');
      entries = await Reflect.apply(json, response, []);
    } catch {
      fail('REGISTRY_INVENTORY_INCOMPLETE', 'GitHub package inventory response is malformed');
    }
    if (!isUnknownArray(entries))
      fail('REGISTRY_INVENTORY_INCOMPLETE', 'GitHub package inventory is not an array');
    for (const entry of entries) {
      const name = String(optionalJsonProperty(entry, 'name') ?? '');
      const normalized = name.startsWith('@') ? name : `@${organization}/${name}`;
      if (packageNames.includes(normalized)) {
        if (
          jsonProperty(entry, 'package_type') !== 'npm' ||
          jsonProperty(entry, 'visibility') !== 'private'
        ) {
          fail(
            'REGISTRY_INVENTORY_DISAGREEMENT',
            `${normalized}: package type or visibility drifted`,
          );
        }
        observed.push(normalized);
      }
    }
    if (entries.length < 100) break;
  }
  return { authenticated: true, complete: true, packageNames: [...new Set(observed)].sort() };
}

/** @param {unknown} version @param {string} label */
function parseSemver(version, label) {
  if (typeof version !== 'string') {
    fail('REGISTRY_VERSION_UNSUPPORTED', `${label}: version is not a string`);
  }
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(
      version,
    );
  if (!match) {
    fail('REGISTRY_VERSION_UNSUPPORTED', `${label}: version is not valid SemVer`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split('.') ?? [],
  };
}

/** @param {ReturnType<typeof parseSemver>} left @param {ReturnType<typeof parseSemver>} right */
function compareSemver(left, right) {
  /** @type {Array<'major' | 'minor' | 'patch'>} */
  const numericKeys = ['major', 'minor', 'patch'];
  for (const key of numericKeys) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) return 0;
    return left.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftId = left.prerelease[index];
    const rightId = right.prerelease[index];
    if (leftId === undefined) return -1;
    if (rightId === undefined) return 1;
    if (leftId === rightId) continue;
    const leftNumeric = /^\d+$/u.test(leftId);
    const rightNumeric = /^\d+$/u.test(rightId);
    if (leftNumeric && rightNumeric) return Number(leftId) < Number(rightId) ? -1 : 1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftId < rightId ? -1 : 1;
  }
  return 0;
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
 * This value follows validateCampaignPolicy's exact array check on the same
 * fresh JSON field, or is the original empty fallback for an absent policy.
 * No writer runs between that validation and the Set construction.
 * @param {unknown} value
 * @returns {unknown[]}
 */
function validatedPolicyArray(value) {
  if (!Array.isArray(value)) throw new TypeError('validated policy list ceased to be an array');
  return value;
}

/**
 * Strings and arrays are the iterable representations of these fresh JSON fields.
 * Return the original value so native iteration and string code points stay intact.
 * Noniterable wording follows the pinned Node runtime at the original operation.
 * @param {unknown} value
 * @param {'campaign' | 'anomaly'} operation
 * @returns {string | unknown[]}
 */
function jsonIterable(value, operation) {
  if (typeof value === 'string' || Array.isArray(value)) return value;
  if (operation === 'campaign') {
    throw new TypeError('(policy.publishable_packages ?? []) is not iterable');
  }
  const description = typeof value === 'object' ? 'object' : `${typeof value} ${String(value)}`;
  throw new TypeError(
    `${description} is not iterable (cannot read property Symbol(Symbol.iterator))`,
  );
}
