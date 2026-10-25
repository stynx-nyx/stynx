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

/** @type {readonly unknown[]} */
const LEVELS = ['info', 'low', 'moderate', 'high', 'critical'];
const UNPATCHED = '<0.0.0';

/** @typedef {Omit<typeof WORKSPACE_AUDIT_EXCEPTION, 'allowedRoots'> & {readonly allowedRoots: readonly unknown[]}} WorkspaceAuditException */

/** @param {unknown} path */
function pathRoot(path) {
  return trimPathHead(jsonProperty(splitPath(path), '0'));
}

/** @param {unknown} advisory @param {string} today @param {WorkspaceAuditException} exception */
function waived(advisory, today, exception) {
  const module = jsonProperty(
    exception.advisories,
    String(jsonProperty(advisory, 'github_advisory_id')),
  );
  const paths = findingPaths(jsonProperty(advisory, 'findings') ?? []);
  return (
    today <= exception.expires &&
    module !== undefined &&
    module === jsonProperty(advisory, 'module_name') &&
    jsonProperty(advisory, 'patched_versions') === UNPATCHED &&
    Number(jsonProperty(paths, 'length')) > 0 &&
    auditEvery(paths, (path) => exception.allowedRoots.includes(pathRoot(path)), 'paths.every')
  );
}

/** @param {unknown} report @param {{level?: string, today: string, exception?: WorkspaceAuditException}} options */
export function classifyWorkspaceAudit(
  report,
  { level = 'info', today, exception = WORKSPACE_AUDIT_EXCEPTION },
) {
  if (!LEVELS.includes(level)) throw new Error(`unknown audit level ${level}`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(today ?? '')) throw new Error('today must be YYYY-MM-DD');
  const floor = LEVELS.indexOf(level);
  /** @type {string[]} */
  const blocking = [];
  /** @type {string[]} */
  const accepted = [];
  for (const advisory of jsonValues(jsonProperty(report, 'advisories') ?? {})) {
    if (LEVELS.indexOf(jsonProperty(advisory, 'severity')) < floor) continue;
    const id = `${jsonProperty(advisory, 'github_advisory_id')} ${jsonProperty(advisory, 'module_name')} (${jsonProperty(advisory, 'severity')})`;
    (waived(advisory, today, exception) ? accepted : blocking).push(id);
  }
  return { blocking: blocking.sort(), accepted: accepted.sort() };
}

/** @param {string[]} argv */
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
  /** @type {unknown} */
  let output;
  try {
    output = execFileSync('pnpm', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    if (typeof jsonProperty(error, 'stdout') !== 'string' || !jsonProperty(error, 'stdout'))
      throw error;
    output = jsonProperty(error, 'stdout');
  }
  const today = new Date().toISOString().slice(0, 10);
  const { blocking, accepted } = classifyWorkspaceAudit(nativeJsonParse(output), { level, today });
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

/**
 * Preserve native property reads of opaque JSON, including primitive boxing.
 * Nullish wording follows the pinned Node runtime at the original read position.
 * @param {unknown} value
 * @param {string} key
 * @returns {unknown}
 */
function jsonProperty(value, key) {
  if (value === null) throw new TypeError(`Cannot read properties of null (reading '${key}')`);
  if (value === undefined)
    throw new TypeError(`Cannot read properties of undefined (reading '${key}')`);
  return Reflect.get(jsonObject(value), key, value);
}

/** @param {unknown} value */
function jsonObject(value) {
  /** @type {unknown} */
  const boxed = Object(value);
  if ((typeof boxed !== 'object' || boxed === null) && typeof boxed !== 'function') {
    throw new TypeError('native Object boxing returned a non-object');
  }
  return boxed;
}

/** @param {unknown} value @returns {unknown} */
function nativeJsonParse(value) {
  return Reflect.apply(JSON.parse, JSON, [value]);
}

/** @param {unknown} value @returns {unknown[]} */
function jsonValues(value) {
  return Object.values(jsonObject(value));
}

/**
 * Invoke only the original .every member, retaining its receiver and callback.
 * The label records the pinned native noncallable message for each existing site.
 * @param {unknown} value
 * @param {(item: unknown) => unknown} predicate
 * @param {string} label
 * @returns {unknown}
 */
function auditEvery(value, predicate, label) {
  const every = jsonProperty(value, 'every');
  if (typeof every !== 'function') throw new TypeError(`${label} is not a function`);
  return Reflect.apply(every, value, [predicate]);
}

/** @param {unknown} value @returns {unknown} */
function splitPath(value) {
  const split = jsonProperty(value, 'split');
  if (typeof split !== 'function') throw new TypeError('path.split is not a function');
  return Reflect.apply(split, value, [' > ']);
}

/** @param {unknown} value @returns {unknown} */
function trimPathHead(value) {
  const trim = jsonProperty(value, 'trim');
  if (typeof trim !== 'function') throw new TypeError('path.split(...)[0].trim is not a function');
  return Reflect.apply(trim, value, []);
}

/** @param {unknown} value @returns {unknown} */
function findingPaths(value) {
  const flatMap = jsonProperty(value, 'flatMap');
  if (typeof flatMap !== 'function')
    throw new TypeError('(advisory.findings ?? []).flatMap is not a function');
  /** @param {unknown} finding @returns {unknown} */
  const paths = (finding) => jsonProperty(finding, 'paths') ?? [];
  return Reflect.apply(flatMap, value, [paths]);
}
