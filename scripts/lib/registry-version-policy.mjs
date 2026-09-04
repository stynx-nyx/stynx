import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const registryVersionPolicyConstants = Object.freeze({
  anomalyPolicyPath: 'law/policy/registry-version-anomalies.json',
  anomalyPolicySha256: '01a0f6c90b917f18697c8a77e4dcf8cc3c63cbe5a402779e78534873cbdd79e3',
  candidate: '1.2.0',
  canonicalMajor: 1,
  packageCount: 44,
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
    fail('REGISTRY_CANDIDATE_UNSUPPORTED', 'only the Architect-approved 1.2.0 candidate is valid');
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
  const approvedAbsent = new Set(policy?.approved_first_publications ?? []);
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

function validateCampaignPolicy(policy, packageNames, candidate) {
  const approved = policy?.approved_first_publications;
  const expected = [
    '@stynx-nyx/jobs',
    '@stynx-nyx/mobile-runtime',
    '@stynx-nyx/notifications',
    '@stynx-nyx/offline-sync',
    '@stynx-nyx/outbox',
    '@stynx-nyx/worklist',
  ];
  if (
    policy?.candidate?.version !== candidate ||
    !Array.isArray(approved) ||
    JSON.stringify([...approved].sort()) !== JSON.stringify(expected) ||
    JSON.stringify([...(policy.publishable_packages ?? [])].sort()) !==
      JSON.stringify([...packageNames].sort())
  ) {
    fail(
      'REGISTRY_FIRST_PUBLICATION_POLICY_UNSUPPORTED',
      'the first-publication policy does not match the exact 44/38/6 campaign',
    );
  }
}

function exactAnomalyFromPolicy(policy, candidate) {
  const [anomaly] = policy?.anomalies ?? [];
  if (
    !anomaly ||
    policy.anomalies.length !== 1 ||
    anomaly.package !== '@stynx-nyx/angular-profile' ||
    anomaly.version !== '2.0.0' ||
    anomaly.allowed_candidate !== candidate ||
    anomaly.applies_to_other_packages !== false ||
    anomaly.applies_to_other_versions !== false
  ) {
    fail(
      'REGISTRY_ANOMALY_POLICY_UNSUPPORTED',
      'the anomaly policy is not the exact approved exception',
    );
  }
  return anomaly;
}

function validateInventory(inventory, expectedPublished) {
  if (inventory === undefined) return;
  if (!isRecord(inventory) || inventory.authenticated !== true) {
    fail('REGISTRY_AUTH_MISSING', 'GitHub package inventory is not authenticated');
  }
  if (inventory.complete !== true || !Array.isArray(inventory.packageNames)) {
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

    let metadata;
    try {
      metadata = await response.json();
    } catch {
      fail('REGISTRY_METADATA_MALFORMED', `${packageName}: registry response is not JSON`);
    }
    metadataByPackage.set(packageName, { authenticated: true, status: 200, metadata });
  }
  return metadataByPackage;
}

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
    let entries;
    try {
      entries = await response.json();
    } catch {
      fail('REGISTRY_INVENTORY_INCOMPLETE', 'GitHub package inventory response is malformed');
    }
    if (!Array.isArray(entries))
      fail('REGISTRY_INVENTORY_INCOMPLETE', 'GitHub package inventory is not an array');
    for (const entry of entries) {
      const name = String(entry?.name ?? '');
      const normalized = name.startsWith('@') ? name : `@${organization}/${name}`;
      if (packageNames.includes(normalized)) {
        if (entry.package_type !== 'npm' || entry.visibility !== 'private') {
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
