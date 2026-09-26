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

test('DEVAI 1.5.6 identity, Constitution 1.0.1, and profile 1.4.0 stay exact', () => {
  const expectedConstitutionDigest =
    'ff8c4f099a284b1b42f980742b20c849379ba4e3f357905f36a87648ae3fdeae';
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
    policy_version: '1.1.0',
    authority: 'Architect',
    description: identity.description,
    registry: 'https://npm.pkg.github.com',
    package: '@aarusso-nyx/devai',
    version: '1.5.6',
    tarball:
      'https://npm.pkg.github.com/download/@aarusso-nyx/devai/1.5.6/6cfa2d77138e41d50b6864eddfc983a35f25de68',
    integrity:
      'sha512-8hU4Krnuy5mEg98dqAs5za9v9+/5L8KbH/GCftkVLyqmpE1ipQqm0ux/2Ltinx9ZkeaBDdXFhwwjkUy3rwJg4A==',
    shasum: '6cfa2d77138e41d50b6864eddfc983a35f25de68',
    sha256: 'a2f4fbca03cac1a893f059eb0cacbc7466aa0dae1a5903ec99e60bdbe8618752',
    source_commit: '0fe5689ce0091cdcb5675b576d9c5be2139ee4ef',
    source_tree: 'e3abb760f20989d0e06721cdd96065814667259d',
    signed_tag_object: '3aba4a1066282b77e2c0b4e233033a39dc477f56',
  });
  assert.equal(manifest.devDependencies['@aarusso-nyx/devai'], '1.5.6');
  assert.equal(installedManifest.version, '1.5.6');
  assert.deepEqual(project.constitution, {
    version: '1.0.1',
    sha256: expectedConstitutionDigest,
  });
  assert.equal(project.devai_version, '1.5.6');
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

  assert.equal(verifierPolicy.package.version, '1.5.4');
  assert.equal(
    verifierPolicy.verifier.provenance_sha256,
    '1035c8aad52f4b2beb6a6f010106a4d1866c92dadf3fbae1c6e36e1a4d2ceddf',
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

  assert.deepEqual(
    trust.trustedSigners.map((signer) => signer.signerId),
    ['stynx-inspector-workstation-02'],
  );
  assert.deepEqual(trust.revokedSignerIds, []);
  assert.match(trust.trustedSigners[0].publicKeyPem, /^-----BEGIN PUBLIC KEY-----\n/u);
  assert.doesNotMatch(JSON.stringify(trust), /PRIVATE/u);

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
