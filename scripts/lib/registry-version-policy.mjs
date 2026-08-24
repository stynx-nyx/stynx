import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const registryVersionPolicyConstants = Object.freeze({
  anomalyPolicyPath: 'law/policy/registry-version-anomalies.json',
  anomalyPolicySha256: '2be2ece2dea2c36b4aaad0e45214b878feae5dbc0461f4f0486bbe2bca520816',
  candidate: '1.1.1',
  canonicalMajor: 1,
  packageCount: 38,
  registryUrl: 'https://npm.pkg.github.com',
});

export class RegistryVersionPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RegistryVersionPolicyError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new RegistryVersionPolicyError(code, message);
}

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

  let policy;
  try {
    policy = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('REGISTRY_ANOMALY_POLICY_MALFORMED', 'the Architect-owned anomaly policy is not JSON');
  }

  const anomalies = policy.anomalies;
  if (
    policy.schemaVersion !== '1.0.0' ||
    policy.policy_id !== 'stynx.registry-version-anomalies' ||
    policy.canonical_line !== '1.x' ||
    policy.next_unified_version !== registryVersionPolicyConstants.candidate ||
    candidate !== policy.next_unified_version ||
    !Array.isArray(anomalies) ||
    anomalies.length !== 1
  ) {
    fail(
      'REGISTRY_ANOMALY_POLICY_UNSUPPORTED',
      'the anomaly policy is broader than, expired for, or unmatched to the exact candidate',
    );
  }

  const [anomaly] = anomalies;
  if (
    anomaly.anomaly_id !== 'REGISTRY-VERSION-ANOMALY-0001' ||
    anomaly.package !== '@stynx-nyx/angular-profile' ||
    anomaly.version !== '2.0.0' ||
    anomaly.github_package_version_id !== 1024692931 ||
    anomaly.classification !== 'erroneous-semver-publication' ||
    anomaly.allowed_candidate !== candidate ||
    JSON.stringify(anomaly.allowed_effects) !==
      JSON.stringify(['registry-monotonicity-exception']) ||
    anomaly.applies_to_other_packages !== false ||
    anomaly.applies_to_other_versions !== false
  ) {
    fail(
      'REGISTRY_ANOMALY_POLICY_UNSUPPORTED',
      'the anomaly policy does not describe the one exact Architect-approved exception',
    );
  }

  return anomaly;
}

export function validateRegistryCensus({ packageNames, metadataByPackage, candidate, anomaly }) {
  if (candidate !== registryVersionPolicyConstants.candidate) {
    fail('REGISTRY_CANDIDATE_UNSUPPORTED', 'only the Architect-approved 1.1.1 candidate is valid');
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
  if (!(metadataByPackage instanceof Map) || metadataByPackage.size !== packageNames.length) {
    fail('REGISTRY_CENSUS_INCOMPLETE', 'registry metadata is incomplete for the package roster');
  }

  let anomalyMatches = 0;
  for (const packageName of packageNames) {
    if (!metadataByPackage.has(packageName)) {
      fail('REGISTRY_CENSUS_INCOMPLETE', `registry metadata is missing for ${packageName}`);
    }
    anomalyMatches += validatePackageMetadata(
      packageName,
      metadataByPackage.get(packageName),
      candidate,
      anomaly,
    );
  }

  for (const packageName of metadataByPackage.keys()) {
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

  return { anomalyMatches, packageCount: packageNames.length };
}

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
    if (
      comparison >= 0 &&
      packageName === anomaly.package &&
      version === anomaly.version &&
      anomaly.allowed_candidate === candidate
    ) {
      anomalyMatches += 1;
      continue;
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

  return anomalyMatches;
}

export async function fetchRegistryCensus({ packageNames, token, fetchImpl = fetch }) {
  if (typeof token !== 'string' || token.trim() === '') {
    fail('REGISTRY_AUTH_MISSING', 'authenticated registry validation requires a protected token');
  }

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
    if (!response.ok) {
      const kind = response.status === 401 || response.status === 403 ? 'authentication' : 'HTTP';
      fail(
        'REGISTRY_REQUEST_FAILED',
        `${packageName}: registry ${kind} failure (${response.status})`,
      );
    }

    let metadata;
    try {
      metadata = await response.json();
    } catch {
      fail('REGISTRY_METADATA_MALFORMED', `${packageName}: registry response is not JSON`);
    }
    metadataByPackage.set(packageName, metadata);
  }
  return metadataByPackage;
}

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

function compareSemver(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
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

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
