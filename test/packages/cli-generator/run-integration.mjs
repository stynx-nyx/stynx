#!/usr/bin/env node
/** INV-CLI-001..004 and INV-RBAC-001: packed STYNX-only generator consumer. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import * as ts from 'typescript';

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(fixtureDir, '../../..');
const loopbackRegistry = 'http://127.0.0.1:1/';
const tempRoot = mkdtempSync(join(tmpdir(), 'stynx-cli-generator-consumer-'));
const packDir = join(tempRoot, 'packs');
const consumerDir = join(tempRoot, 'consumer');
const directStynx = ['@stynx-nyx/cli', '@stynx-nyx/core', '@stynx-nyx/data', '@stynx-nyx/auth', '@stynx-nyx/sessions'];
const thirdParty = {
  '@nestjs/common': '11.2.3',
  '@nestjs/core': '11.2.3',
  '@nestjs/platform-express': '11.2.3',
  '@nestjs/testing': '11.2.3',
  '@types/node': '24.13.4',
  '@types/pg': '8.20.0',
  '@types/supertest': '7.2.0',
  pg: '8.21.0',
  'reflect-metadata': '0.2.2',
  rxjs: '7.8.2',
  supertest: '7.2.2',
  typescript: '6.0.3',
};

class SensorFailure extends Error { kind = 'FAIL'; }
class Unobserved extends Error { kind = 'UNOBSERVED'; }
function assert(condition, message) { if (!condition) throw new SensorFailure(message); }
function shell(args, cwd, options = {}) {
  const result = spawnSync('corepack', ['pnpm', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, ...options.env },
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.error || result.status !== 0) {
    const error = new Error(`pnpm ${args.join(' ')} failed (${result.status ?? result.error?.message})\n${output}`);
    error.output = output;
    throw error;
  }
  return (result.stdout ?? '').trim();
}
function node(args, cwd, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.error || result.status !== 0) {
    const error = new Error(`node ${args.join(' ')} failed (${result.status ?? result.error?.message})\n${output}`);
    error.output = output;
    throw error;
  }
  return (result.stdout ?? '').trim();
}
function binary(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.error || result.status !== 0) {
    const error = new Error(`${command} ${args.join(' ')} failed (${result.status ?? result.error?.message})\n${output}`);
    error.output = output;
    throw error;
  }
  return (result.stdout ?? '').trim();
}
function binaryFailure(command, args, cwd, expected) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024, env: process.env,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  assert(!result.error && result.status !== 0, `${command} unexpectedly accepted invalid output: ${output}`);
  assert(output.includes(expected), `${command} failed for a different reason: ${output}`);
}
function outputBytes(root) {
  const files = new Map();
  function walk(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      assert(!entry.isSymbolicLink(), `generated output contains symlink ${path}`);
      if (entry.isDirectory()) walk(join(dir, entry.name), path);
      else files.set(path, readFileSync(join(dir, entry.name)).toString('base64'));
    }
  }
  walk(root);
  return [...files].sort(([a], [b]) => a.localeCompare(b));
}
function assertOutputUnchanged(root, before, reason) {
  assert(JSON.stringify(outputBytes(root)) === JSON.stringify(before), `${reason} changed generated output`);
}
function assertManifestDigests(root) {
  const manifest = JSON.parse(readFileSync(join(root, 'generation-manifest.json'), 'utf8'));
  const bytes = outputBytes(root);
  const paths = bytes.map(([path]) => path).filter((path) => path !== 'generation-manifest.json');
  assert(Array.isArray(manifest.files), 'generated manifest lacks files array');
  assert(JSON.stringify(manifest.files.map((entry) => entry.path)) === JSON.stringify(paths), 'generated manifest file set or order differs');
  for (const entry of manifest.files) {
    const digest = createHash('sha256').update(readFileSync(join(root, entry.path))).digest('hex');
    assert(entry.sha256 === digest, `generated manifest digest differs for ${entry.path}`);
  }
}
function localPackages() {
  const byName = new Map();
  for (const root of ['packages', 'packages-web']) {
    for (const entry of readdirSync(join(repoRoot, root), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(repoRoot, root, entry.name);
      const path = join(dir, 'package.json');
      if (!existsSync(path)) continue;
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      if (!manifest.name?.startsWith('@stynx-nyx/')) continue;
      assert(!byName.has(manifest.name), `duplicate local STYNX package ${manifest.name}`);
      byName.set(manifest.name, { dir, manifest });
    }
  }
  return byName;
}
function closureInBuildOrder(byName) {
  const visiting = new Set();
  const visited = new Set();
  const order = [];
  function visit(name) {
    if (visited.has(name)) return;
    assert(!visiting.has(name), `STYNX dependency cycle at ${name}`);
    const spec = byName.get(name);
    assert(spec, `unresolved local STYNX dependency ${name}`);
    visiting.add(name);
    for (const dependency of Object.keys({ ...spec.manifest.dependencies, ...spec.manifest.peerDependencies }).sort()) {
      if (dependency.startsWith('@stynx-nyx/')) visit(dependency);
    }
    visiting.delete(name);
    visited.add(name);
    order.push(name);
  }
  for (const name of directStynx) visit(name);
  return order;
}
function assertThirdPartyPins() {
  const lock = parseYaml(readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf8'));
  const packageKeys = Object.keys(lock.packages ?? {});
  for (const [name, version] of Object.entries(thirdParty)) {
    assert(packageKeys.some((key) => key.startsWith(`${name}@${version}`)), `${name}@${version} absent from frozen workspace graph`);
  }
}
function packedTarball(stdout, name) {
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new SensorFailure(`pnpm pack did not return JSON for ${name}: ${stdout}`); }
  const filename = (Array.isArray(parsed) ? parsed[0] : parsed)?.filename;
  assert(typeof filename === 'string' && filename.endsWith('.tgz'), `missing tarball for ${name}`);
  const path = isAbsolute(filename) ? filename : resolve(packDir, filename);
  assert(existsSync(path), `tarball missing: ${path}`);
  return path;
}
function verifyPackManifest(tarball, name) {
  const result = spawnSync('tar', ['-xOf', tarball, 'package/package.json'], { encoding: 'utf8' });
  assert(result.status === 0, `cannot inspect tarball ${name}`);
  const manifest = JSON.parse(result.stdout);
  assert(manifest.name === name, `tarball name mismatch: ${name}`);
  assert(!JSON.stringify(manifest).includes('workspace:'), `workspace dependency leaked into ${name} tarball`);
  assert(manifest.exports?.['.'], `packed ${name} lacks public root export`);
}
function sha512Sri(tarball) {
  return `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`;
}
async function assertLoopbackUnreachable() {
  await new Promise((done, reject) => {
    const socket = connect(1, '127.0.0.1');
    socket.setTimeout(1500);
    socket.once('connect', () => { socket.destroy(); reject(new SensorFailure(`STYNX registry isolation endpoint ${loopbackRegistry} is reachable`)); });
    socket.once('error', (error) => error.code === 'ECONNREFUSED' ? done() : reject(error));
    socket.once('timeout', () => { socket.destroy(); reject(new SensorFailure('loopback isolation probe timed out')); });
  });
}
function writeConsumer(tarballs, order) {
  mkdirSync(consumerDir, { recursive: true });
  const overrides = Object.fromEntries(order.map((name) => [name, `file:${tarballs.get(name)}`]));
  const dependencies = { ...thirdParty };
  for (const name of directStynx) dependencies[name] = `file:${tarballs.get(name)}`;
  const manifest = {
    name: 'stynx-cli-generator-external-consumer', private: true, version: '1.0.0',
    scripts: { build: 'tsc -p tsconfig.json' },
    dependencies,
    pnpm: { overrides },
  };
  writeFileSync(join(consumerDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const written = JSON.parse(readFileSync(join(consumerDir, 'package.json'), 'utf8'));
  const actualOverrides = written.pnpm?.overrides ?? {};
  assert(JSON.stringify(Object.keys(actualOverrides).sort()) === JSON.stringify([...order].sort()), 'written consumer override set differs from manifest-computed STYNX closure');
  for (const name of order) assert(actualOverrides[name] === `file:${tarballs.get(name)}`, `written consumer override for ${name} differs from its packed tarball`);
  writeFileSync(join(consumerDir, '.npmrc'), `@stynx-nyx:registry=${loopbackRegistry}\nregistry=https://registry.npmjs.org/\n`);
  writeFileSync(join(consumerDir, 'tsconfig.json'), `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext',
      strict: true, skipLibCheck: true, esModuleInterop: true,
      experimentalDecorators: true, emitDecoratorMetadata: true,
      rootDir: '.', outDir: 'dist', types: ['node'],
    },
    include: ['generated/src/**/*.ts', 'runtime.ts'],
  }, null, 2)}\n`);
  copyFileSync(join(fixtureDir, 'consumer-runtime.ts'), join(consumerDir, 'runtime.ts'));
}
function lockfileProof(tarballs, order) {
  const lock = parseYaml(readFileSync(join(consumerDir, 'pnpm-lock.yaml'), 'utf8'));
  const packages = lock.packages ?? {};
  const actual = new Set();
  for (const [key, info] of Object.entries(packages)) {
    const match = /^(@stynx-nyx\/[^@]+)@(.+)$/.exec(key);
    if (!match) continue;
    const [, name, resolutionKey] = match;
    actual.add(name);
    assert(order.includes(name), `unexpected installed STYNX package ${name}`);
    assert(resolutionKey.startsWith('file:'), `${name} resolution is not a file tarball: ${resolutionKey}`);
    const tarball = tarballs.get(name);
    assert(tarball && resolutionKey.includes(basename(tarball)), `${name} resolved a different tarball`);
    const resolution = info?.resolution ?? {};
    assert(typeof resolution.tarball === 'string' && resolution.tarball.startsWith('file:') && resolution.tarball.includes(basename(tarball)), `${name} lockfile tarball resolution is not the local pack`);
    assert(resolution.integrity === sha512Sri(tarball), `${name} tarball SHA-512 SRI mismatch`);
  }
  assert(JSON.stringify([...actual].sort()) === JSON.stringify([...order].sort()), `installed STYNX set differs: ${[...actual].sort().join(', ')}`);
  const importer = lock.importers?.['.'];
  for (const name of directStynx) {
    const version = importer?.dependencies?.[name]?.version;
    assert(typeof version === 'string' && version.startsWith('file:') && version.includes(basename(tarballs.get(name))), `consumer importer did not use ${name} tarball`);
  }
}
async function registryProbe() {
  try {
    const response = await fetch('https://registry.npmjs.org/typescript', { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch { return false; }
}
function failedStynxTarget(output, tarballs) {
  for (const line of output.split(/\r?\n/)) {
    const target = line.match(/\b(?:GET|fetch(?:ing)?|resolv(?:e|ing)|No matching version found for)\s+(\S+)/i)?.[1];
    if (target) {
      const decoded = (() => { try { return decodeURIComponent(target); } catch { return target; } })();
      if (decoded.startsWith('@stynx-nyx/') || decoded.includes('/@stynx-nyx/')) return true;
    }
    if (/\b(?:ENOENT|ERR_PNPM_FETCH|failed to read|failed to fetch)\b/i.test(line)) {
      for (const tarball of tarballs.values()) if (line.includes(basename(tarball))) return true;
    }
  }
  return false;
}
async function classifyInstallFailure(error, tarballs) {
  const output = error.output ?? error.message;
  if (output.includes(loopbackRegistry) || failedStynxTarget(output, tarballs)) {
    throw new SensorFailure(`STYNX package fetch/resolution failure:\n${output}`);
  }
  if (/ECONN|ENOTFOUND|ETIMEDOUT|ERR_PNPM_FETCH|ERR_SOCKET|network|registry/i.test(output) && !await registryProbe()) {
    throw new Unobserved(`third-party registry unavailable after independent probe:\n${output}`);
  }
  throw new SensorFailure(`consumer installation failed:\n${output}`);
}
function assertGenerated(out, sample) {
  const expected = sample ? ['src/example.module.ts', 'src/example.repository.ts', 'src/example.controller.ts', 'database/ops_example.sql'] : ['src/crud_probe.module.ts', 'src/crud_probe.repository.ts', 'src/crud_probe.controller.ts', 'database/cli_probe_crud_probe.sql'];
  for (const path of expected) assert(existsSync(join(out, path)), `generated output missing ${path}`);
  const controller = readFileSync(join(out, expected[2]), 'utf8');
  const keys = [...controller.matchAll(/@Permission\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
  const expectedKeys = sample ? ['ops.example_record.list', 'ops.example_record.get'] : [
    'cli_probe.record_item.list', 'cli_probe.record_item.get', 'cli_probe.record_item.create',
    'cli_probe.record_item.update', 'cli_probe.record_item.delete', 'cli_probe.note_item.list', 'cli_probe.note_item.get',
  ];
  assert(JSON.stringify([...keys].sort()) === JSON.stringify(expectedKeys.sort()), `generated permission keys differ: ${keys.join(', ')}`);
  assert(new Set(keys).size === keys.length, 'generated permission keys are not unique');
  assert(!/@Public\b|@PublicTenantRoute\b|STYNX_PUBLIC_ROUTE/.test(controller), 'generated public route bypass');
}
function assertRouteStructure(out, blueprint) {
  const controllerFile = join(out, 'src', `${blueprint.module.name.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}.controller.ts`);
  const source = readFileSync(controllerFile, 'utf8');
  const ast = ts.createSourceFile(controllerFile, source, ts.ScriptTarget.Latest, true);
  assert(ast.parseDiagnostics.length === 0, `generated controller syntax error: ${controllerFile}`);
  const expected = new Map();
  for (const resource of blueprint.api.resources) {
    const entity = blueprint.database.entities.find((candidate) => candidate.name === resource.entity);
    assert(entity, `fixture resource references missing entity ${resource.entity}`);
    for (const operation of resource.operations) expected.set(`${operation}${entity.name}`, `${blueprint.module.namespace}.${entity.table}.${operation}`);
  }
  const seen = new Map();
  const http = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete']);
  function visit(node) {
    if (ts.isMethodDeclaration(node)) {
      const calls = (ts.getDecorators(node) ?? []).map((decorator) => decorator.expression).filter(ts.isCallExpression);
      const names = calls.map((call) => call.expression.getText(ast));
      if (names.some((name) => http.has(name))) {
        const method = node.name.getText(ast);
        const permissions = calls.filter((call) => call.expression.getText(ast) === 'Permission');
        assert(permissions.length === 1 && permissions[0].arguments.length === 1 && ts.isStringLiteral(permissions[0].arguments[0]), `${method} lacks one literal @Permission`);
        assert(!names.includes('Public') && !names.includes('PublicTenantRoute'), `${method} has public bypass decorator`);
        const key = permissions[0].arguments[0].text;
        assert(key === expected.get(method), `${method} permission key ${key} differs from validated resource`);
        assert(!seen.has(method), `duplicate HTTP method ${method}`);
        seen.set(method, key);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(JSON.stringify([...seen.keys()].sort()) === JSON.stringify([...expected.keys()].sort()), 'generated HTTP handler set differs from blueprint');
  assert(new Set(seen.values()).size === seen.size, 'generated HTTP permission keys are not unique');
  assert(!/STYNX_PUBLIC_ROUTE|@Public\b|@PublicTenantRoute\b/.test(source), 'generated public route marker');
  const allowlist = JSON.parse(readFileSync(join(repoRoot, 'law/invariants/RBAC-001-allowlist.json'), 'utf8'));
  for (const resource of blueprint.api.resources) {
    const path = `${blueprint.api.basePath}${resource.path}`;
    assert(!allowlist.entries.some((entry) => entry.path === path || entry.path === `${path}/:id`), `generated route ${path} is in RBAC allowlist`);
  }
}

try {
  await assertLoopbackUnreachable();
  assertThirdPartyPins();
  const byName = localPackages();
  const order = closureInBuildOrder(byName);
  mkdirSync(packDir, { recursive: true });
  const tarballs = new Map();
  for (const name of order) {
    const spec = byName.get(name);
    shell(['--dir', spec.dir, 'build'], repoRoot);
    const tarball = packedTarball(shell(['--dir', spec.dir, 'pack', '--pack-destination', packDir, '--json'], repoRoot), name);
    verifyPackManifest(tarball, name);
    tarballs.set(name, tarball);
  }
  writeConsumer(tarballs, order);
  try { shell(['install', '--prefer-offline', '--ignore-scripts'], consumerDir); }
  catch (error) { await classifyInstallFailure(error, tarballs); }
  lockfileProof(tarballs, order);
  const cliBinary = join(consumerDir, 'node_modules/.bin/stynx');
  assert(existsSync(cliBinary), 'packed CLI binary is absent');
  const sampleOut = join(consumerDir, 'sample-generated');
  const fullOut = join(consumerDir, 'generated');
  binary(cliBinary, ['generate', 'module', '--blueprint', join(repoRoot, 'packages/cli/test/fixtures/BP-OPS-EXAMPLE-001.json'), '--out', sampleOut], consumerDir);
  binary(cliBinary, ['generate', 'module', '--blueprint', join(fixtureDir, 'full-crud-blueprint.json'), '--out', fullOut], consumerDir);
  assertGenerated(sampleOut, true);
  assertGenerated(fullOut, false);
  assertManifestDigests(sampleOut);
  assertManifestDigests(fullOut);
  assertRouteStructure(sampleOut, JSON.parse(readFileSync(join(repoRoot, 'packages/cli/test/fixtures/BP-OPS-EXAMPLE-001.json'), 'utf8')));
  assertRouteStructure(fullOut, JSON.parse(readFileSync(join(fixtureDir, 'full-crud-blueprint.json'), 'utf8')));
  const fullBlueprint = join(fixtureDir, 'full-crud-blueprint.json');
  const beforeExisting = outputBytes(fullOut);
  binaryFailure(cliBinary, ['generate', 'module', '--blueprint', fullBlueprint, '--out', fullOut], consumerDir, '--out already exists');
  assertOutputUnchanged(fullOut, beforeExisting, 'pre-existing output refusal');
  binary(cliBinary, ['generate', 'module', '--blueprint', join(fixtureDir, 'full-crud-blueprint.json'), '--out', fullOut, '--check'], consumerDir);
  const driftFile = join(fullOut, 'src/crud_probe.module.ts');
  const original = readFileSync(driftFile);
  writeFileSync(driftFile, Buffer.concat([original, Buffer.from('// packed consumer drift\n')]));
  const beforeDriftCheck = outputBytes(fullOut);
  binaryFailure(cliBinary, ['generate', 'module', '--blueprint', fullBlueprint, '--out', fullOut, '--check'], consumerDir, '--check differs: src/crud_probe.module.ts');
  assertOutputUnchanged(fullOut, beforeDriftCheck, '--check drift failure');
  writeFileSync(driftFile, original);
  binary(cliBinary, ['generate', 'module', '--blueprint', fullBlueprint, '--out', fullOut, '--check'], consumerDir);
  shell(['run', 'build'], consumerDir);
  try {
    const runtime = node([join(consumerDir, 'dist/runtime.js')], consumerDir, {
      STYNX_CLI_GENERATED_DDL: join(fullOut, 'database/cli_probe_crud_probe.sql'),
    });
    assert(runtime.includes('CTG8_CONSUMER_PASS'), `consumer did not report PASS:\n${runtime}`);
  } catch (error) {
    if (/CTG8_DB_UNOBSERVED/.test(error.output ?? '')) throw new Unobserved(error.output);
    throw error;
  }
  console.log(`[cli-generator] PASS: ${order.length} current-source STYNX tarballs, lockfile SRI, external compile, Nest HTTP, two-tenant RLS`);
} catch (error) {
  console.error(`[cli-generator] ${error.kind ?? 'FAIL'}: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (process.env.STYNX_KEEP_CLI_GENERATOR_CONSUMER === '1') console.log(`[cli-generator] kept ${tempRoot}`);
  else rmSync(tempRoot, { recursive: true, force: true });
}
