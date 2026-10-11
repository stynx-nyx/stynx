import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  closeOwnedReferenceFixture,
  createOwnedReferenceFixture,
  observeOwnedReferenceFixture,
  ownedReferenceFixtureEnvironment,
} from '../../scripts/lib/http-reference-fixture.mjs';
import {
  prepareFreshHttpReferenceFixture,
  observeFreshHttpReferenceFixture,
} from '../../scripts/lib/http-fresh-build.mjs';

// INV-PERF-001: refused public requests do not create a resource campaign.
test('fixture request data is closed and refuses accessors without executing them', async () => {
  let reads = 0;
  const identity = { candidateCommit: 'a'.repeat(40), tree: 'b'.repeat(40), nonce: 'a'.repeat(36) };
  const accessor = { ...identity };
  Object.defineProperty(accessor, 'tree', {
    enumerable: true,
    get() {
      reads++;
      return identity.tree;
    },
  });
  for (const request of [
    undefined,
    {},
    { ...identity, extra: true },
    { ...identity, candidateCommit: 'not-a-sha' },
    { ...identity, nonce: 'short' },
    accessor,
    new Proxy(identity, {}),
  ])
    await assert.rejects(createOwnedReferenceFixture(request), {
      code: 'HTTP_REFERENCE_FIXTURE_REQUEST',
    });
  assert.equal(reads, 0);
  await assert.rejects(createOwnedReferenceFixture(identity, {}), {
    code: 'HTTP_REFERENCE_FIXTURE_REQUEST',
  });
});

test('forged receipts and cloned opaque handles grant neither parent nor fixture access', async () => {
  for (const handle of [
    undefined,
    {},
    Object.freeze(Object.create(null)),
    { candidateCommit: 'a'.repeat(40), readinessPromoting: false, ready: true },
    new Proxy({}, {}),
  ]) {
    for (const action of [
      ownedReferenceFixtureEnvironment,
      observeOwnedReferenceFixture,
      closeOwnedReferenceFixture,
    ])
      await assert.rejects(action(handle), { code: 'HTTP_REFERENCE_FIXTURE_HANDLE' });
    for (const action of [prepareFreshHttpReferenceFixture, observeFreshHttpReferenceFixture])
      await assert.rejects(action(handle), { code: 'HTTP_FRESH_BUILD_INVALID' });
  }
  await assert.rejects(prepareFreshHttpReferenceFixture({}, {}), {
    code: 'HTTP_FRESH_BUILD_INVALID',
  });
});

for (const fault of ['realpath', 'entropy', 'lstat', 'remove']) {
  test(`actual early-root ${fault} refusal retains ownership, reports failure and closes only its own directory`, async (t) => {
    if (
      process.platform !== 'darwin' ||
      process.arch !== 'arm64' ||
      process.versions.node !== '24.20.0'
    ) {
      await assert.rejects(
        createOwnedReferenceFixture({
          candidateCommit: 'a'.repeat(40),
          tree: 'b'.repeat(40),
          nonce: 'a'.repeat(36),
        }),
        { code: 'HTTP_REFERENCE_FIXTURE_HOST' },
      );
      t.diagnostic(
        'Unsupported fixed controller host: HOST refusal only; early-root fault acceptance was not executed.',
      );
      return;
    }
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('./support/http-reference-early-root-child.mjs', import.meta.url)),
        fault,
      ],
      {
        env: {
          PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
          LANG: 'C',
          LC_ALL: 'C',
          TZ: 'UTC',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15_000,
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
    assert.deepEqual(status, { code: 0, signal: null }, stderr);
    const result = JSON.parse(stdout);
    assert.equal(
      result.sourceSha256,
      createHash('sha256')
        .update(
          readFileSync(new URL('../../scripts/lib/http-reference-fixture.mjs', import.meta.url)),
        )
        .digest('hex'),
    );
    assert.equal(result.fault, fault);
    assert.equal(result.triggered, true);
    assert.equal(result.spawnCalls, 0);
    assert.equal(result.portCalls, 0);
    assert.equal(result.inspectorCleanupComplete, true);
    assert.equal(result.builtinRestorationComplete, true);
    assert.equal(result.runtimeCustodyComplete, false);
    assert.equal(result.performanceQualified, false);
    assert.equal(result.readinessPromoting, false);
    t.diagnostic(JSON.stringify(result));
  });
}
