#!/usr/bin/env node
// R16 W01 — verify-package-doc-coverage.
//
// For every package under packages/*/, packages-web/*/, tools/*/ with a
// tracked src/index.ts, extract the public export set and compare against
// the symbols cited inside the package's README. Reports:
//
//   - cited_but_missing: README cites a symbol that does NOT exist in
//     src/index.ts → stale prose (hard fail with --strict).
//   - exported_but_undocumented: a symbol exists in src/index.ts but is
//     NOT cited in the README → incomplete prose (soft signal; not a
//     gate fail; some symbols are intentionally not user-facing).
//   - coverage_pct: cited / total_exports * 100.
//
// Exemptions per align/stynx/round-16/inv/doc-coverage-exemptions.json
// are honoured. Currently exempts @stynx-nyx/sdk (252 generated files).
//
// Usage:
//   node scripts/verify-package-doc-coverage.mjs
//   node scripts/verify-package-doc-coverage.mjs --strict
//   node scripts/verify-package-doc-coverage.mjs --pkg <path>
//   node scripts/verify-package-doc-coverage.mjs --human
//   node scripts/verify-package-doc-coverage.mjs --exemptions <json-path>
//
// Exit codes:
//   0  all packages clean OR --strict not set
//   1  --strict + ≥1 package has cited_but_missing>0 (non-exempt)
//   2  internal error

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const HUMAN = args.includes('--human');
const pkgFlagIdx = args.indexOf('--pkg');
const PKG_FILTER = pkgFlagIdx >= 0 ? args[pkgFlagIdx + 1] : null;
const exFlagIdx = args.indexOf('--exemptions');
const EXEMPTIONS_PATH = exFlagIdx >= 0
  ? args[exFlagIdx + 1]
  : '../align/stynx/round-16/inv/doc-coverage-exemptions.json';

const SCAN_DIRS = ['packages', 'packages-web', 'tools'];

function loadExemptions() {
  const absExPath = resolve(REPO_ROOT, EXEMPTIONS_PATH);
  if (!existsSync(absExPath)) {
    return { fullExempt: new Set(), softExempt: new Set() };
  }
  const data = JSON.parse(readFileSync(absExPath, 'utf8'));
  const fullExempt = new Set(
    (data.exemptions ?? []).filter((e) => e.scope === 'full').map((e) => e.package),
  );
  const softExempt = new Set(data.soft_signal_exempt_packages ?? []);
  return { fullExempt, softExempt };
}

function discoverPackages(filter) {
  const found = [];
  for (const scanDir of SCAN_DIRS) {
    const absScan = join(REPO_ROOT, scanDir);
    if (!existsSync(absScan)) continue;
    for (const entry of readdirSync(absScan)) {
      const absPkg = join(absScan, entry);
      if (!statSync(absPkg).isDirectory()) continue;
      const manifestPath = join(absPkg, 'package.json');
      const indexPath = join(absPkg, 'src', 'index.ts');
      const readmePath = join(absPkg, 'README.md');
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const pkgRelPath = `${scanDir}/${entry}`;
      if (filter && pkgRelPath !== filter && filter !== entry) continue;
      found.push({
        name: manifest.name ?? entry,
        path: pkgRelPath,
        indexPath,
        indexExists: existsSync(indexPath),
        readmePath,
        readmeExists: existsSync(readmePath),
      });
    }
  }
  return found;
}

// Naive parser for src/index.ts. Robust enough for the R16 use case
// because index.ts files are almost always re-export barrels.
//
// Patterns matched:
//   export { Foo, Bar } from './x';
//   export { Foo as default } from './x';
//   export * from './x';   // we skip — can't resolve
//   export const X = ...;
//   export function fn(...
//   export class C {
//   export interface I {
//   export type T = ...
//   export enum E {
//   export default function fn(...
function extractExports(indexPath) {
  if (!existsSync(indexPath)) return [];
  const src = readFileSync(indexPath, 'utf8');
  const exports = new Set();
  // export { A, B as C } from '...';
  const namedReExport = /export\s+(?:type\s+)?\{([^}]+)\}/g;
  let m;
  while ((m = namedReExport.exec(src)) !== null) {
    for (const part of m[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const asMatch = trimmed.match(/^\s*\w+\s+as\s+(\w+)\s*$/);
      const name = asMatch ? asMatch[1] : trimmed.replace(/^type\s+/, '').split(/\s+/)[0];
      if (name && name !== 'default') exports.add(name);
    }
  }
  // export const X / export function fn / export class C / export interface I
  // / export type T / export enum E / export abstract class C
  const directDecl = /export\s+(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
  while ((m = directDecl.exec(src)) !== null) {
    if (m[1]) exports.add(m[1]);
  }
  return [...exports];
}

// Extract symbol mentions from README. Heuristic: anything inside
// backticks that looks like a TS identifier (CamelCase, kebab-Case
// excluded, allows $ and _).
function extractCitedSymbols(readmePath) {
  if (!existsSync(readmePath)) return [];
  const src = readFileSync(readmePath, 'utf8');
  const cited = new Set();
  // Inline code spans: `Identifier` or `Identifier.method` or `Identifier()`
  const inlineCode = /`([^`\n]{1,80})`/g;
  let m;
  while ((m = inlineCode.exec(src)) !== null) {
    const span = m[1].trim();
    // pull leading identifier
    const id = span.match(/^([A-Z]\w+)/);
    if (id) cited.add(id[1]);
  }
  // Code blocks: lines like `Foo.bar()` or `import { Foo } from '@stynx-nyx/...'`
  const codeBlocks = /```[\s\S]+?```/g;
  while ((m = codeBlocks.exec(src)) !== null) {
    const block = m[0];
    const importNamed = /import\s+\{([^}]+)\}/g;
    let im;
    while ((im = importNamed.exec(block)) !== null) {
      for (const part of im[1].split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const asMatch = trimmed.match(/^\s*\w+\s+as\s+(\w+)\s*$/);
        const name = asMatch ? asMatch[1] : trimmed.split(/\s+/)[0];
        if (name) cited.add(name);
      }
    }
    // Also capture standalone identifiers used in code
    const idents = block.match(/\b[A-Z]\w+/g) || [];
    for (const i of idents) cited.add(i);
  }
  return [...cited];
}

function analyzePackage(pkg, exemptions) {
  const result = {
    package: pkg.name,
    path: pkg.path,
    exempt: exemptions.fullExempt.has(pkg.name),
    soft_exempt: exemptions.softExempt.has(pkg.name),
    index_exists: pkg.indexExists,
    readme_exists: pkg.readmeExists,
    exports_total: 0,
    cited_total: 0,
    cited_but_missing: [],
    exported_but_undocumented: [],
    coverage_pct: null,
  };
  if (result.exempt) return result;
  const exports = pkg.indexExists ? extractExports(pkg.indexPath) : [];
  const cited = pkg.readmeExists ? extractCitedSymbols(pkg.readmePath) : [];
  result.exports_total = exports.length;
  result.cited_total = cited.length;
  const exportsSet = new Set(exports);
  const citedSet = new Set(cited);
  // cited symbols that DON'T match any export
  for (const c of citedSet) {
    if (!exportsSet.has(c)) {
      // filter out obvious noise: too-short, non-Camel
      if (c.length < 3) continue;
      result.cited_but_missing.push(c);
    }
  }
  // exported but not cited
  for (const e of exportsSet) {
    if (!citedSet.has(e)) result.exported_but_undocumented.push(e);
  }
  if (exports.length > 0) {
    const intersection = [...exportsSet].filter((e) => citedSet.has(e)).length;
    result.coverage_pct = Math.round((intersection / exports.length) * 1000) / 10;
  }
  return result;
}

function main() {
  const exemptions = loadExemptions();
  const packages = discoverPackages(PKG_FILTER);
  if (packages.length === 0) {
    console.error(`No packages found${PKG_FILTER ? ` matching --pkg ${PKG_FILTER}` : ''}`);
    process.exit(2);
  }
  const results = packages.map((p) => analyzePackage(p, exemptions));
  const nonExemptHardFail = results.filter(
    (r) => !r.exempt && r.cited_but_missing.length > 0,
  );
  const summary = {
    total: results.length,
    exempt: results.filter((r) => r.exempt).length,
    soft_exempt: results.filter((r) => r.soft_exempt).length,
    hard_fail_count: nonExemptHardFail.length,
    avg_coverage_pct: (() => {
      const measurable = results.filter((r) => r.coverage_pct !== null && !r.exempt);
      if (measurable.length === 0) return null;
      return Math.round((measurable.reduce((s, r) => s + r.coverage_pct, 0) / measurable.length) * 10) / 10;
    })(),
  };
  if (HUMAN) {
    console.log(`R16 doc-coverage — avg ${summary.avg_coverage_pct ?? 'n/a'}%; ${summary.hard_fail_count} packages with stale cites`);
    for (const r of results) {
      if (r.exempt) {
        console.log(`  · ${r.package} — exempt (${r.path})`);
        continue;
      }
      if (r.cited_but_missing.length > 0) {
        console.log(`  ✗ ${r.package} (${r.path}) — stale: ${r.cited_but_missing.join(', ')}`);
      }
      if (!r.soft_exempt && r.exported_but_undocumented.length > 0 && r.coverage_pct < 50) {
        console.log(`  ! ${r.package} — coverage ${r.coverage_pct}%; ${r.exported_but_undocumented.length} undocumented exports`);
      }
    }
  } else {
    console.log(JSON.stringify({ summary, results }, null, 2));
  }
  if (STRICT && summary.hard_fail_count > 0) process.exit(1);
  process.exit(0);
}

main();
