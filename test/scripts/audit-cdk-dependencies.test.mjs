import assert from 'node:assert/strict';
import test from 'node:test';
import { CDK_AUDIT_EXCEPTION, classifyCdkAudit } from '../../scripts/audit-cdk-dependencies.mjs';

const bundled = (via = CDK_AUDIT_EXCEPTION.advisories) => ({
  severity: 'high',
  nodes: ['node_modules/aws-cdk-lib/node_modules/brace-expansion'],
  via: via.map((url) => ({ url })),
});
const version = CDK_AUDIT_EXCEPTION.awsCdkLibVersion;

test('accepts only the excepted advisories on the bundled copy at the pinned aws-cdk-lib', () => {
  assert.deepEqual(
    classifyCdkAudit({ vulnerabilities: { 'brace-expansion': bundled() } }, version),
    {
      blocking: [],
      accepted: ['brace-expansion'],
    },
  );
});

test('re-arms the gate when aws-cdk-lib changes version', () => {
  assert.deepEqual(
    classifyCdkAudit({ vulnerabilities: { 'brace-expansion': bundled() } }, '2.273.0').blocking,
    ['brace-expansion'],
  );
});

test('blocks a new advisory, another package, string-only via entries, and a hoisted copy', () => {
  const report = {
    vulnerabilities: {
      'brace-expansion': bundled([
        ...CDK_AUDIT_EXCEPTION.advisories,
        'https://github.com/advisories/GHSA-new',
      ]),
      minimatch: { ...bundled(), nodes: ['node_modules/aws-cdk-lib/node_modules/minimatch'] },
      glob: {
        severity: 'critical',
        nodes: ['node_modules/aws-cdk-lib/node_modules/glob'],
        via: ['minimatch'],
      },
    },
  };
  assert.deepEqual(classifyCdkAudit(report, version), {
    blocking: ['brace-expansion', 'glob', 'minimatch'],
    accepted: [],
  });
  const hoisted = { 'brace-expansion': { ...bundled(), nodes: ['node_modules/brace-expansion'] } };
  assert.deepEqual(classifyCdkAudit({ vulnerabilities: hoisted }, version).blocking, [
    'brace-expansion',
  ]);
});

test('ignores findings below high and an empty report', () => {
  assert.deepEqual(
    classifyCdkAudit(
      { vulnerabilities: { tar: { severity: 'moderate', nodes: ['node_modules/tar'], via: [] } } },
      version,
    ),
    { blocking: [], accepted: [] },
  );
  assert.deepEqual(classifyCdkAudit({}, version), { blocking: [], accepted: [] });
});
