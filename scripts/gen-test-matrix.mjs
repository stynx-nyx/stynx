#!/usr/bin/env node
// R14-W10 generator: test matrix.
//
// Reads the six vitest configs at the repo root and produces a per-suite
// summary table at docs/site/docs/meta/test-matrix.md.
//
// Per ADR-DOCS-IA Decision 6 + Decision 7. Test counts are read from the
// glob include patterns in each vitest config; if a `test:<suite>` script
// is present in package.json, its command is included for reproducibility.
//
// Usage: node scripts/gen-test-matrix.mjs [--repo-root <path>] [--out <path>]

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

function parseArgs(argv) {
  const out = { repoRoot: process.cwd(), outPath: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo-root') out.repoRoot = resolve(argv[++i]);
    else if (argv[i] === '--out') out.outPath = resolve(argv[++i]);
  }
  return out;
}

const SUITES = [
  { key: 'unit',        config: 'vitest.config.ts',            patterns: ['**/*.test.ts'],              excludePatterns: ['**/*.integration.test.ts', '**/*.e2e.test.ts', '**/*.smoke.test.ts', '**/*.contract.test.ts', '**/*.regression.test.ts'], probes: 'Per-package logic. In-process, no DB.', stage: 'Cycle A + B' },
  { key: 'integration', config: 'vitest.integration.config.ts', patterns: ['**/*.integration.test.ts'], excludePatterns: [], probes: 'DB-gated subprocess tests walking the CLI surface end-to-end.', stage: 'Cycle B' },
  { key: 'regression',  config: 'vitest.regression.config.ts',  patterns: ['**/*.regression.test.ts'],  excludePatterns: [], probes: 'Anchored past-defect scenarios. Never deleted.', stage: 'Cycle C' },
  { key: 'e2e',         config: 'vitest.e2e.config.ts',         patterns: ['**/*.e2e.test.ts'],         excludePatterns: [], probes: 'Full-flow brownfield-loop scenarios.', stage: 'Cycle C' },
  { key: 'smoke',       config: 'vitest.smoke.config.ts',       patterns: ['**/*.smoke.test.ts'],       excludePatterns: [], probes: 'Environment + bin resolution baseline.', stage: 'Earliest CI step' },
  { key: 'contract',    config: 'vitest.contract.config.ts',    patterns: ['**/*.contract.test.ts'],    excludePatterns: [], probes: 'JSON Schema instance validation.', stage: 'Cycle B' },
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', 'docs', 'examples', '.devai']);

function walkTests(root, includes, excludes) {
  const matches = [];
  function visit(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        visit(full);
      } else if (e.isFile()) {
        const rel = full.slice(root.length + 1);
        // Match by simple substring on include patterns (anchored to filename ending).
        const isIncluded = includes.some(p => simpleMatch(rel, p));
        if (!isIncluded) continue;
        const isExcluded = excludes.some(p => simpleMatch(rel, p));
        if (isExcluded) continue;
        matches.push(rel);
      }
    }
  }
  visit(root);
  return matches;
}

// Simple glob: only handles `**/*.<ext>` style patterns sufficient for vitest configs.
function simpleMatch(path, pattern) {
  // Convert `**/*.integration.test.ts` to a suffix check on `.integration.test.ts`.
  const m = pattern.match(/\*\*\/\*(\..+)$/);
  if (m) return path.endsWith(m[1]);
  if (pattern.includes('*')) {
    const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
    return re.test(path);
  }
  return path === pattern;
}

function countTestBlocks(path) {
  try {
    const src = readFileSync(path, 'utf8');
    // Count top-level `it(` and `test(` calls. Approximation, but stable.
    const matches = src.match(/\b(it|test)\s*\(/g);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

export function buildTestMatrix({ repoRoot }) {
  const rows = [];
  let totalFiles = 0, totalTests = 0;
  for (const suite of SUITES) {
    const cfgPath = join(repoRoot, suite.config);
    const cfgExists = existsSync(cfgPath);
    const files = cfgExists ? walkTests(repoRoot, suite.patterns, suite.excludePatterns) : [];
    let testCount = 0;
    for (const f of files) {
      testCount += countTestBlocks(join(repoRoot, f));
    }
    totalFiles += files.length;
    totalTests += testCount;
    rows.push({ ...suite, fileCount: files.length, testCount, configExists: cfgExists });
  }

  const lines = [];
  lines.push('---');
  lines.push('title: Test matrix');
  lines.push('sidebar_position: 2');
  lines.push(`last_built_at: ${new Date(0).toISOString().replace('1970-01-01', new Date().toISOString().slice(0, 10))}`);
  lines.push('---');
  lines.push('');
  lines.push('# Test matrix');
  lines.push('');
  lines.push('> DEVAI\'s six test suites at last sensor sweep. Each suite probes the plant at a different level; together they cover the framework\'s regulation surface. See [test policy](../framework/test-policy.md) for the policy framing.');
  lines.push('');
  lines.push('| Suite | Config | Files | Tests | Stage | Probes |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(`| **${r.key}** | \`${r.config}\` | ${r.fileCount} | ${r.testCount} | ${r.stage} | ${r.probes} |`);
  }
  lines.push('');
  lines.push(`**Totals:** ${totalFiles} test files · ${totalTests} test blocks across six suites.`);
  lines.push('');
  lines.push('## See also');
  lines.push('');
  lines.push('- [Test policy](../framework/test-policy.md) — canonical reference: suite definitions, weakening, quarantine, coverage policy, per-batch verification.');
  lines.push('- [Self-scorecard](self-scorecard.md) — DEVAI\'s own substrate × transversal verdicts.');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const { repoRoot, outPath } = parseArgs(process.argv.slice(2));
  const content = buildTestMatrix({ repoRoot });
  const target = outPath ?? join(repoRoot, 'docs/site/docs/meta/test-matrix.md');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
  console.log(JSON.stringify({ ok: true, out: target, bytes: content.length }));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
