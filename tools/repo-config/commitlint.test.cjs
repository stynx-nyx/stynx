/**
 * Smoke test for tools/repo-config/commitlint.config.cjs.
 *
 * Authored in C-4 Session F-12 (regex widening for combined-role headers).
 * Run via: node tools/repo-config/commitlint.test.cjs
 * Exit code 0 = all cases pass; non-zero = at least one regression.
 *
 * Cases are intentionally inline so this file is the documentation of
 * what stynx's commitlint will and won't accept.
 */
const config = require('./commitlint.config.cjs');

const re = config.parserPreset.parserOpts.headerPattern;

const cases = [
  // Valid DEVAI role-prefix shapes
  { msg: 'Architect: r.1 single role', expect: 'pass' },
  { msg: 'Engineer: solo Engineer', expect: 'pass' },
  { msg: 'Inspector: solo Inspector', expect: 'pass' },
  { msg: 'Auditor: solo Auditor', expect: 'pass' },
  { msg: 'Owner: solo Owner', expect: 'pass' },
  { msg: 'Engineer + Inspector: 20.B combined two roles', expect: 'pass' },
  { msg: 'Architect + Engineer + Inspector: 20.D combined three roles', expect: 'pass' },
  { msg: 'Owner + Architect: joint docs/product + docs/arch authoring', expect: 'pass' },

  // Valid Conventional Commits shapes
  { msg: 'chore(repo): legacy conventional', expect: 'pass' },
  { msg: 'feat: type only no scope', expect: 'pass' },
  { msg: 'feat(@stynx-nyx/auth): conventional with @-prefixed scope', expect: 'pass' },
  { msg: 'fix(@stynx-nyx/angular): scope with hyphen', expect: 'pass' },
  { msg: 'chore(@stynx-internal/eslint-config): another @ scope', expect: 'pass' },
  { msg: 'docs(deps): scope with no @', expect: 'pass' },
  { msg: 'feat!: breaking change with bang', expect: 'pass' },

  // Invalid shapes (regex should NOT match)
  { msg: 'BadHeader without colon', expect: 'fail' },
  { msg: 'Engineer +: trailing + with no second role', expect: 'fail' },
  { msg: 'Auditor + UnknownRole: invalid second role', expect: 'fail' },
  { msg: 'ArchitectEngineer: no separator between roles', expect: 'fail' },
  { msg: 'unknown-type(repo): not in CONVENTIONAL_TYPES', expect: 'fail' },
];

let failures = 0;
for (const { msg, expect } of cases) {
  const matches = re.test(msg);
  const actual = matches ? 'pass' : 'fail';
  const ok = actual === expect;
  if (!ok) failures += 1;
  const marker = ok ? '✓' : '✗';
  process.stdout.write(`${marker} expect=${expect.padEnd(4)} got=${actual.padEnd(4)} :: ${msg}\n`);
}

if (failures > 0) {
  process.stderr.write(`\n${failures} regression(s).\n`);
  process.exit(1);
}
process.stdout.write(`\n${cases.length} case(s) — all behave as expected.\n`);
