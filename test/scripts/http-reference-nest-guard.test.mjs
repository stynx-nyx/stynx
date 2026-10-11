import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

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
      [
        fileURLToPath(new URL('./support/http-reference-nest-child.mjs', import.meta.url)),
        kind,
        fileURLToPath(new URL('../../packages/flow/package.json', import.meta.url)),
      ],
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
      }),
    );
  });
}
