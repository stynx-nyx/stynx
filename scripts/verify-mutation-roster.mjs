#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootFlagIndex = process.argv.indexOf('--root');
const repoRoot =
  rootFlagIndex === -1 ? resolve(scriptDir, '..') : resolve(process.argv[rootFlagIndex + 1] ?? '');
const workspaceRoots = ['packages', 'packages-web'];
const configPattern = /^stryker\.(?:conf|config)\.(?:cjs|js|json|mjs|ts)$/u;
const failures = [];
const roster = [];

for (const workspaceRoot of workspaceRoots) {
  const absoluteRoot = resolve(repoRoot, workspaceRoot);
  if (!existsSync(absoluteRoot)) {
    failures.push(`${workspaceRoot}: workspace root is missing`);
    continue;
  }

  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const packageDir = resolve(absoluteRoot, entry.name);
    const manifestPath = resolve(packageDir, 'package.json');
    if (!existsSync(manifestPath)) continue;

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const configFiles = readdirSync(packageDir).filter((file) => configPattern.test(file));
    const strykerScript = manifest.scripts?.stryker;

    if (configFiles.length > 1) {
      failures.push(
        `${relative(repoRoot, packageDir)}: multiple Stryker configs (${configFiles.join(', ')})`,
      );
    }

    if (configFiles.length > 0 && typeof strykerScript !== 'string') {
      failures.push(
        `${manifest.name ?? relative(repoRoot, packageDir)}: ${configFiles[0]} exists but scripts.stryker is missing`,
      );
    }

    if (typeof strykerScript === 'string' && configFiles.length === 0) {
      failures.push(
        `${manifest.name ?? relative(repoRoot, packageDir)}: scripts.stryker exists but no Stryker config was found`,
      );
    }

    if (configFiles.length === 1 && typeof strykerScript === 'string') {
      roster.push({
        name: manifest.name ?? relative(repoRoot, packageDir),
        config: relative(repoRoot, resolve(packageDir, configFiles[0])),
      });
    }
  }
}

const hardeningWorkflowPath = resolve(repoRoot, '.github/workflows/hardening.yml');
if (!existsSync(hardeningWorkflowPath)) {
  failures.push('.github/workflows/hardening.yml: hardening workflow is missing');
} else {
  const hardeningWorkflow = readFileSync(hardeningWorkflowPath, 'utf8');
  const mutationJobMatch = hardeningWorkflow.match(
    /^  mutation:\s*$([\s\S]*?)(?=^  [a-zA-Z0-9_-]+:\s*$|(?![\s\S]))/mu,
  );

  if (!mutationJobMatch) {
    failures.push('.github/workflows/hardening.yml: mutation job is missing');
  } else {
    const matrixFilters = new Set(
      [...mutationJobMatch[1].matchAll(/^\s+filter:\s+['"]([^'"]+)['"]\s*$/gmu)].map(
        (match) => match[1],
      ),
    );
    const rosterNames = new Set(roster.map((entry) => entry.name));

    for (const name of rosterNames) {
      if (!matrixFilters.has(name)) {
        failures.push(`hardening mutation matrix is missing ${name}`);
      }
    }

    for (const name of matrixFilters) {
      if (!rosterNames.has(name)) {
        failures.push(`hardening mutation matrix has unconfigured package ${name}`);
      }
    }
  }
}

const rootManifestPath = resolve(repoRoot, 'package.json');
if (!existsSync(rootManifestPath)) {
  failures.push('package.json: root manifest is missing');
} else {
  const rootManifest = JSON.parse(readFileSync(rootManifestPath, 'utf8'));
  const mutationScript = rootManifest.scripts?.['test:mutation'];
  for (const requiredFragment of [
    'pnpm verify:mutation-roster',
    '--filter "./packages/*"',
    '--filter "./packages-web/*"',
  ]) {
    if (typeof mutationScript !== 'string' || !mutationScript.includes(requiredFragment)) {
      failures.push(`test:mutation must include ${JSON.stringify(requiredFragment)}`);
    }
  }
}

if (failures.length > 0) {
  console.error('[mutation-roster] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

roster.sort((left, right) => left.name.localeCompare(right.name));
console.log(`[mutation-roster] OK: ${roster.length} configured packages are executable`);
for (const entry of roster) console.log(`- ${entry.name}: ${entry.config}`);
