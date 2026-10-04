#!/usr/bin/env node
// Runs `pnpm audit` for the workspace and fails on any finding at or above the
// requested level except the Owner-accepted exception below.
//
//   node scripts/audit-workspace-dependencies.mjs --prod                # RC security lane
//   node scripts/audit-workspace-dependencies.mjs --audit-level=high    # remote dependency-audit
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Owner decision 2026-10-04 (ADR-SECURITY-AUDIT-0001): braces and
// http-cache-semantics have no patched release. They reach the workspace only
// through the private root dev tooling (`.`) and the private documentation site
// (`docs/site`); no published or runtime package depends on them. The exception
// is time-boxed and lapses on its own when it expires, when a patched release
// appears, or when any path reaches another importer.
export const WORKSPACE_AUDIT_EXCEPTION = Object.freeze({
  decision: 'ADR-SECURITY-AUDIT-0001',
  expires: '2026-11-04',
  allowedRoots: Object.freeze(['.', 'docs/site']),
  advisories: Object.freeze({
    'GHSA-vfj7-8cjw-p6xm': 'braces',
    'GHSA-ch52-4w7c-c8xp': 'http-cache-semantics',
  }),
});

const LEVELS = ['info', 'low', 'moderate', 'high', 'critical'];
const UNPATCHED = '<0.0.0';

function pathRoot(path) {
  return path.split(' > ')[0].trim();
}

function waived(advisory, today, exception) {
  const module = exception.advisories[advisory.github_advisory_id];
  const paths = (advisory.findings ?? []).flatMap((finding) => finding.paths ?? []);
  return (
    today <= exception.expires &&
    module !== undefined &&
    module === advisory.module_name &&
    advisory.patched_versions === UNPATCHED &&
    paths.length > 0 &&
    paths.every((path) => exception.allowedRoots.includes(pathRoot(path)))
  );
}

export function classifyWorkspaceAudit(
  report,
  { level = 'info', today, exception = WORKSPACE_AUDIT_EXCEPTION },
) {
  if (!LEVELS.includes(level)) throw new Error(`unknown audit level ${level}`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(today ?? '')) throw new Error('today must be YYYY-MM-DD');
  const floor = LEVELS.indexOf(level);
  const blocking = [];
  const accepted = [];
  for (const advisory of Object.values(report.advisories ?? {})) {
    if (LEVELS.indexOf(advisory.severity) < floor) continue;
    const id = `${advisory.github_advisory_id} ${advisory.module_name} (${advisory.severity})`;
    (waived(advisory, today, exception) ? accepted : blocking).push(id);
  }
  return { blocking: blocking.sort(), accepted: accepted.sort() };
}

function parseArgs(argv) {
  const options = { prod: false, level: 'info' };
  for (const arg of argv) {
    if (arg === '--prod') options.prod = true;
    else if (arg.startsWith('--audit-level=')) options.level = arg.slice('--audit-level='.length);
    else throw new Error(`unknown argument ${arg}`);
  }
  return options;
}

function main() {
  const { prod, level } = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const args = ['audit', '--json', ...(prod ? ['--prod'] : [])];
  let output;
  try {
    output = execFileSync('pnpm', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    if (typeof error.stdout !== 'string' || !error.stdout) throw error;
    output = error.stdout;
  }
  const today = new Date().toISOString().slice(0, 10);
  const { blocking, accepted } = classifyWorkspaceAudit(JSON.parse(output), { level, today });
  for (const id of accepted) {
    process.stdout.write(
      `[workspace-audit][accepted] ${id} until ${WORKSPACE_AUDIT_EXCEPTION.expires} (${WORKSPACE_AUDIT_EXCEPTION.decision})\n`,
    );
  }
  if (blocking.length) {
    process.stderr.write(
      `[workspace-audit][fail] findings at or above ${level}: ${blocking.join(', ')}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `[workspace-audit][ok] no unaccepted findings at or above ${level}${prod ? ' (production)' : ''}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
