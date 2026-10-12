import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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

function digestFile(path) {
  return createHash('sha256')
    .update(readFileSync(join(repoRoot, path)))
    .digest('hex');
}

function installedCli(args) {
  const manifest = readJson('node_modules/@aarusso-nyx/devai/package.json');
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, 'node_modules/@aarusso-nyx/devai', manifest.bin.devai), ...args],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function historicalBytes(commit, path) {
  const result = spawnSync('git', ['show', `${commit}:${path}`], {
    cwd: repoRoot,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
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

test('DEVAI 2.6.0 identity, Constitution 1.0.2, and profile 1.4.0 stay exact', () => {
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
    policy_version: '1.7.0',
    authority: 'Architect',
    description: identity.description,
    registry: 'https://npm.pkg.github.com',
    package: '@aarusso-nyx/devai',
    version: '2.6.0',
    tarball:
      'https://npm.pkg.github.com/download/@aarusso-nyx/devai/2.6.0/f763c5168c26cb1001ab16d78e41606fef4899d5',
    integrity:
      'sha512-oqHqd5p7ILm6zXxcAPuEZS1V5m53epgMzWBrqBQmhJDcOdSCnt04GFOFAAIA44TE69b3QyzyDxMYqnJkoqPj0w==',
    shasum: 'f763c5168c26cb1001ab16d78e41606fef4899d5',
    sha256: 'd2b19a7e4004204ada80cc9b21cd55dfbe4a97f6e6b2f26004dfc7db324bcc02',
    source_commit: 'e1b56483da2592e9af1ef82cae5a752ba82f004f',
    source_tree: '252e6851865640539ffc17cab41854d0716a01e1',
    signed_tag_object: 'f126f66693c4e9d720f1e2ab1155fe943b6de520',
  });
  assert.equal(manifest.devDependencies['@aarusso-nyx/devai'], '2.6.0');
  assert.equal(installedManifest.version, '2.6.0');
  assert.deepEqual(project.constitution, {
    version: '1.0.2',
    sha256: expectedConstitutionDigest,
  });
  assert.equal(project.devai_version, '2.6.0');
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

test('DEVAI 2.6.0 ownership-matrix bind keeps the attested RC gate and both host identities', () => {
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
  assert.deepEqual(binding.authority_extension, {
    extension_id: 'stynx.client-path-authority',
    extension_version: '1.6.2',
    digest_sha256: '71250d8d742f93a81afee5ad931b5bb7f68497d6025d0a645b283932f06c8901',
    rule_count: 68,
  });
  assert.deepEqual(adoption.authority.roots, ['domain', 'reference', 'test', 'tools']);
  const clientRules = authority.rules.filter(({ rule_id }) => rule_id.startsWith('adopter-path-'));
  assert.equal(clientRules.length, 68);
  assert.equal(
    clientRules.every(({ origin }) => origin === 'additive-extension'),
    true,
  );
  assert.deepEqual(authority.additive_extensions.at(-1), {
    extension_id: binding.authority_extension.extension_id,
    extension_version: binding.authority_extension.extension_version,
    digest_sha256: binding.authority_extension.digest_sha256,
  });
  assert.deepEqual(project.authority_enforcement, {
    mode: 'host-integrated',
    adapter_config: '.devai/config/post-merge-host-adapter.json',
  });
  assert.deepEqual(authority.host_enforcement, {
    adapter: { adapter_id: 'post-merge-host-adapter', adapter_version: '2.6.0' },
    mode: 'host-integrated',
  });
  assert.equal(authority.framework_package.version, '2.6.0');
  assert.equal(githubAdapter.package_binding.version, '2.6.0');
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

test('historical 2.5.0 upgrade receipt and later approved rebindings retain every exact digest', () => {
  const adoption = readJson('law/policy/devai-adoption.json');
  const binding = readJson('.devai/config/adopter-policy-binding.json');
  const receipt = JSON.parse(
    historicalBytes(
      'cd0542143ad21e59551cbf3936d99c48647b2e78',
      '.devai/config/upgrade-receipt.json',
    ),
  );
  const sensors = readJson('.devai/config/sensor-inputs.json');

  assert.deepEqual(sensors, adoption.sensor_inputs);
  assert.equal(binding.policy_id, adoption.policy_id);
  assert.equal(binding.policy_version, '1.6.2');
  assert.equal(binding.source_path, 'law/policy/devai-adoption.json');
  assert.equal(binding.source_digest_sha256, digestFile(binding.source_path));
  assert.deepEqual(Object.keys(binding.materialized).sort(), [
    '.devai/config/domains.json',
    '.devai/config/glob-guards.json',
    '.devai/config/project.json',
    '.devai/config/release-verification.json',
    '.devai/config/scorecard-na.json',
    '.devai/config/sensor-inputs.json',
    '.devai/config/thresholds.json',
  ]);
  for (const [path, digest] of Object.entries(binding.materialized)) {
    assert.equal(digestFile(path), digest, `policy binding changed: ${path}`);
  }
  assert.equal(receipt.schemaVersion, '1.0.0');
  assert.equal(receipt.from, '2.4.0');
  assert.equal(receipt.to, '2.5.0');
  assert.equal(Number.isFinite(Date.parse(receipt.upgraded_at)), true);
  assert.deepEqual(receipt.constitution, { from: '1.0.2', to: '1.0.2' });
  assert.deepEqual(receipt.migrations, [
    'MIG-2.5.0-audit-interface-projections',
    'MIG-2.5.0-complete-test-result-population',
    'MIG-2.5.0-trusted-verifier-2-4',
  ]);
  assert.deepEqual(receipt.retired_keys, []);
  assert.deepEqual(receipt.obligations, []);
  assert.deepEqual(receipt.changed_files.map(({ path }) => path).sort(), [
    '.devai/config/adopter-policy-binding.json',
    '.devai/config/authority-policy.json',
    '.devai/config/github-actions-host-adapter.json',
    '.devai/config/project.json',
    '.devai/config/subprocess-effects.json',
    '.devai/constitution.md',
    '.github/workflows/devai-local-rc-verify.yml',
  ]);
  // The upgrade receipt is immutable history. Subsequent registered host/policy
  // bindings have their own exact bytes; they cannot rewrite upgrade history.
  assert.equal(
    createHash('sha256')
      .update(
        historicalBytes(
          'cd0542143ad21e59551cbf3936d99c48647b2e78',
          '.devai/config/upgrade-receipt.json',
        ),
      )
      .digest('hex'),
    'ba94641c2870f6353bd08ba220cd58f2f230c82f99dc68adbf36abdb8142be14',
  );
  const rebound = {
    '.devai/config/project.json':
      '25002fc1e03d60103d9972e4fd7064f5d861a6af6c49c08ea90d5fb029d4ae5e',
    '.devai/config/authority-policy.json':
      '1c065a4bcdf550170c4dced93a6e9da77fab387cd181279b2d3648499c988fb0',
    '.devai/config/adopter-policy-binding.json':
      'd48fca1ca99819c259fd574d5f042d9e9bb948bdc3baf04252a3d9193dd2ec84',
  };
  for (const entry of receipt.changed_files) {
    assert.equal(entry.operation, 'update');
    const historical = spawnSync(
      'git',
      ['show', `cd0542143ad21e59551cbf3936d99c48647b2e78:${entry.path}`],
      { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 },
    );
    assert.equal(historical.error, undefined);
    assert.equal(historical.signal, null);
    assert.equal(historical.status, 0, historical.stderr.toString());
    assert.equal(
      createHash('sha256').update(historical.stdout).digest('hex'),
      entry.sha256,
      `historical upgrade output changed: ${entry.path}`,
    );
    assert.equal(
      createHash('sha256')
        .update(historicalBytes('1af7adb2944f615737d0128e3e43a8b94a894608', entry.path))
        .digest('hex'),
      rebound[entry.path] ?? entry.sha256,
      `historical registered binding changed: ${entry.path}`,
    );
  }
  assert.deepEqual(receipt.postchecks, [
    { name: 'policy-materialization-current', ok: true },
    { name: 'authority-enforcement', ok: true },
    { name: 'constitution-binding', ok: true },
  ]);
});

test('supported sensor projection retains reviewed populations and the unmeasured legacy command', () => {
  const { inputs, surfaces } = readJson('.devai/config/sensor-inputs.json');
  const descriptor = readJson('test-tasks.json');
  const testRoots = [
    'packages/*/test',
    'packages-web/*/test',
    'reference/*/test',
    'domain/*/api/test',
    'domain/*/web/test',
    'test',
    'tools',
    'infra',
    'scripts',
  ];
  for (const kind of [
    'test_security_coverage',
    'test_performance_coverage',
    'test_robustness_coverage',
    'test_idiomaticity',
  ]) {
    assert.deepEqual(inputs[kind].testGlobs, testRoots, `${kind} must search all owned roots`);
  }
  assert.deepEqual(inputs.type_check, { argv: ['pnpm', 'typecheck'] });
  // This adoption intentionally keeps the reviewed legacy command unmeasured.
  // Supported task syntax alone cannot provide a verified execution receipt.
  for (const task of descriptor.tasks) {
    assert.equal(Object.hasOwn(task, 'sensorKinds'), false);
  }
  assert.deepEqual(surfaces, { http: true, database: true, rbac: true, actions: false });
  assert.deepEqual(inputs.inventory_routes, {
    framework: 'angular',
    scanDirs: [
      'reference/web/src',
      'packages-web/angular-flow/src',
      'packages-web/angular-iam/src',
      'packages-web/angular-profile/src',
      'packages-web/angular-audit/src',
    ],
  });
  for (const [kind, minimumSample] of [
    ['harness_green_main', 20],
    ['harness_performance', 10],
    ['harness_robustness', 20],
  ]) {
    assert.deepEqual(inputs[kind], {
      workflow: 'ci.yml',
      event: 'pull_request',
      headBranch: '*',
      baseBranch: 'main',
      attempts: 'last',
      includeCancelled: false,
      lookbackDays: 30,
      minimumSample,
      ...(kind === 'harness_green_main' ? { outcomeUnit: 'pull-request-final-head' } : {}),
      excludedJobs: [],
    });
  }
});

test('installed DEVAI CLI reads the exact binding as current without rewriting adoption or evidence', () => {
  const tracked = spawnSync('git', ['ls-files', '-z', '.devai', 'record', 'law/policy'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(tracked.status, 0, tracked.stderr);
  const paths = tracked.stdout.split('\0').filter(Boolean);
  assert.equal(paths.includes('.devai/config/upgrade-receipt.json'), true);
  assert.equal(paths.includes('record/proofs/chain.json'), true);
  const before = new Map(paths.map((path) => [path, digestFile(path)]));
  assert.match(installedCli(['--version']), /^devai\/2\.6\.0\s/u);
  const planned = JSON.parse(
    installedCli([
      'init',
      'upgrade',
      '--target',
      '.',
      '--as-role',
      'architect',
      '--format',
      'json',
    ]),
  );
  assert.equal(planned.ok, true);
  const { plan } = planned.result.value;
  assert.equal(plan.from, '2.6.0');
  assert.equal(plan.to, '2.6.0');
  assert.equal(plan.status, 'no-op');
  assert.equal(plan.receipt, 'current');
  assert.deepEqual(plan.changed_files, []);
  assert.deepEqual(plan.refusals, []);
  assert.deepEqual(plan.retired_keys, []);
  assert.deepEqual(plan.obligations, []);
  assert.equal(plan.interrupted_bind, false);
  assert.equal(
    plan.segments.every(({ run }) => run === false),
    true,
  );
  assert.deepEqual(plan.constitution, {
    bound: '1.0.2',
    installed: '1.0.2',
    rebind_requested: false,
  });
  const doctor = JSON.parse(installedCli(['doctor', '--repo-root', '.', '--format', 'json']));
  assert.equal(doctor.ok, true);
  assert.equal(doctor.result.value.ok, true);
  const checks = new Map(doctor.result.value.checks.map((check) => [check.name, check]));
  assert.equal(checks.size, 16);
  assert.equal(doctor.result.value.checks.length, checks.size);
  assert.equal(
    doctor.result.value.checks.every(({ ok }) => ok === true),
    true,
  );
  for (const name of [
    'adopter-execution-readiness',
    'policy-materialization-current',
    'evidence-chain-valid',
    'devai-version-match',
    'authority-enforcement',
    'constitution-binding',
    'trusted-local-rc-boundary',
  ]) {
    assert.equal(checks.get(name)?.ok, true, `installed Doctor refuses ${name}`);
  }
  assert.deepEqual(checks.get('adopter-execution-readiness').info, {
    status: 'not-required',
    standing: 'diagnostic-only',
    bindings: [],
  });
  assert.deepEqual(checks.get('policy-materialization-current').info.mismatches, []);
  assert.equal(checks.get('devai-version-match').info.running, '2.6.0');
  assert.equal(checks.get('devai-version-match').info.pinned, '2.6.0');
  assert.equal(checks.get('authority-enforcement').info.selected_adapter_policy_bound, true);
  assert.equal(checks.get('authority-enforcement').info.local_post_merge_enforced, true);
  assert.equal(checks.get('authority-enforcement').info.github_actions_enforced, true);
  for (const [field, facts] of [
    [
      'local_post_merge_facts',
      [
        'hook_present',
        'key_present',
        'attestation_present',
        'declaration_present',
        'policy_present',
        'declaration_current',
        'hook_local_binary',
        'local_binary_present',
        'local_binary_version',
        'key_private',
        'signature_valid',
        'repository_bound',
        'hook_bound',
        'key_bound',
        'policy_bound',
        'constitution_bound',
        'package_bound',
        'installed_head_bound',
      ],
    ],
    [
      'github_actions_facts',
      [
        'workflow_present',
        'config_present',
        'workflow_syntax_valid',
        'workflow_bound',
        'repository_bound',
        'main_bound',
        'exact_sha_bound',
        'package_auth_secret_bound',
        'package_auth_fail_closed',
        'package_auth_no_repository_token_fallback',
        'oidc_enabled',
        'provenance_capability_bound',
        'private_user_artifact_digest_bound',
        'attestation_fail_closed_when_required',
        'immutable_artifact_digest_bound',
        'explicit_unavailable_receipt_bound',
        'audit_ref_only',
        'publication_consent_bound',
        'package_bound',
      ],
    ],
  ]) {
    const actual = checks.get('authority-enforcement').info[field];
    assert.deepEqual(Object.keys(actual).sort(), [...facts].sort());
    for (const fact of facts) assert.equal(actual[fact], true, `${field}.${fact}`);
  }
  assert.equal(checks.get('authority-enforcement').info.arbitrary_host_tools_enforced, false);
  assert.match(
    checks.get('trusted-local-rc-boundary').info.attestation_boundary,
    /trusted signer identity and byte integrity/u,
  );
  for (const [path, digest] of before) {
    assert.equal(digestFile(path), digest, `read-only CLI changed ${path}`);
  }
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

  assert.equal(verifierPolicy.package.version, '2.4.0');
  assert.deepEqual(verifierPolicy.package, {
    name: '@aarusso-nyx/devai',
    version: '2.4.0',
    registry: 'https://npm.pkg.github.com',
    tarball:
      'https://npm.pkg.github.com/download/@aarusso-nyx/devai/2.4.0/d650e1cf753720569ec826d8e2b93ead23671140',
    shasum_sha1: 'd650e1cf753720569ec826d8e2b93ead23671140',
    integrity_sri:
      'sha512-WgiBcsUeSECohocQTnFmsycJRtyjHCHVF0KQ0//sHHb1zT7bHgMW248VmcRQNoaSRpXSOo2BRqIpOtnj2HsgWg==',
    release_source: {
      repository: 'aarusso-nyx/devai',
      commit: '9fda759a131c7b7ff43635ad6fa5e4e878f5f836',
      tree: '5de4bab35aafdaec115ac03cc54a05630204b677',
    },
  });
  assert.deepEqual(verifierPolicy.authentication, {
    secret: 'PACKAGES_READ_TOKEN',
    scope: 'materialization-step-only',
    github_token_fallback: false,
  });
  assert.deepEqual(verifierPolicy.workflow_permissions, {
    contents: 'read',
    packages: 'read',
    checks: 'write',
  });
  assert.equal(verifierPolicy.materialization.package_lifecycle_scripts, false);
  assert.equal(verifierPolicy.materialization.candidate_product_execution, false);
  assert.equal(verifierPolicy.verifier.payload_file_count, 26);
  assert.equal(
    verifierPolicy.verifier.provenance_sha256,
    'fc79da07d4d4dfa466548337a4944ae1b7e0bfdcf2f1c334b341bb1ad477cd4d',
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

test('minimal 2.6 adoption does not opt in empty trust declarations or an unmanaged toolchain', () => {
  const adoption = readJson('law/policy/devai-adoption.json');
  const binding = readJson('.devai/config/adopter-policy-binding.json');
  for (const key of ['invariant_producers', 'reviewed_workflow_steps']) {
    assert.equal(Object.hasOwn(adoption, key), false);
  }
  for (const path of [
    '.devai/config/invariant-producers.json',
    '.devai/config/reviewed-workflow-steps.json',
  ]) {
    assert.equal(Object.hasOwn(binding.materialized, path), false);
    assert.equal(existsSync(join(repoRoot, path)), false);
  }
  assert.equal(existsSync(join(repoRoot, '.devai/config/toolchain.json')), false);
});

test('registered 2.6.0 upgrade retains exact six targets and both supported migrations without rewriting history', () => {
  const receipt = readJson('.devai/config/upgrade-receipt.json');
  assert.equal(receipt.schemaVersion, '1.0.0');
  assert.equal(receipt.from, '2.5.0');
  assert.equal(receipt.to, '2.6.0');
  assert.equal(Number.isFinite(Date.parse(receipt.upgraded_at)), true);
  assert.deepEqual(receipt.constitution, { from: '1.0.2', to: '1.0.2' });
  assert.deepEqual(receipt.migrations, [
    'MIG-2.6.0-read-only-workflow-inventory',
    'MIG-2.6.0-selected-post-merge-hook',
  ]);
  assert.deepEqual(receipt.retired_keys, []);
  assert.deepEqual(receipt.obligations, []);
  assert.deepEqual(receipt.changed_files.map(({ path }) => path).sort(), [
    '.devai/config/adopter-policy-binding.json',
    '.devai/config/authority-policy.json',
    '.devai/config/github-actions-host-adapter.json',
    '.devai/config/project.json',
    '.devai/config/subprocess-effects.json',
    '.devai/constitution.md',
  ]);
  assert.equal(
    digestFile('.devai/config/upgrade-receipt.json'),
    '23203e9ba8065325f99e41c4f719f2990df698671db844c5dbdb506832d8906a',
  );
  for (const entry of receipt.changed_files) {
    assert.equal(entry.operation, 'update');
    assert.equal(digestFile(entry.path), entry.sha256, entry.path);
    assert.equal(
      createHash('sha256')
        .update(historicalBytes('092d3aaea4e742fe668ce9509a561a4415bc3e3b', entry.path))
        .digest('hex'),
      entry.sha256,
      entry.path,
    );
  }
  assert.deepEqual(receipt.postchecks, [
    { name: 'policy-materialization-current', ok: true },
    { name: 'authority-enforcement', ok: true },
    { name: 'constitution-binding', ok: true },
  ]);
  const catalog = readJson(
    'node_modules/@aarusso-nyx/devai/dist/law/policy/adopter-migrations.json',
  );
  const versions = catalog.releases;
  assert.equal(Array.isArray(versions), true);
  const previous = versions.find(({ version }) => version === '2.5.0');
  assert.deepEqual(
    previous.changes.map(({ id }) => id),
    [
      'MIG-2.5.0-audit-interface-projections',
      'MIG-2.5.0-complete-test-result-population',
      'MIG-2.5.0-trusted-verifier-2-4',
    ],
  );
  const current = versions.find(({ version }) => version === '2.6.0');
  // Published registry identity is independently verified; retain the actual
  // catalog label rather than silently upgrading its standing.
  assert.equal(current.status, 'unreleased');
  assert.deepEqual(
    current.changes.map(({ id }) => id),
    receipt.migrations,
  );
});
