/**
 * Smoke test for the repository's Conventional Commit parser.
 * Run with: node tools/repo-config/commitlint.test.cjs
 */
const config = require('./commitlint.config.cjs');

const re = config.parserPreset.parserOpts.headerPattern;
const cases = [
  { msg: 'chore(repo): conventional subject', expect: 'pass' },
  { msg: 'feat: type only no scope', expect: 'pass' },
  { msg: 'feat(@stynx-nyx/auth): conventional with @-prefixed scope', expect: 'pass' },
  { msg: 'fix(@stynx-nyx/angular): scope with hyphen', expect: 'pass' },
  { msg: 'chore(@stynx-internal/eslint-config): another @ scope', expect: 'pass' },
  { msg: 'docs(deps): scope with no @', expect: 'pass' },
  { msg: 'feat!: breaking change with bang', expect: 'pass' },
  { msg: 'BadHeader without colon', expect: 'fail' },
  { msg: 'unknown-type(repo): unsupported type', expect: 'fail' },
  // Migration fixtures: obsolete role-prefixed subjects must stay rejected.
  { msg: 'Architect: old role prefix', expect: 'fail' },
  { msg: 'Engineer: old role prefix', expect: 'fail' },
  { msg: 'Inspector: old role prefix', expect: 'fail' },
  { msg: 'Auditor: old role prefix', expect: 'fail' },
  { msg: 'Owner: old role prefix', expect: 'fail' },
  { msg: 'Engineer + Inspector: old combined role prefix', expect: 'fail' },
  { msg: 'Architect + Engineer + Inspector: old combined role prefix', expect: 'fail' },
  { msg: 'Owner + Architect: old combined role prefix', expect: 'fail' },
  { msg: 'Engineer +: malformed legacy prefix', expect: 'fail' },
  { msg: 'Auditor + UnknownRole: malformed legacy prefix', expect: 'fail' },
  { msg: 'ArchitectEngineer: malformed legacy prefix', expect: 'fail' },
];

let failures = 0;
for (const { msg, expect } of cases) {
  const actual = re.test(msg) ? 'pass' : 'fail';
  const ok = actual === expect;
  if (!ok) failures += 1;
  process.stdout.write(`${ok ? '✓' : '✗'} expect=${expect.padEnd(4)} got=${actual.padEnd(4)} :: ${msg}\n`);
}

if (failures > 0) {
  process.stderr.write(`\n${failures} regression(s).\n`);
  process.exit(1);
}
process.stdout.write(`\n${cases.length} case(s) — all behave as expected.\n`);
