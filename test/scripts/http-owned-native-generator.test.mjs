import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { test } from 'node:test';
import {
  createOwnedHttpWorker,
  launchOwnedHttpNativeGenerator,
  observeOwnedHttpWorker,
  reapOwnedHttpWorker,
  sendOwnedHttpWorker,
  snapshotOwnedHttpWorker,
  waitOwnedHttpWorkerClose,
} from '../../scripts/lib/http-owned-worker.mjs';

function request(executable, argv) {
  return {
    executable,
    argv,
    cwd: process.cwd(),
    environment: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, INSPECTOR_ONLY: 'exact' },
  };
}
async function capture(t, launch) {
  const handle = createOwnedHttpWorker();
  t.after(async () => {
    await reapOwnedHttpWorker(handle);
  });
  launchOwnedHttpNativeGenerator(handle, launch);
  const stdout = [],
    stderr = [],
    messages = [];
  observeOwnedHttpWorker(handle, {
    stdout(bytes) {
      stdout.push(bytes);
    },
    stderr(bytes) {
      stderr.push(bytes);
    },
    message(value) {
      messages.push(value);
    },
  });
  await waitOwnedHttpWorkerClose(handle);
  const receipt = await reapOwnedHttpWorker(handle);
  assert.equal(receipt.complete, true);
  assert.equal(receipt.nativeGenerator, true);
  assert.equal(receipt.privateIpc, false);
  assert.equal(receipt.groupOutcome, 'ABSENT');
  assert.equal(receipt.absenceBasis, 'NATIVE_CLOSE_AND_GROUP_ESRCH');
  for (const key of ['runtimeCustodyComplete', 'performanceQualified', 'readinessPromoting'])
    assert.equal(receipt[key], false);
  assert.throws(() => process.kill(-receipt.pid, 0), { code: 'ESRCH' });
  assert.equal(messages.length, 0);
  assert.throws(() => sendOwnedHttpWorker(handle, { action: 'invent IPC' }), {
    code: 'HTTP_OWNED_WORKER_INVALID',
  });
  assert.throws(() => launchOwnedHttpNativeGenerator(handle, launch), {
    code: 'HTTP_OWNED_WORKER_INVALID',
  });
  assert.deepEqual(snapshotOwnedHttpWorker(handle), receipt);
  return { handle, receipt, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
}

// INV-PERF-001: actual native process custody, without application/native-image admission.
test('actual Node child independently witnesses no IPC descriptor/channel environment or ambient environment', async (t) => {
  const code = `const fs=require('node:fs');let fd3;try{fd3=fs.fstatSync(3).isSocket()?'socket':'other'}catch(e){fd3=e.code}process.stdout.write(JSON.stringify({send:typeof process.send,connected:process.connected??null,channel:process.channel??null,channelFd:process.env.NODE_CHANNEL_FD??null,serialization:process.env.NODE_CHANNEL_SERIALIZATION_MODE??null,ambient:process.env.HOME??null,exact:process.env.INSPECTOR_ONLY,fd3}));process.stderr.write('native stderr bytes\\n');`;
  const result = await capture(t, request(process.execPath, ['-e', code]));
  const observed = JSON.parse(result.stdout);
  assert.equal(observed.send, 'undefined');
  assert.equal(observed.connected, null);
  assert.equal(observed.channel, null);
  assert.equal(observed.channelFd, null);
  assert.equal(observed.serialization, null);
  assert.equal(observed.ambient, null);
  assert.equal(observed.exact, 'exact');
  // Node may itself allocate fd3 for internal event machinery. It must not be a Node IPC socket.
  assert.notEqual(observed.fd3, 'socket');
  assert.equal(result.stderr.toString(), 'native stderr bytes\n');
  assert.deepEqual(result.receipt.exit, { code: 0, signal: null });
  assert.equal(result.receipt.disconnectObserved, false);
});

test('actual non-Node executable preserves binary stdout/stderr and nonzero exit without IPC', async (t) => {
  const result = await capture(
    t,
    request('/bin/sh', ['-c', "printf '\\000\\377target'; printf 'refused\\n' >&2; exit 7"]),
  );
  assert.deepEqual(result.stdout, Buffer.from([0, 255, ...Buffer.from('target')]));
  assert.equal(result.stderr.toString(), 'refused\n');
  assert.deepEqual(result.receipt.exit, { code: 7, signal: null });
  assert.equal(result.receipt.errorCount, 0);
});

test('actual native spawn ENOENT remains visible, with close and no process group', async (t) => {
  const handle = createOwnedHttpWorker();
  t.after(async () => {
    await reapOwnedHttpWorker(handle);
  });
  launchOwnedHttpNativeGenerator(handle, request('/inspector-nonexistent-native-generator', []));
  await waitOwnedHttpWorkerClose(handle);
  const row = await reapOwnedHttpWorker(handle);
  assert.equal(row.spawnErrorObserved, true);
  assert.equal(row.spawnObserved, false);
  assert.equal(row.pid, null);
  assert.equal(row.closeObserved, true);
  assert.equal(row.errorCount, 1);
  assert.equal(row.absenceBasis, 'NATIVE_SPAWN_ERROR_AND_CLOSE_NO_GROUP');
  assert.equal(row.nativeGenerator, true);
  assert.equal(row.privateIpc, false);
  assert.equal(row.runtimeCustodyComplete, false);
  assert.ok(row.events.some((event) => event.kind === 'ERROR' && event.code === 'ENOENT'));
});

for (const [label, transform] of [
  ['extra spawn option', (value) => ({ ...value, stdio: ['ipc'] })],
  ['relative executable', (value) => ({ ...value, executable: 'node' })],
  ['relative cwd', (value) => ({ ...value, cwd: '.' })],
  ['sparse argv', (value) => ({ ...value, argv: new Array(1) })],
  [
    'environment accessor',
    (value) => ({
      ...value,
      environment: {
        get NODE_CHANNEL_FD() {
          throw new Error('must not run');
        },
      },
    }),
  ],
  [
    'environment proxy',
    (value) => ({
      ...value,
      environment: new Proxy(
        {},
        {
          ownKeys() {
            throw new Error('must not run');
          },
        },
      ),
    }),
  ],
]) {
  test(`native launch refuses ${label} before native effects`, async () => {
    const handle = createOwnedHttpWorker();
    assert.throws(
      () => launchOwnedHttpNativeGenerator(handle, transform(request('/bin/sh', ['-c', 'exit 0']))),
      { code: 'HTTP_OWNED_WORKER_INVALID' },
    );
    assert.equal(snapshotOwnedHttpWorker(handle).launchAttempted, false);
    const row = await reapOwnedHttpWorker(handle);
    assert.equal(row.absenceBasis, 'NO_LAUNCH_ATTEMPT');
    assert.equal(row.pid, null);
  });
}
test('native launch refuses forged handles and arity without adopting caller processes', () => {
  const launch = request('/bin/sh', ['-c', 'exit 0']);
  assert.throws(() => launchOwnedHttpNativeGenerator({}, launch), {
    code: 'HTTP_OWNED_WORKER_INVALID',
  });
  const handle = createOwnedHttpWorker();
  assert.throws(() => launchOwnedHttpNativeGenerator(handle, launch, false), {
    code: 'HTTP_OWNED_WORKER_INVALID',
  });
  assert.equal(snapshotOwnedHttpWorker(handle).launchAttempted, false);
});

for (const [key, value] of [
  ['NODE_CHANNEL_FD', '3'],
  ['NODE_CHANNEL_FD', ''],
  ['NODE_CHANNEL_SERIALIZATION_MODE', 'json'],
  ['NODE_CHANNEL_SERIALIZATION_MODE', ''],
]) {
  test(`native launch rejects reserved own environment ${key}=${JSON.stringify(value)} before any launch attempt`, async (t) => {
    const handle = createOwnedHttpWorker();
    t.after(async () => {
      await reapOwnedHttpWorker(handle);
    });
    const launch = request('/bin/sh', ['-c', 'printf reserved-environment-must-not-launch']);
    launch.environment[key] = value;
    assert.throws(() => launchOwnedHttpNativeGenerator(handle, launch), {
      code: 'HTTP_OWNED_WORKER_INVALID',
    });
    const before = snapshotOwnedHttpWorker(handle);
    assert.equal(before.launchAttempted, false);
    assert.equal(before.pid, null);
    assert.equal(before.spawnObserved, false);
    assert.equal(
      before.events.some((event) => event.kind === 'SPAWN'),
      false,
    );
    const reaped = await reapOwnedHttpWorker(handle);
    assert.equal(reaped.absenceBasis, 'NO_LAUNCH_ATTEMPT');
    // Refusal precedes selection of either native or IPC launch mode.
    assert.equal(Object.hasOwn(reaped, 'privateIpc'), false);
    assert.equal(Object.hasOwn(reaped, 'nativeGenerator'), false);
    assert.equal(reaped.runtimeCustodyComplete, false);
    assert.equal(reaped.performanceQualified, false);
  });
}
