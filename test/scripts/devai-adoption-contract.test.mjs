import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  discoverMutationRoster,
  verifyNoRemoteMutationWorkflows,
} from '../../scripts/lib/mutation-roster.mjs';

const repoRoot = resolve(import.meta.dirname, '..', '..');

function readJson(path) {
  return JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
}

function taskClosure(descriptor, roots) {
  const byId = new Map(descriptor.tasks.map((task) => [task.nodeId, task]));
  const closure = new Set();
  const pending = [...roots];
  while (pending.length > 0) {
    const nodeId = pending.shift();
    assert.equal(byId.has(nodeId), true, `unknown task node ${nodeId}`);
    if (closure.has(nodeId)) continue;
    closure.add(nodeId);
    pending.push(...byId.get(nodeId).dependencies);
  }
  return closure;
}

test('DEVAI 2.3.2 identity, Constitution 1.0.2, and profile 1.4.0 stay exact', () => {
  const expectedConstitutionDigest =
    'd7f8791f1d00a7247bced66bdcdf8b1af431bb57e49d03b6ddd7024cb52f957d';
  const identity = readJson('law/policy/devai-package-identity.json');
  const manifest = readJson('package.json');
  const installedManifest = readJson('node_modules/@aarusso-nyx/devai/package.json');
  const project = readJson('.devai/config/project.json');
  const profile = readJson('.devai/config/release-verification.json');
  const adoption = readJson('law/policy/devai-adoption.json');
  const pinnedConstitution = readFileSync(join(repoRoot, '.devai/pin/constitution.md'));

  assert.deepEqual(identity, {
    schemaVersion: '1.0.0',
    policy_id: 'stynx.devai-package-identity',
    policy_version: '1.4.0',
    authority: 'Architect',
    description: identity.description,
    registry: 'https://npm.pkg.github.com',
    package: '@aarusso-nyx/devai',
    version: '2.3.2',
    tarball:
      'https://npm.pkg.github.com/download/@aarusso-nyx/devai/2.3.2/57d145a81f2eae2af30c2e78626ab1f6426c8be8',
    integrity:
      'sha512-WxjOpsUfvWAQFMHNltq18U352Nsa57OKY/TgHHuKycY6SxWNqpBeagKOLDSzWjc0fjRgAuApG9XAjL3UQcBCyg==',
    shasum: '57d145a81f2eae2af30c2e78626ab1f6426c8be8',
    sha256: 'df04bfae94257ecc406ca9da0d8b4a83fd1016885bd93144f4b82e9684ec4645',
    source_commit: '915db68119461af83e03e28febf28a139a5a5de9',
    source_tree: '8e0954e7908219fd345681dde18a2566472c4a61',
    signed_tag_object: 'e2eeff23933658d711f1195a9c6804c43a666128',
  });
  assert.equal(manifest.devDependencies['@aarusso-nyx/devai'], '2.3.2');
  assert.equal(installedManifest.version, '2.3.2');
  assert.deepEqual(project.constitution, {
    version: '1.0.2',
    sha256: expectedConstitutionDigest,
  });
  assert.equal(project.devai_version, '2.3.2');
  assert.equal(
    createHash('sha256').update(pinnedConstitution).digest('hex'),
    expectedConstitutionDigest,
  );
  assert.equal(profile.schemaVersion, '1.4.0');
  assert.equal(profile.policy_version, '1.4.0');
  assert.deepEqual(profile.mutation_roster, []);
  assert.equal(Object.hasOwn(profile, 'mutation_execution'), false);
  assert.deepEqual(profile, adoption.release_verification);
});

test('DEVAI 2.3.2 ownership-matrix bind keeps the attested RC gate and GitHub host identity', () => {
  const project = readJson('.devai/config/project.json');
  const adoption = readJson('law/policy/devai-adoption.json');
  const binding = readJson('.devai/config/adopter-policy-binding.json');
  const authority = readJson('.devai/config/authority-policy.json');
  const githubAdapter = readJson('.devai/config/github-actions-host-adapter.json');
  const postMergeAdapter = readJson('.devai/config/post-merge-host-adapter.json');
  const scorecardNa = readJson('.devai/config/scorecard-na.json');

  assert.deepEqual(project.ci_economy, adoption.ci_economy);
  assert.equal(project.ci_economy.attested_rc.required_check, 'verified-local-rc');
  assert.equal(binding.policy_version, adoption.policy_version);
  assert.deepEqual(binding.retired_keys, []);
  assert.equal(Object.hasOwn(binding, 'authority_extension'), false);
  assert.deepEqual(project.authority_enforcement, {
    mode: 'host-integrated',
    adapter_config: '.devai/config/github-actions-host-adapter.json',
  });
  assert.deepEqual(authority.host_enforcement, {
    adapter: { adapter_id: 'github-actions-main-observation', adapter_version: '2.3.2' },
    mode: 'host-integrated',
  });
  assert.equal(authority.framework_package.version, '2.3.2');
  assert.equal(githubAdapter.package_binding.version, '2.3.2');
  // Since DEVAI 2.1.0 the tracked post-merge file is a path-free declaration;
  // the checkout-bound attestation lives in <git-dir>/devai of the bound checkout.
  assert.deepEqual(postMergeAdapter, {
    schemaVersion: '2.0.0',
    adapter_id: 'post-merge-host-adapter',
    adapter_kind: 'installed-checkout',
    required: true,
    local_state: 'git-dir',
    bind_command:
      'devai init bind --target . --host-adapter post-merge --as-role architect --write',
  });
  assert.equal(
    createHash('sha256')
      .update(readFileSync(join(repoRoot, githubAdapter.workflow_path)))
      .digest('hex'),
    githubAdapter.workflow_digest_sha256,
  );
  assert.deepEqual(
    scorecardNa.cells.map((entry) => entry.cell),
    ['F1:T1', 'F4:T5'],
  );
});

test('mandatory profiles and release capabilities cannot reach optional mutation hardening', () => {
  const descriptor = readJson('test-tasks.json');
  const profile = readJson('.devai/config/release-verification.json');
  const taskById = new Map(descriptor.tasks.map((task) => [task.nodeId, task]));
  const releaseRoots = Object.values(profile.capability_tasks).flat();

  assert.equal(taskById.has('test:mutation'), true, 'manual mutation node must remain available');
  assert.equal(descriptor.profiles.length > 0, true);
  for (const candidate of descriptor.profiles) {
    const roots = [...candidate.requiredNodes, ...(candidate.eligibleNodes ?? [])];
    assert.equal(
      taskClosure(descriptor, roots).has('test:mutation'),
      false,
      `${candidate.profileId} reaches mutation`,
    );
  }
  assert.equal(taskClosure(descriptor, releaseRoots).has('test:mutation'), false);

  for (const nodeId of taskClosure(descriptor, releaseRoots)) {
    const task = taskById.get(nodeId);
    assert.equal(task.outputContract.kind, 'command', `${nodeId} must remain an ordinary gate`);
    assert.equal(task.outputContract.requiredResult, 'pass', `${nodeId} failure must block`);
    assert.doesNotMatch(JSON.stringify(task), /mutation-report|test:mutation/u);
  }
});

test('DEVAI release policy reports mutation none/not-required and ignores mutation evidence health', () => {
  const lifecycle = readJson(
    'node_modules/@aarusso-nyx/devai/dist/law/policy/release-lifecycle.json',
  );
  const strength = readJson(
    'node_modules/@aarusso-nyx/devai/dist/law/policy/mutation-strength.json',
  );

  assert.deepEqual(lifecycle.plan_determination.mutation_selection, [
    'always-selects-none',
    'always-not-required-reason-mutation-external-hardening',
    'no-transition-support-risk-or-owner-escalation-may-require-mutation-testing',
  ]);
  assert.equal(lifecycle.plan_determination.blocked_receipt.mutation, 'none');
  assert.equal(strength.status, 'deprecated-external-hardening');
  assert.equal(strength.applicability.unselected_scope, 'not-required-mutation-external-hardening');
  assert.equal(strength.unknown.blocks_required_readiness, false);
  assert.equal(strength.unknown.is_fail, false);
  assert.deepEqual(strength.unknown.conditions, [
    'missing-evidence',
    'runner-unavailable',
    'timeout',
    'crash',
    'infrastructure-error',
    'incomplete-selection',
    'empty-selection',
    'invalid-report',
    'exact-subject-mismatch',
    'independently-uncheckable-result',
  ]);
  assert.equal(strength.prohibitions.includes('mutation-results-as-delivery-requirement'), true);
  assert.equal(strength.prohibitions.includes('mutation-testing-in-ci'), true);
});

test('manual mutation command, 38 Stryker targets, and threshold floor remain intact', () => {
  const manifest = readJson('package.json');
  const { roster, failures } = discoverMutationRoster(repoRoot);

  assert.equal(manifest.scripts['test:mutation'], 'node scripts/run-mutation-evidence.mjs');
  assert.deepEqual(failures, []);
  assert.equal(roster.length, 38);
  assert.equal(new Set(roster.map((entry) => entry.config)).size, 38);
  assert.equal(new Set(roster.map((entry) => entry.packageName)).size, 38);
  for (const entry of roster) {
    assert.equal(entry.thresholds.break >= 90, true, `${entry.packageName} threshold regressed`);
    assert.match(entry.script, /stryker/u);
  }
});

test('remote workflows and their transitive npm scripts never execute mutation', () => {
  const result = verifyNoRemoteMutationWorkflows(repoRoot);
  assert.equal(result.workflowCount > 0, true);
});

test('trusted local RC ledger gate pins the DEVAI-designated verifier and admitted controls', () => {
  const verifierPolicy = readJson(
    'node_modules/@aarusso-nyx/devai/dist/law/policy/trusted-local-rc-verifier-package.json',
  );
  const workflow = readFileSync(
    join(repoRoot, '.github/workflows/devai-local-rc-verify.yml'),
    'utf8',
  );
  const trust = readJson('law/policy/devai-local-rc-trust-store.json');
  const toolchain = readJson('law/policy/devai-local-rc-toolchain.json');
  const environment = readJson('law/policy/devai-local-rc-environment.json');
  const manifest = readJson('package.json');
  const project = readJson('.devai/config/project.json');
  const localRcScript = readFileSync(join(repoRoot, 'scripts/devai-local-rc.mjs'), 'utf8');

  assert.equal(verifierPolicy.package.version, '1.9.0');
  assert.equal(
    verifierPolicy.verifier.provenance_sha256,
    '302161f378e54d0a2b14b743a68577f4bfc43a147a1f17568941e08e14e767a0',
  );
  for (const pinned of [
    verifierPolicy.package.tarball,
    verifierPolicy.package.shasum_sha1,
    verifierPolicy.package.integrity_sri,
    verifierPolicy.package.release_source.commit,
    verifierPolicy.package.release_source.tree,
    verifierPolicy.verifier.provenance_sha256,
    verifierPolicy.verifier.source_commit,
    'vars.DEVAI_LEDGER_VERIFIER_PROVENANCE_SHA256',
    'binding=exact-tree',
    '--arg name verified-local-rc',
  ]) {
    assert.equal(workflow.includes(pinned), true, `workflow must pin ${pinned}`);
  }
  assert.doesNotMatch(workflow, /pull_request|pnpm |npm run|test:mutation/u);

  assert.deepEqual(trust.trustedSigners, [
    {
      signerId: 'stynx-inspector-workstation-02',
      publicKeyPem:
        '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA6cwlyFPuBL/efzudmLlme8kUw/IgchJkyBQtulzF34o=\n-----END PUBLIC KEY-----\n',
    },
    {
      signerId: 'stynx-inspector-workstation-03',
      publicKeyPem:
        '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAcRwyrPeNji9XGCGPciFEBg7u1pqEIbyI8MWrBSGDYhE=\n-----END PUBLIC KEY-----\n',
    },
  ]);
  assert.deepEqual(trust.revokedSignerIds, []);
  for (const signer of trust.trustedSigners) {
    assert.match(
      signer.publicKeyPem,
      /^-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA[A-Za-z0-9+/]{43}=\n-----END PUBLIC KEY-----\n$/u,
      `${signer.signerId} must be admitted with an Ed25519 public key`,
    );
  }
  assert.doesNotMatch(JSON.stringify(trust), /PRIVATE/u);

  assert.match(
    localRcScript,
    /const signerId = 'stynx-inspector-workstation-03';/u,
    'local RC exports must use the recovered signer',
  );
  assert.match(
    localRcScript,
    /export-cli\.js[\s\S]*?'--signer-id',\s*signerId,/u,
    'the RC export must pass the pinned recovered signer ID',
  );
  assert.match(
    localRcScript,
    /publish-cli\.js[\s\S]*?'--signer-id',\s*signerId,/u,
    'the RC publisher must pass the pinned recovered signer ID',
  );

  assert.deepEqual(Object.keys(toolchain).sort(), [
    'node',
    'pnpm',
    'postgres',
    'typescript',
    'vitest',
  ]);
  assert.equal(environment.NODE_AUTH_TOKEN, null, 'no registry credential digest is admitted');
  for (const value of Object.values(environment)) {
    assert.equal(value === null || /^sha256:[0-9a-f]{64}$/u.test(value), true);
  }

  assert.equal(manifest.scripts['devai:rc:prepare'], 'node scripts/devai-local-rc.mjs prepare');
  assert.equal(manifest.scripts['devai:rc:publish'], 'node scripts/devai-local-rc.mjs publish');
  assert.deepEqual(project.ci_economy.attested_rc, {
    profile: 'rc',
    transport: 'protected-tag-v1',
    tag_prefix: 'devai-local-evidence/',
    binding: 'exact-tree',
    required_check: 'verified-local-rc',
    failure_mode: 'fail-closed',
    local_only_nodes: ['test:mutation'],
  });
});
