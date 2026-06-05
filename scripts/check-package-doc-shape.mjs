#!/usr/bin/env node
// R16 W01 — check-package-doc-shape.
//
// Walks every package README in packages/*/ , packages-web/*/ , tools/*/
// and asserts each carries the 9 mandatory `## ` headings from the R16
// canonical template:
//
//   1. ## Purpose
//   2. ## Audience
//   3. ## Install
//   4. ## Quick start
//   5. ## Public API surface
//   6. ## Configuration
//   7. ## Examples
//   8. ## Common pitfalls
//   9. ## Related packages   (or ## Related — accepted alias)
//
// Usage:
//   node scripts/check-package-doc-shape.mjs              # plain JSON output
//   node scripts/check-package-doc-shape.mjs --strict     # exit 1 if any pkg fails
//   node scripts/check-package-doc-shape.mjs --pkg <path> # check only one package
//   node scripts/check-package-doc-shape.mjs --human      # readable summary
//
// Exit codes:
//   0  all packages clean (or --strict not set)
//   1  --strict + ≥1 package missing mandatory sections
//   2  internal error (bad CWD, no packages found, etc.)

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const HUMAN = args.includes('--human');
const PKG_FLAG_IDX = args.indexOf('--pkg');
const PKG_FILTER = PKG_FLAG_IDX >= 0 ? args[PKG_FLAG_IDX + 1] : null;

const REQUIRED_SECTIONS = [
  { name: 'Purpose', regex: /^##\s+purpose\b/im },
  { name: 'Audience', regex: /^##\s+audience\b/im },
  { name: 'Install', regex: /^##\s+install\b/im },
  { name: 'Quick start', regex: /^##\s+quick\s+start\b/im },
  { name: 'Public API surface', regex: /^##\s+public\s+api\s+surface\b/im },
  { name: 'Configuration', regex: /^##\s+configuration\b/im },
  { name: 'Examples', regex: /^##\s+examples\b/im },
  { name: 'Common pitfalls', regex: /^##\s+common\s+pitfalls\b/im },
  { name: 'Related', regex: /^##\s+related(?:\s+packages)?\b/im },
];

const SCAN_DIRS = ['packages', 'packages-web', 'tools'];

function discoverPackages(filter) {
  const found = [];
  for (const scanDir of SCAN_DIRS) {
    const absScan = join(REPO_ROOT, scanDir);
    if (!existsSync(absScan)) continue;
    for (const entry of readdirSync(absScan)) {
      const absPkg = join(absScan, entry);
      if (!statSync(absPkg).isDirectory()) continue;
      const manifestPath = join(absPkg, 'package.json');
      if (!existsSync(manifestPath)) continue; // skip dirs without a package.json
      const readmePath = join(absPkg, 'README.md');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const pkgRelPath = `${scanDir}/${entry}`;
      if (filter && pkgRelPath !== filter && filter !== entry) continue;
      found.push({
        name: manifest.name ?? entry,
        path: pkgRelPath,
        readmePath,
        readmeExists: existsSync(readmePath),
      });
    }
  }
  return found;
}

function checkPackage(pkg) {
  const result = {
    package: pkg.name,
    path: pkg.path,
    readmeExists: pkg.readmeExists,
    missingSections: [],
    presentSections: [],
    ok: false,
  };
  if (!pkg.readmeExists) {
    result.missingSections = REQUIRED_SECTIONS.map((s) => s.name);
    return result;
  }
  const content = readFileSync(pkg.readmePath, 'utf8');
  for (const section of REQUIRED_SECTIONS) {
    if (section.regex.test(content)) result.presentSections.push(section.name);
    else result.missingSections.push(section.name);
  }
  result.ok = result.missingSections.length === 0;
  return result;
}

function main() {
  const packages = discoverPackages(PKG_FILTER);
  if (packages.length === 0) {
    console.error(`No packages found${PKG_FILTER ? ` matching --pkg ${PKG_FILTER}` : ''}`);
    process.exit(2);
  }
  const results = packages.map(checkPackage);
  const summary = {
    total: results.length,
    clean: results.filter((r) => r.ok).length,
    missing_sections: results.filter((r) => !r.ok).length,
    missing_readme: results.filter((r) => !r.readmeExists).length,
  };
  if (HUMAN) {
    console.log(`R16 doc-shape check — ${summary.clean}/${summary.total} packages clean`);
    for (const r of results) {
      if (r.ok) continue;
      console.log(`  ✗ ${r.package} (${r.path})`);
      if (!r.readmeExists) {
        console.log(`      README missing`);
      } else {
        console.log(`      missing sections: ${r.missingSections.join(', ')}`);
      }
    }
  } else {
    console.log(JSON.stringify({ summary, results }, null, 2));
  }
  if (STRICT && summary.missing_sections > 0) process.exit(1);
  process.exit(0);
}

main();
