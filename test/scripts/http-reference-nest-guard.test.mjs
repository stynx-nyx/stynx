import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';
import {
  historicalDiagnosticFlowManifest,
  versionedDiagnosticFlowManifestRefusal,
} from './support/http-runtime-historical-flow-manifest.mjs';

const repository = resolve(import.meta.dirname, '../..');
const diagnosticRoot = realpathSync(
  mkdtempSync(join(tmpdir(), 'stynx historical Nest guard espaço 日本語 ')),
);
// Exact production/helper bytes run in a diagnostic-owned layout. Only its
// non-evaluated manifest anchor is historical; every Nest dependency is still
// the actual installed package. This is never a candidate build/live handle.
function createDiagnosticLayout(root, manifestBytes) {
  for (const relative of [
    'scripts/lib/http-reference-nest-guard.mjs',
    'test/scripts/support/http-reference-nest-child.mjs',
  ]) {
    const bytes = readFileSync(join(repository, relative));
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    assert.deepEqual(readFileSync(target), bytes);
  }
  const manifest = join(root, 'packages/flow/package.json');
  mkdirSync(dirname(manifest), { recursive: true });
  writeFileSync(manifest, manifestBytes);
  symlinkSync(join(repository, 'node_modules'), join(root, 'node_modules'), 'dir');
  symlinkSync(
    join(repository, 'packages/flow/node_modules'),
    join(dirname(manifest), 'node_modules'),
    'dir',
  );
  return manifest;
}
const manifest = createDiagnosticLayout(diagnosticRoot, historicalDiagnosticFlowManifest());
after(() => rmSync(diagnosticRoot, { recursive: true, force: true }));

test('actual 1.6.0 Nest anchor refuses before installed dependency evaluation without changing the candidate', () => {
  const candidateManifest = readFileSync(join(repository, 'packages/flow/package.json'));
  const root = join(diagnosticRoot, 'actual-versioned-anchor-refusal');
  const anchor = createDiagnosticLayout(root, versionedDiagnosticFlowManifestRefusal());
  const child = spawnSync(
    process.execPath,
    [
      join(root, 'test/scripts/support/http-reference-nest-child.mjs'),
      'actual-versioned-anchor',
      anchor,
    ],
    {
      env: {
        PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
        NODE_DISABLE_COMPILE_CACHE: '1',
      },
      encoding: 'utf8',
      timeout: 10_000,
      killSignal: 'SIGKILL',
    },
  );
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.signal, null);
  assert.equal(child.stderr, '');
  const observation = JSON.parse(child.stdout);
  assert.equal(observation.status, 'PASS');
  assert.equal(observation.dependencyTargetsLoaded, 0);
  assert.equal(observation.runtimeCustodyComplete, false);
  assert.equal(observation.performanceQualified, false);
  assert.equal(observation.readinessPromoting, false);
  assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
  assert.deepEqual(readFileSync(join(repository, 'packages/flow/package.json')), candidateManifest);
});

// Every positive uses actual installed public NestFactory.create, a minimal
// real Module/owned provider and ExpressAdapter. Negative forwarding faults are
// disclosed component probes. No product factory/listener/service is launched.
for (const kind of [
  'positive',
  'concurrent-install',
  'first-throw',
  'second-throw',
  'adapter-mismatch',
  'duplicate-create',
  'wrong-app',
  'wrong-adapter',
  'method-drift',
  'descriptor-drift',
  'source-drift',
  'preexisting-method',
  'close-throw',
  'close-nonpromise',
  'rejected-close',
  'pending-close',
  'pending-create',
  'first-duplicate',
  'second-duplicate',
  'second-before-complete',
  'second-foreign-proxy',
  'second-foreign-adapter',
  'first-foreign-raw',
  'preloaded-factory',
  'preloaded-application',
  'preloaded-adapter',
  'cache-loaded-drift',
  'singleton-drift',
  'constructor-export-drift',
  'constructor-parent-drift',
  'forged-custody',
  'serialized-reuse',
  'prepare-arguments',
]) {
  test(`shared production Nest guard: real installed ${kind} with retained child closure`, async (t) => {
    const child = spawn(
      process.execPath,
      [join(diagnosticRoot, 'test/scripts/support/http-reference-nest-child.mjs'), kind, manifest],
      {
        env: {
          PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
          NODE_DISABLE_COMPILE_CACHE: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10_000,
        killSignal: 'SIGKILL',
      },
    );
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (bytes) => {
      stdout += bytes;
    });
    child.stderr.on('data', (bytes) => {
      stderr += bytes;
    });
    const status = await new Promise((accept, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => accept({ code, signal }));
    });
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
    assert.deepEqual(status, { code: 0, signal: null }, stderr);
    assert.equal(stderr, '');
    const observation = JSON.parse(stdout);
    assert.equal(observation.status, 'PASS');
    assert.equal(observation.kind, kind);
    assert.equal(observation.noListenerStarted, true);
    assert.equal(observation.runtimeCustodyComplete, false);
    assert.equal(observation.performanceQualified, false);
    assert.equal(observation.readinessPromoting, false);
    if (['close-throw', 'close-nonpromise', 'rejected-close'].includes(kind)) {
      assert.equal(observation.restored, false);
      assert.equal(observation.closeVerified, false);
      assert.equal(observation.snapshot.descriptorsRestored, false);
    } else if (
      ![
        'source-drift',
        'preexisting-method',
        'cache-loaded-drift',
        'singleton-drift',
        'constructor-export-drift',
        'constructor-parent-drift',
        'preloaded-factory',
        'preloaded-application',
        'preloaded-adapter',
      ].includes(kind)
    ) {
      assert.equal(observation.restored, true);
      assert.equal(observation.snapshot.descriptorsRestored, true);
    }
    if (kind === 'pending-create') {
      assert.equal(observation.closeVerified, false);
      assert.equal(observation.snapshot.publicAppAccepted, false);
      assert.equal(observation.snapshot.failure, 'CLEANUP_INCOMPLETE');
      assert.equal(observation.snapshot.actualCloseResolved, true);
    }
    t.diagnostic(
      JSON.stringify({
        ...observation,
        actualChildPid: child.pid,
        actualChildCloseObserved: true,
        actualChildAbsence: 'ESRCH',
        productFactoryAccepted: false,
        diagnosticHistoricalManifest: true,
        productionGuardSha256: createHash('sha256')
          .update(readFileSync(join(diagnosticRoot, 'scripts/lib/http-reference-nest-guard.mjs')))
          .digest('hex'),
      }),
    );
  });
}
