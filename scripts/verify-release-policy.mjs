import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReleaseVersionPolicy } from './lib/release-version-policy.mjs';
import {
  fetchRegistryCensus,
  fetchGithubPackagesInventory,
  loadRegistryAnomalyPolicy,
  RegistryVersionPolicyError,
  registryVersionPolicyConstants,
  validateRegistryCensus,
} from './lib/registry-version-policy.mjs';
import { discoverPublishablePackages } from './lib/publishable-packages.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const rootManifest = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const changesetConfig = JSON.parse(
  readFileSync(resolve(repoRoot, '.changeset/config.json'), 'utf8'),
);
const expectedLicense = rootManifest.license;
const registryMode = process.argv.includes('--registry-monotonicity');
const candidate = optionValue('--candidate');

if (registryMode && candidate === null) {
  console.error('Release policy verification failed: --candidate is required in registry mode.');
  process.exit(1);
}
if (!registryMode && candidate !== null) {
  console.error('Release policy verification failed: --candidate requires registry mode.');
  process.exit(1);
}

if (typeof expectedLicense !== 'string' || expectedLicense.length === 0) {
  console.error('Root package.json must declare the repository license choice.');
  process.exit(1);
}

const packages = discoverPublishablePackages(repoRoot);

const errors = [];
errors.push(
  ...validateReleaseVersionPolicy(
    repoRoot,
    changesetConfig,
    registryMode ? { expectedVersion: candidate } : {},
  ),
);
if (registryMode) {
  if (packages.length !== registryVersionPolicyConstants.packageCount) {
    errors.push(
      `registry validation requires exactly ${registryVersionPolicyConstants.packageCount} publishable packages`,
    );
  }
}
if (
  changesetConfig.privatePackages?.version !== false ||
  changesetConfig.privatePackages?.tag !== false
) {
  errors.push('Changesets must not version or tag private reference applications');
}
const requiredPublicExports = {
  '@stynx-nyx/mobile-runtime': ['.', './testing'],
  '@stynx-nyx/pdf': ['.', './evidence', './fixed-layout', './public-payroll'],
  '@stynx-nyx/signature': ['.', './xmldsig'],
  '@stynx-nyx/sessions': ['.', './control'],
};

for (const pkg of packages) {
  const licensePath = resolve(pkg.dirPath, 'LICENSE');
  if (!existsSync(licensePath)) {
    errors.push(`${pkg.manifest.name}: missing LICENSE file`);
  } else {
    const content = readFileSync(licensePath, 'utf8');
    if (!content.includes(expectedLicense)) {
      errors.push(`${pkg.manifest.name}: LICENSE file does not reference ${expectedLicense}`);
    }
  }

  const exportKeys =
    pkg.manifest.exports && typeof pkg.manifest.exports === 'object'
      ? Object.keys(pkg.manifest.exports)
      : [];
  const allowedExports = allowedExportKeys(pkg.manifest.name);
  const unknownExports = exportKeys.filter((key) => !allowedExports.has(key));
  if (!exportKeys.includes('.')) {
    errors.push(`${pkg.manifest.name}: exports must include the "." barrel entry`);
  }
  if (unknownExports.length > 0) {
    errors.push(`${pkg.manifest.name}: unexpected public exports ${unknownExports.join(', ')}`);
  }

  for (const required of requiredPublicExports[pkg.manifest.name] ?? []) {
    if (!exportKeys.includes(required)) {
      errors.push(`${pkg.manifest.name}: missing adopter-facing export ${required}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Release policy verification failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Verified release policy for ${packages.length} publishable packages.`);

if (registryMode) {
  try {
    const packageNames = packages.map(({ manifest }) => manifest.name).sort();
    const anomalyPolicy = JSON.parse(
      readFileSync(resolve(repoRoot, 'law/policy/registry-version-anomalies.json'), 'utf8'),
    );
    loadRegistryAnomalyPolicy(repoRoot, candidate);
    // The 1.1.1 campaign policy was retired with the DEVAI adoption migration.
    // Its still-valid product content — the package census and the approved
    // first-publication exceptions — now lives in the STYNX package roster.
    const packageRoster = JSON.parse(
      readFileSync(resolve(repoRoot, 'law/policy/stynx-package-roster.json'), 'utf8'),
    );
    const campaignPolicy = {
      policy_id: packageRoster.policy_id,
      candidate: {
        version: candidate,
        publishable_count: packageRoster.counts.publishable,
        mutation_count: packageRoster.counts.mutation,
        existing_private_count: packageRoster.counts.existing_private,
        approved_first_publication_count: packageRoster.counts.approved_first_publications,
      },
      publishable_packages: [...packageRoster.publishable_packages],
      existing_private_packages: [...packageRoster.existing_private_packages],
      mutation_packages: [...packageRoster.mutation_packages],
      approved_first_publications: [...packageRoster.approved_first_publications],
    };
    const token = process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN;
    const registryStatesByPackage = await fetchRegistryCensus({ packageNames, token });
    const githubPackagesInventory = await fetchGithubPackagesInventory({ packageNames, token });
    const result = validateRegistryCensus({
      packageNames,
      registryStatesByPackage,
      githubPackagesInventory,
      candidate,
      anomalyPolicy,
      campaignPolicy,
    });
    console.log(
      `Verified authenticated registry history for ${result.packageCount} packages at candidate ${candidate}.`,
    );
  } catch (error) {
    if (error instanceof RegistryVersionPolicyError) {
      console.error(`Release policy verification failed: ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

function allowedExportKeys(packageName) {
  const keys = new Set(['.', './package.json']);
  if (packageName.startsWith('@stynx-nyx/angular') || packageName === '@stynx-nyx/sdk') {
    keys.add('./testing');
  }
  if (packageName.startsWith('@stynx-nyx/angular')) {
    keys.add('./catalogs/en.json');
    keys.add('./catalogs/pt-BR.json');
  }
  for (const required of requiredPublicExports[packageName] ?? []) {
    keys.add(required);
  }
  return keys;
}

function optionValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`Release policy verification failed: ${name} requires a value.`);
    process.exit(1);
  }
  return value;
}
