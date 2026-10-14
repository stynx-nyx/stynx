import { isDeepStrictEqual } from 'node:util';

const fullSha = /^[0-9a-f]{40}$/u;
const versionCommitSubject = 'ci: version packages';
const unifiedRebaselineVersion = '1.2.0';
const releaseStatusCommand = 'node scripts/run-release-preparation.mjs --release-status';
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const rcVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-rc\.(0|[1-9]\d*)$/u;
const finalVersionCommitSubject = 'chore(repo): version 1.5.0 final release';
const finalVersion = '1.5.0';
const finalBaseVersion = '1.5.0-rc.3';
const stablePatchVersionCommitSubject = 'chore(repo): version fixed group to 1.5.1';
const secondStablePatchVersionCommitSubject = 'chore(repo): version fixed group to 1.5.2';
const thirdStablePatchVersionCommitSubject = 'chore(repo): version fixed group to 1.5.3';
const fourthStablePatchVersionCommitSubject = 'chore(repo): version fixed group to 1.5.4';
const fifthStablePatchVersionCommitSubject = 'chore(repo): version fixed group to 1.5.5';
const sixthStablePatchVersionCommitSubject = 'chore(repo): version fixed group to 1.5.6';
const seventhStablePatchVersionCommitSubject = 'chore(repo): version fixed group to 1.5.7';
const patch161VersionCommitSubject = 'chore(release): prepare the 1.6.1 fixed group';
const patch162VersionCommitSubject = 'chore(stynx-workspace): version fixed group to 1.6.2';

export const versionedStorageTemplates = Object.freeze([
  Object.freeze({
    path: 'packages/offline-sync/src/storage-template.generated.ts',
    manifestPath: 'packages/offline-sync/package.json',
    generator: 'offline-storage-generate.mjs',
    exportName: 'OFFLINE_STORAGE_TEMPLATE',
  }),
  Object.freeze({
    path: 'packages/outbox/src/storage-template.generated.ts',
    manifestPath: 'packages/outbox/package.json',
    generator: 'outbox-storage-generate.mjs',
    exportName: 'OUTBOX_STORAGE_TEMPLATE',
  }),
]);

// ADR-RELEASE-0004: exact reviewed net changes after the 1.6.1 marker.
// Historical patch profiles keep their existing follow-up rules.
const patch161FollowUpStatuses = new Map([
  ['docs/meta/ops/workflows/devai-local-rc-verify.md', 'M'],
  ['packages/offline-sync/test/unit/offline-sync.service.spec.ts', 'M'],
  ['packages/offline-sync/test/integration/ctg9-upgrade.integration.spec.ts', 'M'],
  [
    'packages/offline-sync/test/integration/offline-sync-nullable-reservations.integration.spec.ts',
    'M',
  ],
  [
    'packages/offline-sync/test/integration/offline-sync-pending-review-context.integration.spec.ts',
    'M',
  ],
  [
    'packages/offline-sync/test/integration/offline-sync-range-administration.integration.spec.ts',
    'M',
  ],
  ['test/scripts/validate.js', 'M'],
  ['scripts/generate-sbom.mjs', 'M'],
  ['scripts/verify-license-policy.mjs', 'M'],
  ['test/scripts/storage-version-pipeline.test.mjs', 'M'],
  ['docs/meta/security/sbom.cdx.json', 'M'],
  ['test/scripts/api-task-source-custody.test.mjs', 'M'],
  ['test/scripts/devai-adoption-contract.test.mjs', 'M'],
  ['test/scripts/http-qualification-openapi.test.mjs', 'M'],
  ['test/scripts/verify-api-coverage.test.mjs', 'M'],
  ['.devai/config/adopter-policy-binding.json', 'M'],
  ['.devai/config/authority-policy.json', 'M'],
  ['.devai/config/github-actions-host-adapter.json', 'M'],
  ['.devai/config/project.json', 'M'],
  ['.devai/config/upgrade-receipt.json', 'M'],
  ['.devai/constitution.md', 'M'],
  ['AGENTS.md', 'M'],
  ['README.md', 'M'],
  ['docs/framework/api/openapi.json', 'M'],
  ['docs/framework/contracts/consumer-storage.md', 'M'],
  ['docs/framework/contracts/offline-storage-import.md', 'M'],
  ['docs/framework/contracts/offline-sync-api.md', 'M'],
  ['docs/framework/contracts/openapi-compositions/offline-ctg9.json', 'M'],
  ['docs/framework/contracts/openapi-compositions/offline-e6.json', 'M'],
  ['docs/framework/contracts/openapi.json', 'M'],
  ['docs/framework/contracts/public-api-baselines.json', 'M'],
  ['law/adr/2026-10-12-patch-1.6.1-and-practical-audit.md', 'M'],
  ['law/adr/2026-10-12-supported-scorecard-task-collection.md', 'M'],
  ['law/adr/ADR-MOBILE-OFFLINE-0005-acceptance-evidence.md', 'M'],
  ['law/policy/devai-package-identity.json', 'M'],
  ['law/policy/forbidden-action-authorizations.json', 'M'],
  ['law/policy/registry-version-anomalies.json', 'M'],
  ['law/schemas/README.md', 'M'],
  ['law/trace.json', 'M'],
  ['package.json', 'M'],
  ['packages-web/sdk/CHANGELOG.md', 'M'],
  ['packages-web/sdk/src/generated/compositions/offline-ctg9/index.ts', 'M'],
  [
    'packages-web/sdk/src/generated/compositions/offline-ctg9/models/CTG9ReserveNumberingInput.ts',
    'M',
  ],
  [
    'packages-web/sdk/src/generated/compositions/offline-ctg9/models/CTG9SubmitSyncBatchInput.ts',
    'A',
  ],
  [
    'packages-web/sdk/src/generated/compositions/offline-ctg9/models/CTG9SyncBatchItemInput.ts',
    'A',
  ],
  [
    'packages-web/sdk/src/generated/compositions/offline-ctg9/models/OfflineSyncStynxContext.ts',
    'M',
  ],
  [
    'packages-web/sdk/src/generated/compositions/offline-ctg9/models/ReconcileNumberingInput.ts',
    'M',
  ],
  [
    'packages-web/sdk/src/generated/compositions/offline-ctg9/models/ReconcileNumberingResult.ts',
    'M',
  ],
  [
    'packages-web/sdk/src/generated/compositions/offline-ctg9/schemas/$CTG9ReserveNumberingInput.ts',
    'M',
  ],
  [
    'packages-web/sdk/src/generated/compositions/offline-ctg9/schemas/$CTG9SubmitSyncBatchInput.ts',
    'A',
  ],
  [
    'packages-web/sdk/src/generated/compositions/offline-ctg9/schemas/$CTG9SyncBatchItemInput.ts',
    'A',
  ],
  [
    'packages-web/sdk/src/generated/compositions/offline-ctg9/schemas/$OfflineSyncStynxContext.ts',
    'M',
  ],
  [
    'packages-web/sdk/src/generated/compositions/offline-ctg9/schemas/$ReconcileNumberingInput.ts',
    'M',
  ],
  [
    'packages-web/sdk/src/generated/compositions/offline-ctg9/schemas/$ReconcileNumberingResult.ts',
    'M',
  ],
  [
    'packages-web/sdk/src/generated/compositions/offline-ctg9/services/Ctg9OfflineSyncService.ts',
    'M',
  ],
  ['packages-web/sdk/src/generated/index.ts', 'M'],
  ['packages-web/sdk/src/generated/models/CTG9ReserveNumberingInput.ts', 'M'],
  ['packages-web/sdk/src/generated/models/CTG9SubmitSyncBatchInput.ts', 'A'],
  ['packages-web/sdk/src/generated/models/CTG9SyncBatchItemInput.ts', 'A'],
  ['packages-web/sdk/src/generated/models/OfflineSyncStynxContext.ts', 'M'],
  ['packages-web/sdk/src/generated/models/ReconcileNumberingInput.ts', 'M'],
  ['packages-web/sdk/src/generated/models/ReconcileNumberingResult.ts', 'M'],
  ['packages-web/sdk/src/generated/schemas/$CTG9ReserveNumberingInput.ts', 'M'],
  ['packages-web/sdk/src/generated/schemas/$CTG9SubmitSyncBatchInput.ts', 'A'],
  ['packages-web/sdk/src/generated/schemas/$CTG9SyncBatchItemInput.ts', 'A'],
  ['packages-web/sdk/src/generated/schemas/$OfflineSyncStynxContext.ts', 'M'],
  ['packages-web/sdk/src/generated/schemas/$ReconcileNumberingInput.ts', 'M'],
  ['packages-web/sdk/src/generated/schemas/$ReconcileNumberingResult.ts', 'M'],
  ['packages/data/CHANGELOG.md', 'M'],
  ['packages/data/src/database.ts', 'M'],
  ['packages/data/test/unit/database-error-code.spec.ts', 'A'],
  ['packages/offline-sync/CHANGELOG.md', 'M'],
  ['packages/offline-sync/src/domain-error-context.ts', 'M'],
  ['packages/offline-sync/src/domain-outcome.ts', 'A'],
  ['packages/offline-sync/src/import-validation.ts', 'M'],
  ['packages/offline-sync/src/in-memory-offline-sync.store.ts', 'M'],
  ['packages/offline-sync/src/index.ts', 'M'],
  ['packages/offline-sync/src/offline-sync.service.ts', 'M'],
  ['packages/offline-sync/src/postgres-durable.ts', 'M'],
  ['packages/offline-sync/src/postgres-offline-sync.store.ts', 'M'],
  ['packages/offline-sync/src/storage-catalog.generated.ts', 'M'],
  ['packages/offline-sync/src/storage-invariants.ts', 'M'],
  ['packages/offline-sync/src/storage-template.generated.ts', 'M'],
  ['packages/offline-sync/src/storage.ts', 'M'],
  ['packages/offline-sync/src/types.ts', 'M'],
  ['packages/offline-sync/test/integration/offline-domain-outcomes.integration.spec.ts', 'A'],
  ['packages/offline-sync/test/integration/offline-reconciliation-import.integration.spec.ts', 'A'],
  ['packages/offline-sync/test/integration/offline-storage-migrations.integration.spec.ts', 'A'],
  ['packages/offline-sync/test/integration/offline-storage-reapply.integration.spec.ts', 'A'],
  ['packages/offline-sync/test/integration/offline-storage.integration.spec.ts', 'M'],
  ['packages/offline-sync/test/integration/offline-sync-acceptance-gaps.integration.spec.ts', 'M'],
  [
    'packages/offline-sync/test/integration/offline-sync-consumption-clock.integration.spec.ts',
    'M',
  ],
  ['packages/offline-sync/test/integration/offline-sync-lists-reserve.integration.spec.ts', 'M'],
  ['packages/offline-sync/test/support/offline-domain-outcomes.ts', 'A'],
  ['packages/offline-sync/test/support/offline-reconciliation-import-fixture.ts', 'A'],
  ['packages/offline-sync/test/support/offline-sync-acceptance-gaps.ts', 'M'],
  ['packages/offline-sync/test/unit/offline-domain-outcomes.spec.ts', 'A'],
  ['packages/offline-sync/test/unit/offline-reconciliation-import.spec.ts', 'A'],
  ['packages/offline-sync/test/unit/offline-storage-artifact.spec.ts', 'M'],
  ['packages/offline-sync/test/unit/offline-storage-migrations-packed.spec.ts', 'A'],
  ['packages/offline-sync/test/unit/offline-storage-migrations.spec.ts', 'A'],
  ['packages/offline-sync/test/unit/offline-sync-lists-reserve.spec.ts', 'M'],
  ['packages/offline-sync/test/unit/offline-sync-pending-review-context.spec.ts', 'M'],
  ['packages/offline-sync/test/unit/postgres-durable-coverage.spec.ts', 'M'],
  ['packages/offline-sync/test/unit/postgres-pending-review-context.spec.ts', 'M'],
  ['pnpm-lock.yaml', 'M'],
  ['scripts/lib/registry-version-policy.mjs', 'M'],
  ['scripts/lib/release-context.mjs', 'M'],
  ['scripts/offline-storage-generate.mjs', 'M'],
  ['scripts/run-release-preparation.mjs', 'M'],
  ['scripts/verify-offline-storage-references.mjs', 'M'],
  ['test/fixtures/release-scope/test-tasks-1.6.0.json', 'A'],
  ['test/scripts/local-rc-blocker-contract.test.mjs', 'M'],
  ['test/scripts/offline-storage-references.test.mjs', 'M'],
  ['test/scripts/release-evidence-scope.test.mjs', 'M'],
  ['test/scripts/release-version-policy.test.mjs', 'M'],
]);

const allowedVersionSupportPaths = new Set([
  'docs/meta/security/sbom.cdx.json',
  'package.json',
  'packages/pdf/README.md',
  'packages/pdf-a/README.md',
  'packages/pdf-a-vera-docker/README.md',
  'tools/create-stynx-app/template/package.json',
]);

// ADR-RELEASE-0005: the 1.6.2 SBOM was regenerated after the version marker.
// Keep historical marker populations unchanged.
const patch162VersionSupportPaths = new Set(
  [...allowedVersionSupportPaths].filter((path) => path !== 'docs/meta/security/sbom.cdx.json'),
);

// ADR-DEVAI-ADOPTION-0024: the published CLI bind and inspected follow-up
// population are closed. A newly changed path must be reviewed explicitly.
const patch162FollowUpStatuses = new Map([
  ['.devai/config/adopter-policy-binding.json', 'M'],
  ['.devai/config/authority-policy.json', 'M'],
  ['.devai/config/github-actions-host-adapter.json', 'M'],
  ['.devai/config/project.json', 'M'],
  ['.devai/config/subprocess-effects.json', 'M'],
  ['.devai/config/upgrade-receipt.json', 'M'],
  ['.devai/constitution.md', 'M'],
  ['AGENTS.md', 'M'],
  ['README.md', 'M'],
  ['docs/meta/security/sbom.cdx.json', 'M'],
  ['law/adr/2026-10-13-devai-2.6.2-adoption.md', 'A'],
  ['law/adr/2026-10-13-patch-1.6.2-audit-tranche.md', 'M'],
  ['law/policy/devai-package-identity.json', 'M'],
  ['law/trace.json', 'M'],
  ['package.json', 'M'],
  ['pnpm-lock.yaml', 'M'],
  ['scripts/lib/release-context.mjs', 'M'],
  ['scripts/run-release-preparation.mjs', 'M'],
  ['test/scripts/api-task-source-custody.test.mjs', 'M'],
  ['test/scripts/devai-adoption-contract.test.mjs', 'M'],
  ['test/scripts/local-rc-blocker-contract.test.mjs', 'M'],
  ['test/scripts/release-version-policy.test.mjs', 'M'],
  ['test/scripts/storage-version-pipeline.test.mjs', 'M'],
  ['test/scripts/validate.js', 'M'],
]);

const allowedVersionFollowUpPaths = new Set([
  '.changeset/config.json',
  'docs/adopters/stynx/release-readiness.md',
  'docs/meta/security/sbom.cdx.json',
  'package.json',
  'scripts/lib/release-context.mjs',
  'scripts/lib/release-version-policy.mjs',
  'scripts/run-release-preparation.mjs',
  'scripts/sync-release-version.mjs',
  'scripts/verify-release-policy.mjs',
  // The versioned root manifest changes this frozen contract's digest. Its
  // exact pin must follow the generated version commit without loosening the
  // contract or permitting arbitrary release follow-up paths.
  'test/scripts/local-rc-blocker-contract.test.mjs',
  'tools/create-stynx-app/template/package.json',
]);

const allowedStablePatchFollowUpPaths = new Set([
  'law/policy/registry-version-anomalies.json',
  'law/trace.json',
  'package.json',
  'scripts/lib/registry-version-policy.mjs',
  'scripts/lib/release-context.mjs',
  'scripts/run-release-preparation.mjs',
  'test/db/outbox-event-log-migration.spec.ts',
  'test/scripts/local-rc-blocker-contract.test.mjs',
  'test/scripts/release-version-policy.test.mjs',
]);

const allowedSecondStablePatchFollowUpPaths = new Set([
  '.semgrepignore',
  'law/policy/forbidden-action-authorizations.json',
  'law/policy/registry-version-anomalies.json',
  'law/trace.json',
  'scripts/lib/registry-version-policy.mjs',
  'scripts/lib/release-context.mjs',
  'scripts/run-release-preparation.mjs',
  'test/scripts/local-rc-blocker-contract.test.mjs',
  'test/scripts/release-version-policy.test.mjs',
]);

const allowedSecondStablePatchAddedPaths = new Set([
  'law/adr/2026-09-29-postrelease-pki-fixture-scan.md',
]);

// ADR-DEVAI-ADOPTION-0011: the eleven changesets the 1.5.3 marker consumes.
const thirdStablePatchChangesetPaths = Object.freeze([
  '.changeset/angular-22-2-1-advisory.md',
  '.changeset/auth-sessions-partition-maintenance.md',
  '.changeset/auth-sessions-partition-retention.md',
  '.changeset/deps-minor-patch-2026-10.md',
  '.changeset/ngsse-opt-in-options.md',
  '.changeset/offline-sync-lists-idempotent-reserve.md',
  '.changeset/outbox-event-reads-retry.md',
  '.changeset/outbox-exact-null-assertions.md',
  '.changeset/signature-declarative-qualified.md',
  '.changeset/signature-offline-sync-test-clock.md',
  '.changeset/sse-429-retry-after-polling.md',
]);

const allowedThirdStablePatchFollowUpPaths = new Set([
  'law/policy/forbidden-action-authorizations.json',
  'law/policy/registry-version-anomalies.json',
  'law/trace.json',
  'scripts/lib/registry-version-policy.mjs',
  'scripts/lib/release-context.mjs',
  'scripts/run-release-preparation.mjs',
  'test/scripts/local-rc-blocker-contract.test.mjs',
  'test/scripts/release-version-policy.test.mjs',
]);

// ADR-DEVAI-ADOPTION-0012: the four changesets the 1.5.4 marker consumes.
const fourthStablePatchChangesetPaths = Object.freeze([
  '.changeset/ngsse-server-close-policy.md',
  '.changeset/outbox-event-destinations.md',
  '.changeset/readme-generated-dependency-pointer.md',
  '.changeset/serialize-db-backed-specs.md',
]);

const allowedFourthStablePatchFollowUpPaths = new Set([
  'law/policy/forbidden-action-authorizations.json',
  'law/policy/registry-version-anomalies.json',
  'law/trace.json',
  'scripts/lib/registry-version-policy.mjs',
  'scripts/lib/release-context.mjs',
  'scripts/run-release-preparation.mjs',
  'test/scripts/local-rc-blocker-contract.test.mjs',
  'test/scripts/release-version-policy.test.mjs',
]);

// ADR-DEVAI-ADOPTION-0015: the one changeset the 1.5.5 marker consumes.
const fifthStablePatchChangesetPaths = Object.freeze(['.changeset/pdf-handlebars-advisories.md']);

const allowedFifthStablePatchFollowUpPaths = new Set([
  'law/policy/forbidden-action-authorizations.json',
  'law/policy/registry-version-anomalies.json',
  'law/trace.json',
  'scripts/lib/registry-version-policy.mjs',
  'scripts/lib/release-context.mjs',
  'scripts/run-release-preparation.mjs',
  'test/scripts/local-rc-blocker-contract.test.mjs',
  'test/scripts/release-version-policy.test.mjs',
]);

// ADR-DEVAI-ADOPTION-0016: the changesets the 1.5.6 marker consumes.
const sixthStablePatchChangesetPaths = Object.freeze([
  '.changeset/ngsse-open-status.md',
  '.changeset/offline-sync-1-5-6-slice.md',
  '.changeset/outbox-named-destinations.md',
  '.changeset/signature-trust-profile-sets.md',
]);

const allowedSixthStablePatchFollowUpPaths = new Set([
  'law/policy/forbidden-action-authorizations.json',
  'law/policy/registry-version-anomalies.json',
  'law/trace.json',
  'scripts/lib/registry-version-policy.mjs',
  'scripts/lib/release-context.mjs',
  'scripts/run-release-preparation.mjs',
  'test/scripts/local-rc-blocker-contract.test.mjs',
  'test/scripts/release-version-policy.test.mjs',
]);

// ADR-DEVAI-ADOPTION-0018: the changesets the 1.5.7 marker consumes.
const seventhStablePatchChangesetPaths = Object.freeze([
  '.changeset/offline-sync-1-5-7-pending-review-context.md',
  '.changeset/outbox-configurable-app-role.md',
]);

const allowedSeventhStablePatchFollowUpPaths = new Set([
  'law/policy/forbidden-action-authorizations.json',
  'law/policy/registry-version-anomalies.json',
  'law/trace.json',
  'scripts/lib/registry-version-policy.mjs',
  'scripts/lib/release-context.mjs',
  'scripts/run-release-preparation.mjs',
  'test/scripts/local-rc-blocker-contract.test.mjs',
  'test/scripts/release-version-policy.test.mjs',
]);

export class ReleaseContextError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReleaseContextError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ReleaseContextError(code, message);
}

function isChangeset(path) {
  return /^\.changeset\/[^/]+\.md$/u.test(path);
}

function packageDirectory(path) {
  const match = /^(packages|packages-web)\/[^/]+\/(package\.json|CHANGELOG\.md)$/u.exec(path);
  return match ? path.slice(0, path.lastIndexOf('/')) : null;
}

function validateStorageVersionChanges(changes, artifacts) {
  if (!Array.isArray(artifacts)) {
    fail('RELEASE_CONTEXT_STORAGE_VERSION', 'storage template snapshots must be an array');
  }
  const storageChanges = changes.filter(({ path }) =>
    versionedStorageTemplates.some((entry) => entry.path === path),
  );
  // Historical version markers predate these generated artifacts. The live
  // runner supplies both exact Git-object snapshots whenever they exist.
  if (artifacts.length === 0 && storageChanges.length === 0) return;
  if (
    artifacts.length !== 2 ||
    storageChanges.length !== 2 ||
    new Set(artifacts.map(({ path }) => path)).size !== 2 ||
    new Set(storageChanges.map(({ path }) => path)).size !== 2
  ) {
    fail('RELEASE_CONTEXT_STORAGE_VERSION', 'version commit requires both exact storage templates');
  }
  for (const template of versionedStorageTemplates) {
    const artifact = artifacts.find(({ path }) => path === template.path);
    const change = storageChanges.find(({ path }) => path === template.path);
    if (
      !artifact ||
      change?.status !== 'M' ||
      !Buffer.isBuffer(artifact.before) ||
      !Buffer.isBuffer(artifact.after)
    ) {
      fail('RELEASE_CONTEXT_STORAGE_VERSION', `invalid storage template snapshot ${template.path}`);
    }
    const before = artifact.before.toString('utf8');
    const after = artifact.after.toString('utf8');
    const prefix = `// Generated by scripts/${template.generator}; do not edit.\nexport const ${template.exportName} = {\n`;
    const rows = [...before.matchAll(/^ {2}packageVersion: '([^'\r\n]+)',$/gmu)];
    if (
      !artifact.before.equals(Buffer.from(before)) ||
      !artifact.after.equals(Buffer.from(after)) ||
      !before.startsWith(prefix) ||
      rows.length !== 1 ||
      rows[0][1] !== artifact.baseVersion ||
      !(stableVersion.test(artifact.baseVersion) || rcVersion.test(artifact.baseVersion)) ||
      !(stableVersion.test(artifact.version) || rcVersion.test(artifact.version)) ||
      artifact.baseVersion === artifact.version ||
      after !== before.replace(rows[0][0], `  packageVersion: '${artifact.version}',`)
    ) {
      fail(
        'RELEASE_CONTEXT_STORAGE_VERSION',
        `storage template changes more than its package version: ${template.path}`,
      );
    }
  }
}

function validateVersionChanges(changes, versionRebaselineValid, storageVersionArtifacts) {
  validateStorageVersionChanges(changes, storageVersionArtifacts);
  const deletedChangesets = [];
  const manifests = new Set();
  const changelogs = new Set();

  for (const change of changes) {
    const { path, status } = change;
    if (status === 'D' && isChangeset(path)) {
      deletedChangesets.push(path);
      continue;
    }

    const directory = packageDirectory(path);
    if (status === 'M' && directory !== null) {
      if (path.endsWith('/package.json')) manifests.add(directory);
      else changelogs.add(directory);
      continue;
    }

    if (status === 'M' && allowedVersionSupportPaths.has(path)) continue;
    if (status === 'M' && versionedStorageTemplates.some((entry) => entry.path === path)) continue;

    fail(
      'RELEASE_CONTEXT_VERSION_DIFF',
      `version commit contains unexpected ${status} path ${path}`,
    );
  }

  if (deletedChangesets.length === 0 && !versionRebaselineValid) {
    fail('RELEASE_CONTEXT_NO_CHANGESETS', 'version commit consumes no changesets');
  }
  if (manifests.size === 0) {
    fail('RELEASE_CONTEXT_NO_PACKAGES', 'version commit changes no package manifests');
  }
  for (const directory of manifests) {
    if (!changelogs.has(directory)) {
      fail(
        'RELEASE_CONTEXT_CHANGELOG_MISSING',
        `versioned package ${directory} has no matching changelog change`,
      );
    }
  }
  for (const directory of changelogs) {
    if (!manifests.has(directory)) {
      fail(
        'RELEASE_CONTEXT_MANIFEST_MISSING',
        `changed changelog ${directory} has no matching package manifest change`,
      );
    }
  }

  return {
    changesetCount: deletedChangesets.length,
    packageCount: manifests.size,
    rebaseline: deletedChangesets.length === 0,
  };
}

function validateFollowUpChanges(changes, rootManifestFollowUpValid) {
  for (const change of changes) {
    if (!['A', 'M'].includes(change.status) || !allowedVersionFollowUpPaths.has(change.path)) {
      fail(
        'RELEASE_CONTEXT_FOLLOW_UP_DIFF',
        `version candidate contains unexpected follow-up ${change.status} path ${change.path}`,
      );
    }
  }
  if (changes.some((change) => change.path === 'package.json') && !rootManifestFollowUpValid) {
    fail(
      'RELEASE_CONTEXT_ROOT_MANIFEST',
      'version candidate changes root package.json beyond the release-preparation command',
    );
  }
}

/** A generated, already-versioned RC has no pending Changesets status to draft. */
export function isVersionedPreModeCandidate({
  baseRootVersion,
  candidateRootVersion,
  versionCommitVersion,
  packageStates,
  changedManifestPaths,
  changesetIdsOnDisk,
  followUpChanges,
  basePreState,
  preState,
}) {
  const baseStable = stableVersion.exec(baseRootVersion);
  const baseRc = rcVersion.exec(baseRootVersion);
  const candidateRc = rcVersion.exec(candidateRootVersion);
  if (
    (!baseStable && !baseRc) ||
    !candidateRc ||
    versionCommitVersion !== candidateRootVersion.slice(0, -`-rc.${candidateRc[4]}`.length) ||
    preState?.mode !== 'pre' ||
    preState.tag !== 'rc' ||
    !Array.isArray(preState.changesets) ||
    preState.changesets.length === 0 ||
    !Array.isArray(packageStates) ||
    packageStates.length !== 44 ||
    !Array.isArray(changedManifestPaths) ||
    !Array.isArray(changesetIdsOnDisk) ||
    !Array.isArray(followUpChanges) ||
    followUpChanges.some(
      ({ path }) =>
        /^(?:packages|packages-web|\.changeset)\//u.test(path) && path !== '.changeset/status.json',
    )
  )
    return false;

  if (baseStable) {
    if (basePreState !== null) return false;
    const base = baseStable.slice(1).map(Number);
    const candidate = candidateRc.slice(1, 4).map(Number);
    if (
      !candidate.some(
        (part, index) =>
          part > base[index] &&
          candidate.slice(0, index).every((earlier, i) => earlier === base[i]),
      )
    )
      return false;
  } else {
    if (
      baseRc.slice(1, 4).some((part, index) => part !== candidateRc[index + 1]) ||
      Number(candidateRc[4]) <= Number(baseRc[4]) ||
      basePreState?.mode !== 'pre' ||
      basePreState.tag !== 'rc' ||
      !Array.isArray(basePreState.changesets) ||
      basePreState.changesets.some((id) => !preState.changesets.includes(id))
    )
      return false;
  }

  const names = new Set(packageStates.map(({ name }) => name));
  const paths = new Set(packageStates.map(({ manifestPath }) => manifestPath));
  const changed = new Set(changedManifestPaths);
  const consumed = new Set(preState.changesets);
  const onDisk = new Set(changesetIdsOnDisk);
  if (
    names.size !== 44 ||
    paths.size !== 44 ||
    changed.size !== 44 ||
    changedManifestPaths.length !== 44 ||
    consumed.size !== preState.changesets.length ||
    onDisk.size !== changesetIdsOnDisk.length ||
    consumed.size !== onDisk.size ||
    [...consumed].some((id) => !onDisk.has(id)) ||
    [...paths].some((path) => !changed.has(path))
  )
    return false;

  return packageStates.every(
    ({ name, baseVersion, candidateVersion }) =>
      candidateVersion === candidateRootVersion &&
      (baseStable
        ? baseVersion === preState.initialVersions?.[name]
        : baseVersion === baseRootVersion &&
          basePreState.initialVersions?.[name] === preState.initialVersions?.[name]),
  );
}

/** The consolidated final candidate has one exact marker and no pending release inputs. */
export function isFinalVersionedCandidate({
  baseRootVersion,
  basePreState,
  markerCommits,
  markerParentPreState,
  markerChanges,
  followUpChanges,
  candidateRootVersion,
  packageStates,
  changesetIdsOnDisk,
  preState,
}) {
  if (
    baseRootVersion !== finalBaseVersion ||
    candidateRootVersion !== finalVersion ||
    preState !== null ||
    basePreState?.mode !== 'pre' ||
    basePreState.tag !== 'rc' ||
    !Array.isArray(basePreState.changesets) ||
    !isDeepStrictEqual(markerParentPreState, basePreState) ||
    !Array.isArray(markerCommits) ||
    !Array.isArray(markerChanges) ||
    !Array.isArray(followUpChanges) ||
    !Array.isArray(packageStates) ||
    packageStates.length !== 44 ||
    !Array.isArray(changesetIdsOnDisk) ||
    changesetIdsOnDisk.length !== 0
  )
    return false;

  const markers = markerCommits.filter(({ subject }) => subject === finalVersionCommitSubject);
  if (
    markers.length !== 1 ||
    markerCommits.indexOf(markers[0]) === 0 ||
    markerCommits.some(({ sha, subject }) => !fullSha.test(sha) || typeof subject !== 'string') ||
    new Set(markerCommits.map(({ sha }) => sha)).size !== markerCommits.length
  )
    return false;

  const names = new Set(packageStates.map(({ name }) => name));
  const manifests = new Set(packageStates.map(({ manifestPath }) => manifestPath));
  if (
    names.size !== 44 ||
    manifests.size !== 44 ||
    !packageStates.every(
      (state) =>
        /^@stynx-nyx\/[a-z0-9-]+$/u.test(state.name) &&
        /^(?:packages|packages-web)\/[^/]+\/package\.json$/u.test(state.manifestPath) &&
        state.baseVersion === finalBaseVersion &&
        state.candidateVersion === finalVersion,
    )
  )
    return false;

  const expected = new Map([['.changeset/pre.json', 'D']]);
  for (const id of basePreState.changesets) {
    if (typeof id !== 'string' || !/^[a-z0-9-]+$/u.test(id)) return false;
    expected.set(`.changeset/${id}.md`, 'D');
  }
  if (expected.size !== basePreState.changesets.length + 1) return false;
  // CTG changesets are added as files after the base; the pre state itself is frozen.
  for (const { path, status } of markerChanges) {
    if (status === 'D' && isChangeset(path) && path !== '.changeset/README.md') {
      expected.set(path, 'D');
    }
  }
  for (const manifestPath of manifests) {
    expected.set(manifestPath, 'M');
    expected.set(manifestPath.replace(/package\.json$/u, 'CHANGELOG.md'), 'M');
  }
  for (const path of allowedVersionSupportPaths) expected.set(path, 'M');
  if (
    markerChanges.length !== expected.size ||
    markerChanges.some(({ path, status }) => expected.get(path) !== status) ||
    new Set(markerChanges.map(({ path }) => path)).size !== markerChanges.length
  )
    return false;

  return followUpChanges.every(
    ({ path, status }) =>
      (status === 'A' || status === 'M') &&
      (/^work\/rounds\/R-0002\/.+/u.test(path) ||
        (status === 'M' && path === 'law/policy/forbidden-action-authorizations.json') ||
        // Exact CI portability repairs discovered by clean remote checkouts.
        // None of these files enters the 44 publishable package tarballs.
        (status === 'M' &&
          [
            '.semgrepignore',
            'law/adr/2026-09-28-final-candidate-ci-repair.md',
            'packages-web/angular-i18n/tsconfig.spec.json',
            'scripts/lib/release-context.mjs',
            'tools/tsconfig/base.json',
          ].includes(path)) ||
        (status === 'A' && path === 'law/adr/2026-09-28-final-candidate-ci-repair.md')),
  );
}

function isExactStablePatchVersionedCandidate(
  {
    baseRootVersion,
    markerParentRootVersion,
    candidateRootVersion,
    markerCommits,
    markerChanges,
    markerParentChangesets,
    followUpChanges,
    rootManifestMatchesMarker,
    packageStates,
    changesetIdsOnDisk,
    preState,
    markerParentPreState,
  },
  {
    baseVersion: expectedBaseVersion = '1.5.0',
    parentVersion: expectedParentVersion,
    candidateVersion: expectedCandidateVersion,
    changesetPaths,
    markerSubject,
    allowedFollowUpPaths,
    allowedAddedFollowUpPaths,
    versionSupportPaths = allowedVersionSupportPaths,
  },
) {
  if (
    baseRootVersion !== expectedBaseVersion ||
    markerParentRootVersion !== expectedParentVersion ||
    candidateRootVersion !== expectedCandidateVersion ||
    preState !== null ||
    markerParentPreState !== null ||
    rootManifestMatchesMarker !== true ||
    !Array.isArray(markerCommits) ||
    !Array.isArray(markerChanges) ||
    !Array.isArray(markerParentChangesets) ||
    !Array.isArray(followUpChanges) ||
    !Array.isArray(packageStates) ||
    packageStates.length !== 44 ||
    !Array.isArray(changesetIdsOnDisk) ||
    changesetIdsOnDisk.length !== 0 ||
    !isDeepStrictEqual([...markerParentChangesets].sort(), [...changesetPaths].sort())
  )
    return false;

  const markers = markerCommits.filter(({ subject }) => subject === markerSubject);
  if (
    markers.length !== 1 ||
    markerCommits.indexOf(markers[0]) === 0 ||
    markerCommits.some(({ sha, subject }) => !fullSha.test(sha) || typeof subject !== 'string') ||
    new Set(markerCommits.map(({ sha }) => sha)).size !== markerCommits.length
  )
    return false;

  const names = new Set(packageStates.map(({ name }) => name));
  const manifests = new Set(packageStates.map(({ manifestPath }) => manifestPath));
  if (
    names.size !== 44 ||
    manifests.size !== 44 ||
    !packageStates.every(
      ({ name, manifestPath, parentVersion, candidateVersion }) =>
        /^@stynx-nyx\/[a-z0-9-]+$/u.test(name) &&
        /^(?:packages|packages-web)\/[^/]+\/package\.json$/u.test(manifestPath) &&
        parentVersion === expectedParentVersion &&
        candidateVersion === expectedCandidateVersion,
    )
  )
    return false;

  const expected = new Map(changesetPaths.map((path) => [path, 'D']));
  for (const manifestPath of manifests) {
    expected.set(manifestPath, 'M');
    expected.set(manifestPath.replace(/package\.json$/u, 'CHANGELOG.md'), 'M');
  }
  for (const path of versionSupportPaths) expected.set(path, 'M');
  if (
    markerChanges.length !== expected.size ||
    markerChanges.some(({ path, status }) => expected.get(path) !== status) ||
    new Set(markerChanges.map(({ path }) => path)).size !== markerChanges.length
  )
    return false;

  return followUpChanges.every(
    ({ path, status }) =>
      (status === 'A' || status === 'M') &&
      (/^work\/rounds\/R-0003\/.+/u.test(path) ||
        (status === 'M' && allowedFollowUpPaths.has(path)) ||
        (status === 'A' && allowedAddedFollowUpPaths?.has(path))),
  );
}

/** The first stable patch remains an exact historical release candidate. */
export function isStablePatchVersionedCandidate(input) {
  return isExactStablePatchVersionedCandidate(input, {
    parentVersion: '1.5.0',
    candidateVersion: '1.5.1',
    changesetPaths: ['.changeset/postrelease-request-path.md'],
    markerSubject: stablePatchVersionCommitSubject,
    allowedFollowUpPaths: allowedStablePatchFollowUpPaths,
  });
}

/** The merged session policy changeset advances the same fixed group to 1.5.2. */
export function isSecondStablePatchVersionedCandidate(input) {
  return isExactStablePatchVersionedCandidate(input, {
    parentVersion: '1.5.1',
    candidateVersion: '1.5.2',
    changesetPaths: ['.changeset/session-policy-http-status.md'],
    markerSubject: secondStablePatchVersionCommitSubject,
    allowedFollowUpPaths: allowedSecondStablePatchFollowUpPaths,
    allowedAddedFollowUpPaths: allowedSecondStablePatchAddedPaths,
  });
}

/**
 * The unpublished 1.5.2 candidate on main consumes eleven changesets into 1.5.3
 * (ADR-DEVAI-ADOPTION-0011); main itself is the 1.5.2 base.
 */
export function isThirdStablePatchVersionedCandidate(input) {
  return isExactStablePatchVersionedCandidate(input, {
    baseVersion: '1.5.2',
    parentVersion: '1.5.2',
    candidateVersion: '1.5.3',
    changesetPaths: thirdStablePatchChangesetPaths,
    markerSubject: thirdStablePatchVersionCommitSubject,
    allowedFollowUpPaths: allowedThirdStablePatchFollowUpPaths,
  });
}

/**
 * The published 1.5.3 main consumes four changesets into 1.5.4
 * (ADR-DEVAI-ADOPTION-0012); main itself is the 1.5.3 base.
 */
export function isFourthStablePatchVersionedCandidate(input) {
  return isExactStablePatchVersionedCandidate(input, {
    baseVersion: '1.5.3',
    parentVersion: '1.5.3',
    candidateVersion: '1.5.4',
    changesetPaths: fourthStablePatchChangesetPaths,
    markerSubject: fourthStablePatchVersionCommitSubject,
    allowedFollowUpPaths: allowedFourthStablePatchFollowUpPaths,
  });
}

/**
 * The unpublished 1.5.4 main consumes one changeset into 1.5.5
 * (ADR-DEVAI-ADOPTION-0015); main itself is the 1.5.4 base.
 */
export function isFifthStablePatchVersionedCandidate(input) {
  return isExactStablePatchVersionedCandidate(input, {
    baseVersion: '1.5.4',
    parentVersion: '1.5.4',
    candidateVersion: '1.5.5',
    changesetPaths: fifthStablePatchChangesetPaths,
    markerSubject: fifthStablePatchVersionCommitSubject,
    allowedFollowUpPaths: allowedFifthStablePatchFollowUpPaths,
  });
}

/**
 * The published 1.5.5 main consumes the slice-2 changesets into 1.5.6
 * (ADR-DEVAI-ADOPTION-0016); main itself is the 1.5.5 base.
 */
export function isSixthStablePatchVersionedCandidate(input) {
  return isExactStablePatchVersionedCandidate(input, {
    baseVersion: '1.5.5',
    parentVersion: '1.5.5',
    candidateVersion: '1.5.6',
    changesetPaths: sixthStablePatchChangesetPaths,
    markerSubject: sixthStablePatchVersionCommitSubject,
    allowedFollowUpPaths: allowedSixthStablePatchFollowUpPaths,
  });
}

/**
 * The published 1.5.6 main consumes the slice-3 changesets into 1.5.7
 * (ADR-DEVAI-ADOPTION-0018); main itself is the 1.5.6 base.
 */
export function isSeventhStablePatchVersionedCandidate(input) {
  return isExactStablePatchVersionedCandidate(input, {
    baseVersion: '1.5.6',
    parentVersion: '1.5.6',
    candidateVersion: '1.5.7',
    changesetPaths: seventhStablePatchChangesetPaths,
    markerSubject: seventhStablePatchVersionCommitSubject,
    allowedFollowUpPaths: allowedSeventhStablePatchFollowUpPaths,
  });
}

/** The reviewed 1.6.1 patch retains closed marker and follow-up admission. */
export function isPatch161VersionedCandidate(input) {
  if (
    !input ||
    !Array.isArray(input.markerChanges) ||
    !Array.isArray(input.followUpChanges) ||
    !Array.isArray(input.storageVersionArtifacts) ||
    !input.rootManifestAtMarker ||
    !input.rootManifestAtHead ||
    input.rootManifestAtMarker.version !== '1.6.1' ||
    input.rootManifestAtHead.version !== '1.6.1' ||
    input.rootManifestAtMarker.devDependencies?.['@aarusso-nyx/devai'] !== '2.6.0' ||
    input.rootManifestAtHead.devDependencies?.['@aarusso-nyx/devai'] !== '2.6.1'
  )
    return false;

  const expectedRootManifest = {
    ...input.rootManifestAtMarker,
    devDependencies: {
      ...input.rootManifestAtMarker.devDependencies,
      '@aarusso-nyx/devai': '2.6.1',
    },
  };
  if (
    !isDeepStrictEqual(input.rootManifestAtHead, expectedRootManifest) ||
    new Set(input.followUpChanges.map(({ path }) => path)).size !== input.followUpChanges.length ||
    input.followUpChanges.some(
      ({ path, status }) => patch161FollowUpStatuses.get(path) !== status,
    ) ||
    input.storageVersionArtifacts.some(
      ({ baseVersion, version }) => baseVersion !== '1.6.0' || version !== '1.6.1',
    )
  )
    return false;

  try {
    validateStorageVersionChanges(input.markerChanges, input.storageVersionArtifacts);
  } catch (error) {
    if (error instanceof ReleaseContextError) return false;
    throw error;
  }
  if (input.storageVersionArtifacts.length !== versionedStorageTemplates.length) return false;

  return isExactStablePatchVersionedCandidate(
    {
      ...input,
      rootManifestMatchesMarker: true,
      markerChanges: input.markerChanges.filter(
        ({ path }) => !versionedStorageTemplates.some((template) => template.path === path),
      ),
    },
    {
      baseVersion: '1.6.0',
      parentVersion: '1.6.0',
      candidateVersion: '1.6.1',
      changesetPaths: ['.changeset/offline-acceptance-evidence.md'],
      markerSubject: patch161VersionCommitSubject,
      allowedFollowUpPaths: new Set(patch161FollowUpStatuses.keys()),
      allowedAddedFollowUpPaths: new Set(
        [...patch161FollowUpStatuses].filter(([, status]) => status === 'A').map(([path]) => path),
      ),
    },
  );
}

/** The 1.6.2 marker and its reviewed post-marker population are closed. */
export function isPatch162VersionedCandidate(input) {
  if (
    !input ||
    !Array.isArray(input.markerChanges) ||
    !Array.isArray(input.followUpChanges) ||
    !Array.isArray(input.storageVersionArtifacts) ||
    !input.rootManifestAtMarker ||
    !input.rootManifestAtHead ||
    input.rootManifestAtMarker.version !== '1.6.2' ||
    input.rootManifestAtHead.version !== '1.6.2' ||
    input.rootManifestAtMarker.devDependencies?.['@aarusso-nyx/devai'] !== '2.6.1' ||
    input.rootManifestAtHead.devDependencies?.['@aarusso-nyx/devai'] !== '2.6.2'
  )
    return false;

  const expectedRootManifest = {
    ...input.rootManifestAtMarker,
    devDependencies: {
      ...input.rootManifestAtMarker.devDependencies,
      '@aarusso-nyx/devai': '2.6.2',
    },
  };
  if (
    !isDeepStrictEqual(input.rootManifestAtHead, expectedRootManifest) ||
    input.followUpChanges.length !== patch162FollowUpStatuses.size ||
    new Set(input.followUpChanges.map(({ path }) => path)).size !== input.followUpChanges.length ||
    input.followUpChanges.some(
      ({ path, status }) => patch162FollowUpStatuses.get(path) !== status,
    ) ||
    input.storageVersionArtifacts.some(
      ({ baseVersion, version }) => baseVersion !== '1.6.1' || version !== '1.6.2',
    )
  )
    return false;

  try {
    validateStorageVersionChanges(input.markerChanges, input.storageVersionArtifacts);
  } catch (error) {
    if (error instanceof ReleaseContextError) return false;
    throw error;
  }
  if (input.storageVersionArtifacts.length !== versionedStorageTemplates.length) return false;

  return isExactStablePatchVersionedCandidate(
    {
      ...input,
      rootManifestMatchesMarker: true,
      markerChanges: input.markerChanges.filter(
        ({ path }) => !versionedStorageTemplates.some((template) => template.path === path),
      ),
    },
    {
      baseVersion: '1.6.1',
      parentVersion: '1.6.1',
      candidateVersion: '1.6.2',
      changesetPaths: ['.changeset/contracts-built-barrel-smoke.md'],
      markerSubject: patch162VersionCommitSubject,
      allowedFollowUpPaths: new Set(patch162FollowUpStatuses.keys()),
      allowedAddedFollowUpPaths: new Set(
        [...patch162FollowUpStatuses].filter(([, status]) => status === 'A').map(([path]) => path),
      ),
      versionSupportPaths: patch162VersionSupportPaths,
    },
  );
}

export function classifyReleaseContext({
  baseCommit,
  headCommit,
  commits,
  versionParent,
  versionChanges,
  followUpChanges,
  rootManifestFollowUpValid,
  versionRebaselineValid = false,
  storageVersionArtifacts = [],
}) {
  if (!fullSha.test(baseCommit) || !fullSha.test(headCommit)) {
    fail('RELEASE_CONTEXT_IDENTITY', 'base and head must be full commit SHAs');
  }

  const versionCommits = commits.filter((commit) => commit.subject === versionCommitSubject);
  if (versionCommits.length === 0) {
    // The 1.1.1 "PR A" campaign-preparation classification was retired with the
    // campaign policy it was bound to. A candidate without a version-packages
    // commit is now simply ordinary.
    return { kind: 'ordinary', baseCommit, headCommit };
  }
  if (versionCommits.length !== 1) {
    fail('RELEASE_CONTEXT_AMBIGUOUS', 'candidate contains multiple version-package commits');
  }

  const versionCommit = versionCommits[0];
  if (commits[0]?.sha !== versionCommit.sha || versionParent !== baseCommit) {
    fail(
      'RELEASE_CONTEXT_BASE_MISMATCH',
      'version-package commit must be the direct first-parent child of origin/main',
    );
  }

  const counts = validateVersionChanges(
    versionChanges,
    versionRebaselineValid,
    storageVersionArtifacts,
  );
  validateFollowUpChanges(followUpChanges, rootManifestFollowUpValid);

  return {
    kind: 'version-pr',
    baseCommit,
    headCommit,
    versionCommit: versionCommit.sha,
    ...counts,
  };
}

export const releaseContextConstants = Object.freeze({
  releaseStatusCommand,
  versionCommitSubject,
  finalVersionCommitSubject,
  stablePatchVersionCommitSubject,
  secondStablePatchVersionCommitSubject,
  thirdStablePatchVersionCommitSubject,
  fourthStablePatchVersionCommitSubject,
  fifthStablePatchVersionCommitSubject,
  sixthStablePatchVersionCommitSubject,
  seventhStablePatchVersionCommitSubject,
  patch161VersionCommitSubject,
  patch162VersionCommitSubject,
  unifiedRebaselineVersion,
  releasePreparationCommand: 'node scripts/run-release-preparation.mjs',
  versionPackagesCommand: 'node scripts/version-packages.mjs',
});
