import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const angularDist = join(repoRoot, 'packages-web/angular/dist');
const dependencyRoot = join(repoRoot, 'packages-web/angular/node_modules');
const typescriptCli = join(dependencyRoot, 'typescript/bin/tsc');
const packageName = '@stynx-nyx/angular';
const testingFesm = 'fesm2022/stynx-nyx-angular-testing.mjs';
const testingTypes = 'types/stynx-nyx-angular-testing.d.ts';

function createConsumer() {
  const root = mkdtempSync(join(tmpdir(), 'stynx-angular-consumer-'));
  const consumerRoot = join(root, 'consumer');
  const nodeModules = join(consumerRoot, 'node_modules');
  const scopeRoot = join(nodeModules, '@stynx-nyx');
  const angularPackage = join(scopeRoot, 'angular');
  mkdirSync(scopeRoot, { recursive: true });
  mkdirSync(consumerRoot, { recursive: true });
  cpSync(angularDist, angularPackage, { recursive: true });
  writeFileSync(join(consumerRoot, 'package.json'), JSON.stringify({
    name: 'angular-testing-consumer',
    private: true,
    type: 'module',
  }));

  for (const dependency of ['@angular', '@stynx-nyx', 'rxjs', 'tslib']) {
    if (dependency.startsWith('@')) {
      const sourceScope = join(dependencyRoot, dependency);
      mkdirSync(join(nodeModules, dependency), { recursive: true });
      const packageNames = dependency === '@angular'
        ? ['common', 'compiler', 'core', 'router']
        : dependency === '@stynx-nyx' ? ['angular-tenancy', 'sdk'] : [];
      for (const name of packageNames) {
        symlinkSync(join(sourceScope, name), join(nodeModules, dependency, name), 'dir');
      }
    } else {
      symlinkSync(join(dependencyRoot, dependency), join(nodeModules, dependency), 'dir');
    }
  }

  const sourcePath = join(consumerRoot, 'consumer.ts');
  writeFileSync(sourcePath, [
    "import { HttpContext } from '@angular/common/http';",
    `import { FakeStynxEventStreamClock, FakeStynxEventStreamTransport } from '${packageName}/testing';`,
    'const clock = new FakeStynxEventStreamClock();',
    'const transport = new FakeStynxEventStreamTransport();',
    'clock.advanceBy(1);',
    "transport.connect({ url: '/events', lastEventId: null, context: new HttpContext() });",
    'export { clock, transport };',
  ].join('\n'));
  return { root, consumerRoot, angularPackage, sourcePath };
}

function runTypeScript(consumer, resolution) {
  const moduleOptions = resolution === 'bundler'
    ? ['--module', 'ESNext', '--moduleResolution', 'Bundler']
    : ['--module', 'Node16', '--moduleResolution', 'Node16'];
  return spawnSync(process.execPath, [
    typescriptCli,
    '--noEmit',
    '--strict',
    '--target',
    'ES2022',
    ...moduleOptions,
    consumer.sourcePath,
  ], { cwd: consumer.consumerRoot, encoding: 'utf8' });
}

function assertCommandSucceeded(result, label) {
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${label}\n${result.stdout}\n${result.stderr}`);
}

test('the packed Angular testing entry resolves through its exports map at runtime and in TypeScript', async (t) => {
  assert.equal(existsSync(join(angularDist, testingFesm)), true, 'built testing FESM must exist');
  assert.equal(existsSync(join(angularDist, testingTypes)), true, 'built testing declaration must exist');
  assert.equal(existsSync(typescriptCli), true, 'workspace TypeScript compiler must exist');
  const consumer = createConsumer();
  t.after(() => rmSync(consumer.root, { recursive: true, force: true }));

  const runtime = spawnSync(process.execPath, ['--input-type=module', '-e', [
    "import '@angular/compiler';",
    `import { FakeStynxEventStreamClock, FakeStynxEventStreamTransport } from '${packageName}/testing';`,
    "if (typeof FakeStynxEventStreamClock !== 'function' || typeof FakeStynxEventStreamTransport !== 'function') process.exit(2);",
  ].join('\n')], { cwd: consumer.consumerRoot, encoding: 'utf8' });
  assertCommandSucceeded(runtime, 'runtime ESM consumer import');
  assertCommandSucceeded(runTypeScript(consumer, 'bundler'), 'TypeScript bundler resolution');
  assertCommandSucceeded(runTypeScript(consumer, 'node16'), 'TypeScript Node16 resolution');
});

test('the consumer rejects a missing testing FESM artifact', async (t) => {
  const consumer = createConsumer();
  t.after(() => rmSync(consumer.root, { recursive: true, force: true }));
  rmSync(join(consumer.angularPackage, testingFesm));

  const runtime = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import '@angular/compiler';\nimport '${packageName}/testing';`], { cwd: consumer.consumerRoot, encoding: 'utf8' });
  assert.ifError(runtime.error);
  assert.notEqual(runtime.status, 0, 'package consumer must fail when the FESM is absent');
  assert.match(runtime.stderr, /stynx-nyx-angular-testing\.mjs/u);
});

test('the consumer rejects a missing testing declaration artifact', async (t) => {
  const consumer = createConsumer();
  t.after(() => rmSync(consumer.root, { recursive: true, force: true }));
  rmSync(join(consumer.angularPackage, testingTypes));

  for (const resolution of ['bundler', 'node16']) {
    const result = runTypeScript(consumer, resolution);
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, `${resolution} consumer must fail when the declaration is absent`);
    assert.match(
      result.stdout + result.stderr,
      /stynx-nyx-angular-testing\.d\.ts|Cannot find module|Could not find a declaration file/u,
    );
  }
});
