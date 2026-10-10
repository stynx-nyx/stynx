#!/usr/bin/env node
/** Installed public i18n/auth/tenancy acceptance; no source aliases or runtime stubs. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import * as ts from 'typescript';

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(fixtureDir, '../../..');
const loopbackRegistry = 'http://127.0.0.1:1/';
const tempRoot = mkdtempSync(join(tmpdir(), 'stynx-i18n-consumer-é '));
const packDir = join(tempRoot, 'packs');
const consumerDir = join(tempRoot, 'consumer');
const directStynx = [
  '@stynx-nyx/contracts',
  '@stynx-nyx/core',
  '@stynx-nyx/data',
  '@stynx-nyx/idempotency',
  '@stynx-nyx/sessions',
  '@stynx-nyx/auth',
  '@stynx-nyx/i18n',
  '@stynx-nyx/tenancy',
];
const thirdParty = {
  '@nestjs/common': '11.2.3',
  '@nestjs/core': '11.2.3',
  '@nestjs/platform-express': '11.2.3',
  '@nestjs/testing': '11.2.3',
  '@types/node': '24.13.4',
  '@types/pg': '8.20.0',
  '@types/supertest': '7.2.0',
  pg: '8.23.1',
  'intl-messageformat': '11.2.14',
  'reflect-metadata': '0.2.2',
  rxjs: '7.8.2',
  supertest: '7.2.2',
  typescript: '6.0.3',
};

class SensorFailure extends Error {
  kind = 'FAIL';
}
class Unobserved extends Error {
  kind = 'UNOBSERVED';
}
function assert(condition, message) {
  if (!condition) throw new SensorFailure(message);
}
function shell(args, cwd, options = {}) {
  const result = spawnSync('corepack', ['pnpm', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, ...options.env },
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.error || result.status !== 0) {
    const error = new Error(
      `pnpm ${args.join(' ')} failed (${result.status ?? result.error?.message})\n${output}`,
    );
    error.output = output;
    throw error;
  }
  return (result.stdout ?? '').trim();
}
function node(args, cwd, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.error || result.status !== 0) {
    const error = new Error(
      `node ${args.join(' ')} failed (${result.status ?? result.error?.message})\n${output}`,
    );
    error.output = output;
    throw error;
  }
  return (result.stdout ?? '').trim();
}
function binary(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.error || result.status !== 0) {
    const error = new Error(
      `${command} ${args.join(' ')} failed (${result.status ?? result.error?.message})\n${output}`,
    );
    error.output = output;
    throw error;
  }
  return (result.stdout ?? '').trim();
}
function binaryFailure(command, args, cwd, expected) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  assert(
    !result.error && result.status !== 0,
    `${command} unexpectedly accepted invalid output: ${output}`,
  );
  assert(output.includes(expected), `${command} failed for a different reason: ${output}`);
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
    for (const dependency of Object.keys({
      ...spec.manifest.dependencies,
      ...spec.manifest.peerDependencies,
    }).sort()) {
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
    assert(
      packageKeys.some((key) => key.startsWith(`${name}@${version}`)),
      `${name}@${version} absent from frozen workspace graph`,
    );
  }
}
function packedTarball(stdout, name) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new SensorFailure(`pnpm pack did not return JSON for ${name}: ${stdout}`);
  }
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
  assert(
    !JSON.stringify(manifest).includes('workspace:'),
    `workspace dependency leaked into ${name} tarball`,
  );
  assert(manifest.exports?.['.'], `packed ${name} lacks public root export`);
}
function sha512Sri(tarball) {
  return `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`;
}
async function assertLoopbackUnreachable() {
  await new Promise((done, reject) => {
    const socket = connect(1, '127.0.0.1');
    socket.setTimeout(1500);
    socket.once('connect', () => {
      socket.destroy();
      reject(
        new SensorFailure(`STYNX registry isolation endpoint ${loopbackRegistry} is reachable`),
      );
    });
    socket.once('error', (error) => (error.code === 'ECONNREFUSED' ? done() : reject(error)));
    socket.once('timeout', () => {
      socket.destroy();
      reject(new SensorFailure('loopback isolation probe timed out'));
    });
  });
}
function frozenDependencyOverrides(order) {
  const lock = parseYaml(readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf8'));
  const overrides = {},
    visited = new Set();
  function edge(parent, dependency, reference) {
    assert(
      typeof reference === 'string' && !/^(?:link:|file:|workspace:|npm:)/u.test(reference),
      `unsupported frozen registry edge ${parent}>${dependency}`,
    );
    const version = reference.split('(')[0];
    const selector = `${parent}>${dependency}`;
    assert(
      !Object.hasOwn(overrides, selector) || overrides[selector] === version,
      `ambiguous frozen edge ${selector}`,
    );
    overrides[selector] = version;
    visit(`${dependency}@${reference}`);
  }
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const base = key.split('(')[0];
    const snapshot = lock.snapshots?.[key];
    assert(snapshot, `frozen snapshot missing ${key}`);
    for (const [dependency, reference] of Object.entries({
      ...snapshot.dependencies,
      ...snapshot.optionalDependencies,
    }))
      edge(base, dependency, reference);
  }
  for (const name of order) {
    const spec = localPackages().get(name);
    const importer = lock.importers?.[`packages/${name.split('/')[1]}`];
    assert(importer, `frozen importer missing ${name}`);
    for (const [dependency, record] of Object.entries(importer.dependencies ?? {}))
      if (!dependency.startsWith('@stynx-nyx/'))
        edge(`${name}@${spec.manifest.version}`, dependency, record.version);
  }
  for (const [name, version] of Object.entries(thirdParty)) {
    const keys = Object.keys(lock.snapshots ?? {}).filter(
      (key) => key === `${name}@${version}` || key.startsWith(`${name}@${version}(`),
    );
    assert(keys.length > 0, `fixture snapshot missing ${name}@${version}`);
    for (const key of keys) visit(key);
  }
  return overrides;
}
function writeConsumer(tarballs, order) {
  mkdirSync(consumerDir, { recursive: true });
  const overrides = {
    ...frozenDependencyOverrides(order),
    ...Object.fromEntries(order.map((name) => [name, `file:${tarballs.get(name)}`])),
  };
  const dependencies = { ...thirdParty };
  for (const name of directStynx) dependencies[name] = `file:${tarballs.get(name)}`;
  const manifest = {
    name: 'stynx-i18n-installed-consumer',
    private: true,
    version: '1.0.0',
    scripts: { build: 'tsc -p tsconfig.json' },
    dependencies,
    pnpm: { overrides },
  };
  writeFileSync(join(consumerDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const written = JSON.parse(readFileSync(join(consumerDir, 'package.json'), 'utf8'));
  const actualOverrides = written.pnpm?.overrides ?? {};
  assert(
    JSON.stringify(
      Object.keys(actualOverrides)
        .filter((key) => order.includes(key))
        .sort(),
    ) === JSON.stringify([...order].sort()),
    'written consumer override set differs from manifest-computed STYNX closure',
  );
  for (const name of order)
    assert(
      actualOverrides[name] === `file:${tarballs.get(name)}`,
      `written consumer override for ${name} differs from its packed tarball`,
    );
  writeFileSync(
    join(consumerDir, '.npmrc'),
    `@stynx-nyx:registry=${loopbackRegistry}\nregistry=https://registry.npmjs.org/\n`,
  );
  writeFileSync(
    join(consumerDir, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: true,
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          rootDir: '.',
          outDir: 'dist',
          types: ['node'],
        },
        include: ['*.ts'],
      },
      null,
      2,
    )}\n`,
  );
  for (const file of [
    'consumer-runtime.ts',
    'authenticated-app.ts',
    'postgres.ts',
    'consumer-imports.mjs',
  ])
    copyFileSync(join(fixtureDir, file), join(consumerDir, file));
}
function lockfileProof(tarballs, order) {
  const lock = parseYaml(readFileSync(join(consumerDir, 'pnpm-lock.yaml'), 'utf8'));
  const packages = lock.packages ?? {};
  const frozen = parseYaml(readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf8'));
  for (const [key, info] of Object.entries(packages)) {
    if (key.startsWith('@stynx-nyx/')) continue;
    assert(frozen.packages?.[key], `installed third-party version outside frozen graph: ${key}`);
    assert(
      info.resolution?.integrity === frozen.packages[key].resolution?.integrity,
      `third-party integrity drift: ${key}`,
    );
  }

  const actual = new Set();
  for (const [key, info] of Object.entries(packages)) {
    const match = /^(@stynx-nyx\/[^@]+)@(.+)$/.exec(key);
    if (!match) continue;
    const [, name, resolutionKey] = match;
    actual.add(name);
    assert(order.includes(name), `unexpected installed STYNX package ${name}`);
    assert(
      resolutionKey.startsWith('file:'),
      `${name} resolution is not a file tarball: ${resolutionKey}`,
    );
    const tarball = tarballs.get(name);
    assert(
      tarball && resolutionKey.includes(basename(tarball)),
      `${name} resolved a different tarball`,
    );
    const resolution = info?.resolution ?? {};
    assert(
      typeof resolution.tarball === 'string' &&
        resolution.tarball.startsWith('file:') &&
        resolution.tarball.includes(basename(tarball)),
      `${name} lockfile tarball resolution is not the local pack`,
    );
    assert(resolution.integrity === sha512Sri(tarball), `${name} tarball SHA-512 SRI mismatch`);
  }
  assert(
    JSON.stringify([...actual].sort()) === JSON.stringify([...order].sort()),
    `installed STYNX set differs: ${[...actual].sort().join(', ')}`,
  );
  const importer = lock.importers?.['.'];
  for (const name of directStynx) {
    const version = importer?.dependencies?.[name]?.version;
    assert(
      typeof version === 'string' &&
        version.startsWith('file:') &&
        version.includes(basename(tarballs.get(name))),
      `consumer importer did not use ${name} tarball`,
    );
  }
}
function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function custody(order, byName) {
  const files = ['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'package.json', 'tsconfig.json'];
  for (const name of order) {
    const { dir } = byName.get(name);
    function walk(root) {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(root, entry.name));
        else if (/\.(?:ts|sql|json)$/u.test(entry.name)) files.push(join(root, entry.name));
      }
    }
    walk(join(dir, 'src'));
    for (const file of ['package.json', 'tsconfig.json', 'tsconfig.build.json'])
      if (existsSync(join(dir, file))) files.push(join(dir, file));
    if (existsSync(join(dir, 'migrations'))) walk(join(dir, 'migrations'));
  }
  return Object.fromEntries(
    files
      .sort()
      .map((file) => [file, hash(readFileSync(isAbsolute(file) ? file : join(repoRoot, file)))]),
  );
}
const report = {
  scope:
    'Installed package i18n functional acceptance; no Redis, production provider, complete performance or release PASS',
  candidate: binary('git', ['rev-parse', 'HEAD'], repoRoot).trim(),
  tree: binary('git', ['rev-parse', 'HEAD^{tree}'], repoRoot).trim(),
  node: process.version,
  pnpm: shell(['--version'], repoRoot),
  tempRoot,
};
try {
  await assertLoopbackUnreachable();
  assertThirdPartyPins();
  const byName = localPackages();
  const order = closureInBuildOrder(byName);
  assert(
    JSON.stringify([...order].sort()) ===
      JSON.stringify(
        ['contracts', 'core', 'data', 'idempotency', 'sessions', 'auth', 'i18n', 'tenancy']
          .map((name) => '@stynx-nyx/' + name)
          .sort(),
      ),
    'runtime closure changed; review required',
  );
  frozenDependencyOverrides(order);
  report.sourceBefore = custody(order, byName);
  report.packages = [];
  mkdirSync(packDir, { recursive: true });
  const tarballs = new Map();
  for (const name of order) {
    const spec = byName.get(name);
    console.log(`[i18n-installed] fresh build ${name}`);
    const build = shell(['--dir', spec.dir, 'build'], repoRoot);
    writeFileSync(join(tempRoot, name.split('/')[1] + '-build.log'), build);
    const tarball = packedTarball(
      shell(['--dir', spec.dir, 'pack', '--pack-destination', packDir, '--json'], repoRoot),
      name,
    );
    verifyPackManifest(tarball, name);
    tarballs.set(name, tarball);
    report.packages.push({
      name,
      tarball,
      sha256: hash(readFileSync(tarball)),
      integrity: sha512Sri(tarball),
      packedManifest: JSON.parse(
        binary('tar', ['-xOf', tarball, 'package/package.json'], repoRoot),
      ),
    });
  }
  report.sourceAfter = custody(order, byName);
  assert(
    JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter),
    'source changed during build/pack',
  );
  assert(
    binary('git', ['rev-parse', 'HEAD'], repoRoot).trim() === report.candidate,
    'candidate moved during build/pack',
  );
  writeConsumer(tarballs, order);
  const catalog = join(consumerDir, 'packages/fixture/i18n');
  mkdirSync(catalog, { recursive: true });
  writeFileSync(
    join(catalog, 'pt-BR.json'),
    JSON.stringify({
      title: 'Global title',
      ITEM_COUNT: '{count, plural, one {# item} other {# itens}}',
      GREETING: 'Olá, {name}!',
    }),
  );
  writeFileSync(
    join(catalog, 'en-US.json'),
    JSON.stringify({
      title: 'Global title',
      GREETING: 'Hello, {name}!',
      EN_ONLY: 'English fallback',
    }),
  );
  shell(['install', '--prefer-offline', '--ignore-scripts'], consumerDir, {
    env: { NODE_PATH: '', NODE_OPTIONS: '' },
  });
  lockfileProof(tarballs, order);
  shell(['run', 'build'], consumerDir, { env: { NODE_PATH: '', NODE_OPTIONS: '' } });
  report.esm = node(['consumer-imports.mjs'], consumerDir, { NODE_PATH: '', NODE_OPTIONS: '' });
  assert(
    report.esm.includes('I18N_INSTALLED_ESM_CJS_IDENTITY_PASS'),
    'ESM/CJS identity witness absent',
  );
  report.runtime = node(['dist/consumer-runtime.js'], consumerDir, {
    NODE_PATH: '',
    NODE_OPTIONS: '',
  });
  assert(report.runtime.includes('I18N_INSTALLED_RUNTIME_PASS'), 'runtime witness absent');
  report.witnesses = JSON.parse(readFileSync(join(consumerDir, 'runtime-witnesses.json'), 'utf8'));
  assert(
    JSON.stringify(custody(order, byName)) === JSON.stringify(report.sourceBefore),
    'source moved during acceptance',
  );
  assert(
    binary('git', ['rev-parse', 'HEAD'], repoRoot).trim() === report.candidate,
    'candidate moved during acceptance',
  );
  report.status = 'PASS';
  console.log(
    '[i18n-installed] PASS: exact eight tarballs, real ICU, CJS/ESM class identity, installed migrations, restricted two-tenant HTTP and owned DB fault',
  );
} catch (error) {
  report.status = 'FAIL';
  report.error = error.message;
  console.error(`[i18n-installed] FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  writeFileSync(join(tempRoot, 'acceptance.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`[i18n-installed] evidence retained at ${tempRoot}`);
}
