#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { discoverPublishablePackages } from './lib/publishable-packages.mjs';

const repoRoot = process.cwd();
const write = process.argv.includes('--write');
const baselinePath = resolve(repoRoot, 'docs/framework/contracts/public-api-baselines.json');
const packageSpecs = discoverPublishablePackages(repoRoot);

for (const spec of packageSpecs) {
  rmSync(resolve(repoRoot, spec.dir, 'dist'), { recursive: true, force: true });
}
run('pnpm', ['build'], repoRoot);

const current = {
  schemaVersion: '1',
  packages: Object.fromEntries(packageSpecs.map((spec) => [spec.name, packageBaseline(spec)])),
};

if (write) {
  writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
  console.log(`[api-baseline] wrote ${relative(repoRoot, baselinePath)}`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  throw new Error(
    `Missing public API baseline at ${relative(repoRoot, baselinePath)}. Run pnpm api:baselines:write.`,
  );
}

const expected = JSON.parse(readFileSync(baselinePath, 'utf8'));
const failures = [];
for (const spec of packageSpecs) {
  const expectedPkg = expected.packages?.[spec.name];
  const actualPkg = current.packages[spec.name];
  if (!expectedPkg) {
    failures.push(`${spec.name}: missing baseline entry`);
    continue;
  }
  for (const [file, actualHash] of Object.entries(actualPkg.declarationHashes)) {
    const expectedHash = expectedPkg.declarationHashes?.[file];
    if (!expectedHash) failures.push(`${spec.name}: new public declaration ${file}`);
    else if (expectedHash !== actualHash)
      failures.push(`${spec.name}: public declaration changed ${file}`);
  }
  for (const file of Object.keys(expectedPkg.declarationHashes ?? {})) {
    if (!actualPkg.declarationHashes[file])
      failures.push(`${spec.name}: removed public declaration ${file}`);
  }
  const expectedExports = JSON.stringify(expectedPkg.exports ?? {});
  const actualExports = JSON.stringify(actualPkg.exports ?? {});
  if (expectedExports !== actualExports) failures.push(`${spec.name}: package exports changed`);
}

if (failures.length > 0) {
  console.error('[api-baseline] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[api-baseline] OK: ${packageSpecs.length} package baselines matched`);

function packageBaseline(spec) {
  const manifest = JSON.parse(readFileSync(resolve(repoRoot, spec.dir, 'package.json'), 'utf8'));
  const distDir = resolve(repoRoot, spec.dir, 'dist');
  const declarationFiles = walk(distDir)
    .filter((file) => file.endsWith('.d.ts'))
    .sort((left, right) => left.localeCompare(right));
  if (declarationFiles.length === 0) {
    throw new Error(
      `${spec.name}: build emitted no public declaration files under ${spec.dir}/dist`,
    );
  }
  const declarationHashes = Object.fromEntries(
    declarationFiles.map((file) => {
      const relativeFile = relative(distDir, file);
      const normalized = readFileSync(file, 'utf8').replace(/\r\n/gu, '\n').trim();
      return [relativeFile, createHash('sha256').update(normalized).digest('hex')];
    }),
  );
  return {
    exports: manifest.exports ?? {},
    declarationHashes,
  };
}

function walk(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`.trim(),
    );
  }
}
