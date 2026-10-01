#!/usr/bin/env node
// Runs `npm audit` for infra/cdk and fails on any high or critical finding
// except the Owner-accepted exception below.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Owner decision 2026-10-01: aws-cdk-lib bundles brace-expansion 5.0.9 and no
// released aws-cdk-lib (<= 2.272.0) ships a patched copy; npm overrides cannot
// replace bundled dependencies. The exception covers only these advisories on
// the bundled copy at the pinned aws-cdk-lib version, so any aws-cdk-lib bump
// re-arms the gate.
export const CDK_AUDIT_EXCEPTION = Object.freeze({
  awsCdkLibVersion: '2.265.0',
  package: 'brace-expansion',
  nodePrefix: 'node_modules/aws-cdk-lib/node_modules/',
  advisories: Object.freeze([
    'https://github.com/advisories/GHSA-q2hr-2g5m-vwhr',
    'https://github.com/advisories/GHSA-qhr7-859c-m2p7',
    'https://github.com/advisories/GHSA-6j4f-fj2g-mc7p',
  ]),
});

const BLOCKING = new Set(['high', 'critical']);

const waived = (name, finding, awsCdkLibVersion, exception) =>
  awsCdkLibVersion === exception.awsCdkLibVersion &&
  name === exception.package &&
  finding.nodes.length > 0 &&
  finding.nodes.every((node) => node.startsWith(exception.nodePrefix)) &&
  finding.via.every((via) => typeof via === 'object' && exception.advisories.includes(via.url));

export function classifyCdkAudit(report, awsCdkLibVersion, exception = CDK_AUDIT_EXCEPTION) {
  const blocking = [];
  const accepted = [];
  for (const [name, finding] of Object.entries(report.vulnerabilities ?? {})) {
    if (!BLOCKING.has(finding.severity)) continue;
    (waived(name, finding, awsCdkLibVersion, exception) ? accepted : blocking).push(name);
  }
  return { blocking: blocking.sort(), accepted: accepted.sort() };
}

function main() {
  const cdkRoot = resolve(fileURLToPath(new URL('../infra/cdk', import.meta.url)));
  let output;
  try {
    output = execFileSync('npm', ['audit', '--json'], { cwd: cdkRoot, encoding: 'utf8' });
  } catch (error) {
    if (typeof error.stdout !== 'string' || !error.stdout) throw error;
    output = error.stdout;
  }
  const version = JSON.parse(
    readFileSync(join(cdkRoot, 'node_modules/aws-cdk-lib/package.json'), 'utf8'),
  ).version;
  const { blocking, accepted } = classifyCdkAudit(JSON.parse(output), version);
  for (const name of accepted) {
    process.stdout.write(
      `[cdk-audit][accepted] ${name} bundled in aws-cdk-lib@${version} (Owner exception 2026-10-01)\n`,
    );
  }
  if (blocking.length) {
    process.stderr.write(`[cdk-audit][fail] high or critical findings: ${blocking.join(', ')}\n`);
    process.exit(1);
  }
  process.stdout.write('[cdk-audit][ok] no unaccepted high or critical findings\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
