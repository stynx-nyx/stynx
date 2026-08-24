import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  compareBranchProtection,
  readDeclaredBranchProtection,
} from './verify-branch-protection.mjs';

const declared = {
  enforce_admins: true,
  required_linear_history: true,
  allow_force_pushes: false,
  allow_deletions: false,
  required_pull_request_reviews: {
    required_approving_review_count: 1,
    dismiss_stale_reviews: true,
    require_code_owner_reviews: true,
  },
  required_status_checks: { strict: true, contexts: ['lint', 'build'] },
};

function liveMatchingDeclaration() {
  return {
    enforce_admins: { enabled: true },
    required_linear_history: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    required_pull_request_reviews: { ...declared.required_pull_request_reviews },
    required_status_checks: { strict: true, contexts: ['build', 'lint'] },
  };
}

test('accepts semantically identical protection independent of context order', () => {
  assert.deepEqual(compareBranchProtection(declared, liveMatchingDeclaration()), []);
});

test('reports scalar, review, strictness, and context drift', () => {
  const live = liveMatchingDeclaration();
  live.enforce_admins.enabled = false;
  live.required_pull_request_reviews = null;
  live.required_status_checks = { strict: false, contexts: ['lint', 'verified-local-rc'] };

  assert.deepEqual(compareBranchProtection(declared, live), [
    { path: 'enforce_admins', declared: true, live: false },
    {
      path: 'required_pull_request_reviews',
      declared: declared.required_pull_request_reviews,
      live: null,
    },
    { path: 'required_status_checks.strict', declared: true, live: false },
    {
      path: 'required_status_checks.contexts',
      declaredOnly: ['build'],
      liveOnly: ['verified-local-rc'],
    },
  ]);
});

test('rejects malformed policy records and duplicate branch declarations', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'stynx-branch-protection-'));
  const policyPath = join(workspace, 'policy.yml');
  try {
    writeFileSync(policyPath, 'notBranches: true\n');
    assert.throws(
      () => readDeclaredBranchProtection(policyPath, 'main'),
      /must contain a branches array/u,
    );

    writeFileSync(
      policyPath,
      'branches:\n  - name: main\n    protection: {}\n  - name: main\n    protection: {}\n',
    );
    assert.throws(
      () => readDeclaredBranchProtection(policyPath, 'main'),
      /must declare main exactly once/u,
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('rejects malformed required-context values', () => {
  const live = liveMatchingDeclaration();
  live.required_status_checks.contexts = ['lint', 42];
  assert.throws(
    () => compareBranchProtection(declared, live),
    /required status contexts must be an array of strings/u,
  );
});
