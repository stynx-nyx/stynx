import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

for (const kind of [
  'positive',
  'never-launched',
  'forged',
  'external-adoption',
  'request-mutation',
  'buffered-observer',
  'subscriber-throw',
  'failed-spawn',
  'synchronous-spawn',
  'concurrent-reap',
  'kill-false',
  'kill-throw',
  'probe-eperm',
  'probe-unknown',
  'descendant',
]) {
  test(`production owned worker native ${kind} preserves acquisition and cleanup custody`, async (t) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('./support/http-owned-worker-driver.mjs', import.meta.url)), kind],
      {
        env: {
          PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
          NODE_DISABLE_COMPILE_CACHE: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 24_000,
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
    const exit = await new Promise((accept, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => accept({ code, signal }));
    });
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
    assert.deepEqual(exit, { code: 0, signal: null }, stderr);
    assert.equal(stderr, '');
    const result = JSON.parse(stdout);
    assert.equal(result.kind, kind);
    assert.equal(result.status, 'PASS');
    assert.equal(result.complete, kind !== 'synchronous-spawn');
    assert.equal(result.nativeSpawnSubstituted, false);
    assert.equal(result.actualFactoryInvoked, false);
    assert.equal(result.runtimeCustodyComplete, false);
    assert.equal(result.readinessPromoting, false);
    t.diagnostic(
      JSON.stringify({
        ...result,
        driverPid: child.pid,
        driverCloseObserved: true,
        driverAbsence: 'ESRCH',
      }),
    );
  });
}
