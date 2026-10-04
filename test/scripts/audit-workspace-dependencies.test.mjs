import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WORKSPACE_AUDIT_EXCEPTION,
  classifyWorkspaceAudit,
} from '../../scripts/audit-workspace-dependencies.mjs';

const today = '2026-10-04';
const advisory = (id, module, paths, overrides = {}) => ({
  github_advisory_id: id,
  module_name: module,
  severity: 'high',
  patched_versions: '<0.0.0',
  findings: [{ version: '1.0.0', paths }],
  ...overrides,
});
const braces = (paths = ['docs/site > @docusaurus/core@3.10.2 > braces@3.0.3']) =>
  advisory('GHSA-vfj7-8cjw-p6xm', 'braces', paths);
const cache = (paths = ['docs/site > got@12.6.1 > http-cache-semantics@4.2.0']) =>
  advisory('GHSA-ch52-4w7c-c8xp', 'http-cache-semantics', paths);

test('the exception names exactly two unpatched advisories, two private roots, and one expiry', () => {
  assert.deepEqual(WORKSPACE_AUDIT_EXCEPTION.advisories, {
    'GHSA-vfj7-8cjw-p6xm': 'braces',
    'GHSA-ch52-4w7c-c8xp': 'http-cache-semantics',
  });
  assert.deepEqual(WORKSPACE_AUDIT_EXCEPTION.allowedRoots, ['.', 'docs/site']);
  assert.equal(WORKSPACE_AUDIT_EXCEPTION.expires, '2026-11-04');
  assert.equal(WORKSPACE_AUDIT_EXCEPTION.decision, 'ADR-SECURITY-AUDIT-0001');
});

test('accepts the excepted advisories reached only through root dev tooling and docs/site', () => {
  const report = {
    advisories: {
      1: braces([
        '. > @changesets/cli@2.31.0 > braces@3.0.3',
        'docs/site > micromatch@4.0.8 > braces@3.0.3',
      ]),
      2: cache(),
    },
  };
  assert.deepEqual(classifyWorkspaceAudit(report, { level: 'high', today }), {
    blocking: [],
    accepted: [
      'GHSA-ch52-4w7c-c8xp http-cache-semantics (high)',
      'GHSA-vfj7-8cjw-p6xm braces (high)',
    ],
  });
});

test('re-arms the gate after expiry, once a patch exists, or when a published package is reached', () => {
  const report = { advisories: { 1: braces() } };
  assert.deepEqual(classifyWorkspaceAudit(report, { today: '2026-11-04' }).accepted, [
    'GHSA-vfj7-8cjw-p6xm braces (high)',
  ]);
  assert.deepEqual(classifyWorkspaceAudit(report, { today: '2026-11-05' }).blocking, [
    'GHSA-vfj7-8cjw-p6xm braces (high)',
  ]);
  const patched = {
    advisories: {
      1: advisory('GHSA-vfj7-8cjw-p6xm', 'braces', ['. > braces@3.0.3'], {
        patched_versions: '>=3.0.4',
      }),
    },
  };
  assert.deepEqual(classifyWorkspaceAudit(patched, { today }).blocking, [
    'GHSA-vfj7-8cjw-p6xm braces (high)',
  ]);
  const runtime = {
    advisories: {
      1: braces(['docs/site > braces@3.0.3', 'packages/core > micromatch@4.0.8 > braces@3.0.3']),
    },
  };
  assert.deepEqual(classifyWorkspaceAudit(runtime, { today }).blocking, [
    'GHSA-vfj7-8cjw-p6xm braces (high)',
  ]);
});

test('blocks another advisory, a renamed module, and a finding without paths', () => {
  const report = {
    advisories: {
      1: advisory(
        'GHSA-gjj5-9665-rwrc',
        'probe-image-size',
        ['. > less@4.9.0 > probe-image-size@7.3.0'],
        {
          patched_versions: '>=7.4.0',
        },
      ),
      2: advisory('GHSA-vfj7-8cjw-p6xm', 'micromatch', ['docs/site > micromatch@4.0.8']),
      3: { ...cache(), findings: [] },
    },
  };
  assert.deepEqual(classifyWorkspaceAudit(report, { level: 'high', today }), {
    blocking: [
      'GHSA-ch52-4w7c-c8xp http-cache-semantics (high)',
      'GHSA-gjj5-9665-rwrc probe-image-size (high)',
      'GHSA-vfj7-8cjw-p6xm micromatch (high)',
    ],
    accepted: [],
  });
});

test('honours the level floor: production audits block every severity, CI blocks high and above', () => {
  const report = {
    advisories: {
      1: advisory('GHSA-moderate', 'markdown-it', ['docs/site > markdown-it@14.2.0'], {
        severity: 'moderate',
      }),
    },
  };
  assert.deepEqual(classifyWorkspaceAudit(report, { today }).blocking, [
    'GHSA-moderate markdown-it (moderate)',
  ]);
  assert.deepEqual(classifyWorkspaceAudit(report, { level: 'high', today }), {
    blocking: [],
    accepted: [],
  });
  assert.throws(
    () => classifyWorkspaceAudit(report, { level: 'severe', today }),
    /unknown audit level/u,
  );
  assert.throws(() => classifyWorkspaceAudit(report, { today: '04/10/2026' }), /YYYY-MM-DD/u);
});
