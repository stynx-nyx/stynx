// SM-10: the route-contract decorators STYNX keeps (`Idempotent`, `NoIdempotent`,
// `Permission`, `RequireRoles`) stay exported and typed from the published
// packages. The packages are packed with `pnpm pack`, extracted into a
// consumer outside the workspace and resolved only through that consumer's
// node_modules. `@ErrorContract`, `@UseCase` and `@Slo` ship from DEVAI v3
// (D-059), not from STYNX.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const entryPackages = ['@stynx-nyx/idempotency', '@stynx-nyx/auth', '@stynx-nyx/backend'];
const expected = [
  ['@stynx-nyx/idempotency', 'Idempotent'],
  ['@stynx-nyx/idempotency', 'NoIdempotent'],
  ['@stynx-nyx/auth', 'Permission'],
  ['@stynx-nyx/backend', 'RequireRoles'],
];
const v3Only = ['ErrorContract', 'UseCase', 'Slo'];
let fixture;

function workspacePackages() {
  const byName = new Map();
  for (const group of ['packages', 'packages-web']) {
    for (const entry of readdirSync(join(root, group))) {
      const manifestPath = join(root, group, entry, 'package.json');
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      byName.set(manifest.name, { dir: join(root, group, entry), manifest });
    }
  }
  return byName;
}

function closure(byName) {
  const seen = new Set();
  const pending = [...entryPackages];
  while (pending.length > 0) {
    const name = pending.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    const { manifest } = byName.get(name);
    for (const dep of Object.keys(manifest.dependencies ?? {})) {
      if (dep.startsWith('@stynx-nyx/') && byName.has(dep)) pending.push(dep);
    }
  }
  return [...seen].sort();
}

function linkThirdParty(nodeModules, fromDir, dep) {
  const target = join(nodeModules, dep);
  if (existsSync(target)) return;
  const source = join(fromDir, 'node_modules', dep);
  if (!existsSync(source)) return;
  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(realpathSync(source), target, 'dir');
}

before(() => {
  fixture = mkdtempSync(join(tmpdir(), 'stynx-route-decorators-consumer-é '));
  const archiveDir = join(fixture, 'archives');
  const nodeModules = join(fixture, 'node_modules');
  mkdirSync(archiveDir);
  const byName = workspacePackages();
  for (const name of closure(byName)) {
    const { dir, manifest } = byName.get(name);
    const before = new Set(readdirSync(archiveDir));
    execFileSync('pnpm', ['pack', '--pack-destination', archiveDir], {
      cwd: dir,
      stdio: 'pipe',
      timeout: 120000,
    });
    const archive = readdirSync(archiveDir).find((file) => !before.has(file));
    assert.ok(archive?.endsWith('.tgz'), `${name}: pnpm pack produced no archive`);
    const installed = join(nodeModules, name);
    mkdirSync(installed, { recursive: true });
    execFileSync('tar', [
      '-xzf',
      join(archiveDir, archive),
      '-C',
      installed,
      '--strip-components=1',
    ]);
    for (const dep of [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]) {
      if (!dep.startsWith('@stynx-nyx/')) linkThirdParty(nodeModules, dir, dep);
    }
  }
  linkThirdParty(nodeModules, join(root, 'packages/core'), '@types/node');
  writeFileSync(
    join(fixture, 'package.json'),
    JSON.stringify({ name: 'route-decorator-consumer', private: true, type: 'module' }),
  );
});

after(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});

test('packed packages export the four STYNX route decorators as functions', () => {
  const script = `import 'reflect-metadata';
const out = {};
for (const [pkg, name] of ${JSON.stringify(expected)}) {
  const mod = await import(pkg);
  out[pkg + '#' + name] = typeof mod[name];
  out[pkg + '#resolved'] = import.meta.resolve(pkg);
  for (const absent of ${JSON.stringify(v3Only)}) out[pkg + '#' + absent] = typeof mod[absent];
}
console.log(JSON.stringify(out));`;
  writeFileSync(join(fixture, 'probe.mjs'), script);
  const out = JSON.parse(
    execFileSync(process.execPath, ['probe.mjs'], {
      cwd: fixture,
      encoding: 'utf8',
      timeout: 60000,
    }),
  );
  const types = expected.map(([pkg, name]) => out[`${pkg}#${name}`]);
  assert.deepEqual(types, ['function', 'function', 'function', 'function']);
  for (const pkg of entryPackages) {
    assert.ok(
      out[`${pkg}#resolved`].startsWith(`file://${realpathSync(join(fixture, 'node_modules'))}`) ||
        out[`${pkg}#resolved`].includes('/node_modules/' + pkg + '/'),
      `${pkg} must resolve from the consumer's node_modules, got ${out[`${pkg}#resolved`]}`,
    );
    for (const absent of v3Only) {
      assert.equal(out[`${pkg}#${absent}`], 'undefined', `${pkg} must not ship ${absent} (D-059)`);
    }
  }
});

test('packed packages ship .d.ts declarations that type the decorators', () => {
  for (const [pkg, name] of expected) {
    const manifest = JSON.parse(
      readFileSync(join(fixture, 'node_modules', pkg, 'package.json'), 'utf8'),
    );
    const typesPath = join(fixture, 'node_modules', pkg, manifest.exports['.'].types);
    assert.ok(typesPath.endsWith('.d.ts') && existsSync(typesPath), `${pkg}: missing ${typesPath}`);
    const declarations = readdirSync(dirname(typesPath), { recursive: true })
      .filter((file) => String(file).endsWith('.d.ts'))
      .map((file) => readFileSync(join(dirname(typesPath), String(file)), 'utf8'));
    assert.ok(
      declarations.some((text) => text.includes(`export declare function ${name}(`)),
      `${pkg}: no declaration for ${name}`,
    );
  }
  writeFileSync(
    join(fixture, 'consumer.ts'),
    `import { Idempotent, NoIdempotent } from '@stynx-nyx/idempotency';
import { Permission } from '@stynx-nyx/auth';
import { RequireRoles } from '@stynx-nyx/backend';

export class NotesController {
  @Idempotent({ headerName: 'Idempotency-Key', ttlMs: 60000 })
  @Permission('notes:write')
  @RequireRoles(['editor'], 'all')
  create(): void {}

  @NoIdempotent()
  @RequireRoles(['reader'])
  list(): void {}
}

// @ts-expect-error RequireRoles takes an array of role names.
RequireRoles('editor');
// @ts-expect-error Permission takes one permission key.
Permission(42);
const decorators: Array<MethodDecorator & ClassDecorator> = [Idempotent(), NoIdempotent()];
export { decorators };
`,
  );
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--experimentalDecorators',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--target',
      'ES2022',
      '--types',
      'node',
      'consumer.ts',
    ],
    { cwd: fixture, stdio: 'pipe', timeout: 120000 },
  );
});
