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

/** @type {Set<unknown>} */
const BLOCKING = new Set(['high', 'critical']);

/** @typedef {Omit<typeof CDK_AUDIT_EXCEPTION, 'advisories'> & {readonly advisories: readonly unknown[]}} CdkAuditException */

/** @param {string} name @param {unknown} finding @param {unknown} awsCdkLibVersion @param {CdkAuditException} exception */
const waived = (name, finding, awsCdkLibVersion, exception) =>
  awsCdkLibVersion === exception.awsCdkLibVersion &&
  name === exception.package &&
  Number(jsonProperty(jsonProperty(finding, 'nodes'), 'length')) > 0 &&
  auditEvery(
    jsonProperty(finding, 'nodes'),
    (node) => nodeStartsWith(node, () => exception.nodePrefix),
    'finding.nodes.every',
  ) &&
  auditEvery(
    jsonProperty(finding, 'via'),
    (via) => typeof via === 'object' && exception.advisories.includes(jsonProperty(via, 'url')),
    'finding.via.every',
  );

/** @param {unknown} report @param {unknown} awsCdkLibVersion @param {CdkAuditException} [exception] */
export function classifyCdkAudit(report, awsCdkLibVersion, exception = CDK_AUDIT_EXCEPTION) {
  /** @type {string[]} */
  const blocking = [];
  /** @type {string[]} */
  const accepted = [];
  for (const [name, finding] of jsonEntries(jsonProperty(report, 'vulnerabilities') ?? {})) {
    if (!BLOCKING.has(jsonProperty(finding, 'severity'))) continue;
    (waived(name, finding, awsCdkLibVersion, exception) ? accepted : blocking).push(name);
  }
  return { blocking: blocking.sort(), accepted: accepted.sort() };
}

function main() {
  const cdkRoot = resolve(fileURLToPath(new URL('../infra/cdk', import.meta.url)));
  /** @type {unknown} */
  let output;
  try {
    output = execFileSync('npm', ['audit', '--json'], { cwd: cdkRoot, encoding: 'utf8' });
  } catch (error) {
    if (typeof jsonProperty(error, 'stdout') !== 'string' || !jsonProperty(error, 'stdout'))
      throw error;
    output = jsonProperty(error, 'stdout');
  }
  const version = jsonProperty(
    nativeJsonParse(readFileSync(join(cdkRoot, 'node_modules/aws-cdk-lib/package.json'), 'utf8')),
    'version',
  );
  const { blocking, accepted } = classifyCdkAudit(nativeJsonParse(output), version);
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

/** @param {unknown} value @returns {[string, unknown][]} */
function jsonEntries(value) {
  return Object.entries(jsonObject(value));
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

/**
 * Resolve the original member before evaluating the prefix argument, as the
 * original call does. Keep both receiver and truthy/falsy callback result intact.
 * @param {unknown} value
 * @param {() => unknown} prefixValue
 * @returns {unknown}
 */
function nodeStartsWith(value, prefixValue) {
  const startsWith = jsonProperty(value, 'startsWith');
  const prefix = prefixValue();
  if (typeof startsWith !== 'function') throw new TypeError('node.startsWith is not a function');
  return Reflect.apply(startsWith, value, [prefix]);
}
