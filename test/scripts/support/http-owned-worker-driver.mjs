import assert from 'node:assert/strict';
import { ChildProcess, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Native boundaries are patched only inside this owned test process and BEFORE
// importing the exact production component. Native spawn/events are untouched.
const kind = process.argv[2];
const originalKill = ChildProcess.prototype.kill;
const originalProbe = process.kill;
let killFault = ['kill-false', 'kill-throw'].includes(kind);
let probeFault = ['probe-eperm', 'probe-unknown'].includes(kind);
const directCalls = [],
  probes = [];
ChildProcess.prototype.kill = function (signal) {
  directCalls.push({ pid: this.pid, signal, injected: killFault });
  if (killFault) {
    if (kind === 'kill-throw') throw new Error('Explicit owned direct native kill fault');
    return false;
  }
  return Reflect.apply(originalKill, this, [signal]);
};
process.kill = function (pid, signal) {
  probes.push({ pid, signal, injected: probeFault });
  assert(pid < 0);
  assert.equal(signal, 0);
  if (probeFault) {
    const error = new Error('Explicit read-only group probe fault');
    error.code = kind === 'probe-eperm' ? 'EPERM' : 'INSPECTOR_UNKNOWN';
    throw error;
  }
  return Reflect.apply(originalProbe, this, [pid, signal]);
};
const component = await import('../../../scripts/lib/http-owned-worker.mjs');
const {
  createOwnedHttpWorker,
  launchOwnedHttpWorker,
  observeOwnedHttpWorker,
  sendOwnedHttpWorker,
  snapshotOwnedHttpWorker,
  waitOwnedHttpWorkerClose,
  terminateOwnedHttpWorker,
  reapOwnedHttpWorker,
} = component;
const evidence = mkdtempSync(join(tmpdir(), 'stynx owned worker evidence espaço 日本語 '));
const sentinel = join(evidence, 'retained.json');
writeFileSync(sentinel, JSON.stringify({ evidenceMustSurviveIncomplete: true }));
const naturalExit = join(evidence, 'descendant-natural-exit.json');
const handle = createOwnedHttpWorker();
const request = {
  executable: process.execPath,
  argv: [
    fileURLToPath(new URL('./http-owned-worker-child.mjs', import.meta.url)),
    kind === 'descendant' ? 'with-descendant' : 'hold',
    naturalExit,
  ],
  cwd: evidence,
  environment: {
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    NODE_DISABLE_COMPILE_CACHE: '1',
  },
};
const incomplete = { code: 'HTTP_REFERENCE_CHILD_CLEANUP_INCOMPLETE' };
const invalid = { code: 'HTTP_OWNED_WORKER_INVALID' };
const tick = () => new Promise((accept) => setTimeout(accept, 20));
const bounded = async (action, limit = 3000) => {
  const until = Date.now() + limit;
  while (!action()) {
    if (Date.now() >= until) throw new Error('Owned native observation deadline exceeded');
    await tick();
  }
};
const messages = [];
let receipt,
  before,
  complete = false,
  preserveEvidence = false,
  testPassed = false,
  elapsed = null;
try {
  assert(Object.isFrozen(handle));
  assert.equal(Reflect.ownKeys(handle).length, 0);
  if (kind === 'forged') {
    for (const foreign of [
      undefined,
      {},
      Object.freeze({}),
      { pid: process.pid, complete: true },
      new Proxy(handle, {}),
    ]) {
      for (const action of [
        snapshotOwnedHttpWorker,
        waitOwnedHttpWorkerClose,
        terminateOwnedHttpWorker,
        reapOwnedHttpWorker,
      ])
        assert.throws(() => action(foreign), invalid);
      assert.throws(() => launchOwnedHttpWorker(foreign, request), invalid);
    }
    assert.throws(() => createOwnedHttpWorker({ pid: process.pid }), invalid);
    assert.throws(() => launchOwnedHttpWorker(handle, request, {}), invalid);
    let reads = 0;
    const accessor = { ...request };
    Object.defineProperty(accessor, 'executable', {
      enumerable: true,
      get() {
        reads++;
        return process.execPath;
      },
    });
    const argvAccessor = [request.argv[0]];
    Object.defineProperty(argvAccessor, '0', {
      enumerable: true,
      configurable: true,
      get() {
        reads++;
        return request.argv[0];
      },
    });
    for (const malformed of [
      accessor,
      new Proxy(request, {}),
      { ...request, pid: process.pid },
      { ...request, spawn() {} },
      { ...request, options: { shell: true } },
      { ...request, argv: argvAccessor },
      { ...request, argv: ['safe', () => {}] },
      { ...request, environment: { BAD: () => {} } },
    ])
      assert.throws(() => launchOwnedHttpWorker(handle, malformed), invalid);
    assert.equal(reads, 0);
    assert.equal(snapshotOwnedHttpWorker(handle).launchAttempted, false);
    receipt = await reapOwnedHttpWorker(handle);
    assert.equal(receipt.absenceBasis, 'NO_LAUNCH_ATTEMPT');
    assert.equal(receipt.closeObserved, false);
    assert.equal(receipt.pid, null);
  } else if (kind === 'external-adoption') {
    const external = spawn(request.executable, request.argv, {
      cwd: evidence,
      env: request.environment,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const closed = new Promise((accept, reject) => {
      external.once('error', reject);
      external.once('close', (code, signal) => accept({ code, signal }));
    });
    try {
      assert(Number.isSafeInteger(external.pid));
      for (const action of [
        snapshotOwnedHttpWorker,
        waitOwnedHttpWorkerClose,
        terminateOwnedHttpWorker,
        reapOwnedHttpWorker,
      ])
        assert.throws(() => action(external), invalid);
      assert.throws(() => launchOwnedHttpWorker(handle, { ...request, child: external }), invalid);
      assert.equal(snapshotOwnedHttpWorker(handle).launchAttempted, false);
    } finally {
      Reflect.apply(originalKill, external, ['SIGKILL']);
      await closed;
      assert.throws(() => Reflect.apply(originalProbe, process, [external.pid, 0]), {
        code: 'ESRCH',
      });
    }
    receipt = await reapOwnedHttpWorker(handle);
    assert.equal(receipt.absenceBasis, 'NO_LAUNCH_ATTEMPT');
    assert.equal(receipt.nativeChildAcquired, false);
  } else if (kind === 'never-launched') {
    assert.equal(terminateOwnedHttpWorker(handle).attempted, false);
    receipt = await reapOwnedHttpWorker(handle);
    assert.equal(receipt.absenceBasis, 'NO_LAUNCH_ATTEMPT');
    assert.equal(receipt.launchAttempted, false);
    assert.equal(receipt.closeObserved, false);
    assert.equal(probes.length, 0);
  } else if (kind === 'synchronous-spawn') {
    const huge = { ...request, argv: [request.argv[0], 'x'.repeat(4 * 1024 * 1024)] };
    assert.throws(() => launchOwnedHttpWorker(handle, huge), {
      code: 'HTTP_OWNED_WORKER_LAUNCH_FAILED',
    });
    before = snapshotOwnedHttpWorker(handle);
    assert.equal(before.status, 'UNKNOWN');
    assert.equal(before.launchAttempted, true);
    assert.equal(before.nativeChildAcquired, false);
    assert.equal(before.closeObserved, false);
    assert.equal(before.spawnErrorObserved, false);
    await assert.rejects(reapOwnedHttpWorker(handle), incomplete);
    assert.equal(snapshotOwnedHttpWorker(handle).complete, false);
    assert.equal(existsSync(sentinel), true);
    preserveEvidence = true;
  } else {
    if (kind === 'failed-spawn') request.executable = join(evidence, 'deliberately-missing-node');
    const launchIdentity = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    launchOwnedHttpWorker(handle, request);
    assert.equal(snapshotOwnedHttpWorker(handle).launchIdentitySha256, launchIdentity);
    const callbacks =
      kind === 'subscriber-throw'
        ? {
            stdout() {
              throw new Error('Explicit parser throw');
            },
            message() {
              throw new Error('Explicit subscriber throw');
            },
            close() {
              throw new Error('Explicit close subscriber throw');
            },
          }
        : {
            message(value) {
              assert(Object.isFrozen(value));
              messages.push(value);
            },
          };
    if (kind !== 'buffered-observer') observeOwnedHttpWorker(handle, callbacks);
    if (kind === 'failed-spawn') {
      await waitOwnedHttpWorkerClose(handle);
      receipt = await reapOwnedHttpWorker(handle);
      assert.equal(receipt.pid, null);
      assert.equal(receipt.spawnErrorObserved, true);
      assert.equal(receipt.spawnObserved, false);
      assert.equal(receipt.closeObserved, true);
      assert.equal(receipt.absenceBasis, 'NATIVE_SPAWN_ERROR_AND_CLOSE_NO_GROUP');
      assert.equal(receipt.groupOutcome, 'UNOBSERVED');
      assert.equal(probes.length, 0);
    } else {
      await bounded(() => snapshotOwnedHttpWorker(handle).spawnObserved);
      if (kind === 'buffered-observer') {
        await new Promise((accept) => setTimeout(accept, 120));
        observeOwnedHttpWorker(handle, callbacks);
      }
      if (kind !== 'subscriber-throw') await bounded(() => messages.some((row) => row.ready));
      if (kind === 'request-mutation') {
        request.argv[0] = '/invented/after-launch';
        request.environment.PATH = 'tampered';
        request.executable = '/invented/node';
        assert.equal(snapshotOwnedHttpWorker(handle).launchIdentitySha256, launchIdentity);
        assert.equal(messages[0].pid, snapshotOwnedHttpWorker(handle).pid);
        let reads = 0;
        const accessor = {};
        Object.defineProperty(accessor, 'action', {
          enumerable: true,
          get() {
            reads++;
            return 'exit';
          },
        });
        for (const frame of [
          accessor,
          { action() {} },
          new Proxy({ action: 'exit' }, {}),
          { action: undefined },
        ])
          assert.throws(() => sendOwnedHttpWorker(handle, frame), invalid);
        assert.equal(reads, 0);
        sendOwnedHttpWorker(handle, {
          closeObserved: true,
          exitObserved: true,
          pid: null,
          complete: true,
        });
        await tick();
        assert.equal(snapshotOwnedHttpWorker(handle).closeObserved, false);
        assert.equal(snapshotOwnedHttpWorker(handle).complete, false);
        assert(Number.isSafeInteger(snapshotOwnedHttpWorker(handle).pid));
        assert.throws(() => sendOwnedHttpWorker(handle, { action: 'exit' }, {}), invalid);
      }
      if (killFault) {
        const started = Date.now();
        const first = reapOwnedHttpWorker(handle),
          second = reapOwnedHttpWorker(handle);
        assert.equal(first, second);
        await assert.rejects(first, incomplete);
        await assert.rejects(second, incomplete);
        elapsed = Date.now() - started;
        assert(elapsed >= 5000, `Real cleanup bound shortened: ${elapsed}`);
        assert(elapsed < 7000);
        before = snapshotOwnedHttpWorker(handle);
        assert.equal(before.complete, false);
        assert.equal(before.status, 'INCOMPLETE');
        assert.equal(before.closeObserved, false);
        assert.equal(directCalls.length, 1);
        assert.equal(probes.length, 0);
        assert.equal(existsSync(sentinel), true);
        assert(Object.isFrozen(before.events));
        assert.throws(() => before.events.push({ kind: 'CLOSE' }), TypeError);
        killFault = false;
        sendOwnedHttpWorker(handle, { action: 'exit' });
        await waitOwnedHttpWorkerClose(handle);
        const retry = reapOwnedHttpWorker(handle),
          duplicate = reapOwnedHttpWorker(handle);
        assert.equal(retry, duplicate);
        receipt = await retry;
        assert.equal(directCalls.length, 1);
        assert.equal(
          receipt.events.some(
            (event) => event.kind === (kind === 'kill-throw' ? 'DIRECT_KILL_THROW' : 'DIRECT_KILL'),
          ),
          true,
        );
      } else if (kind === 'concurrent-reap') {
        const first = reapOwnedHttpWorker(handle),
          second = reapOwnedHttpWorker(handle),
          third = reapOwnedHttpWorker(handle);
        assert.equal(first, second);
        assert.equal(second, third);
        receipt = await first;
        assert.equal(directCalls.length, 1);
        assert.equal(directCalls[0].signal, 'SIGKILL');
      } else {
        sendOwnedHttpWorker(handle, { action: 'exit' });
        await waitOwnedHttpWorkerClose(handle);
        assert.equal(snapshotOwnedHttpWorker(handle).closeObserved, true);
        if (probeFault || kind === 'descendant') {
          await assert.rejects(reapOwnedHttpWorker(handle), incomplete);
          before = snapshotOwnedHttpWorker(handle);
          assert.equal(before.complete, false);
          assert.equal(existsSync(sentinel), true);
          assert.equal(directCalls.length, 0);
          assert.equal(before.groupOutcome, kind === 'descendant' ? 'PRESENT' : 'UNKNOWN');
          if (probeFault) {
            assert.equal(before.groupNativeCode, kind === 'probe-eperm' ? 'EPERM' : 'OTHER');
            probeFault = false;
          } else {
            assert(Number.isSafeInteger(messages[0].descendantPid));
            await bounded(() => existsSync(naturalExit), 6000);
            assert.equal(JSON.parse(readFileSync(naturalExit)).naturalExit, true);
            await bounded(() => {
              try {
                Reflect.apply(originalProbe, process, [-before.pid, 0]);
                return false;
              } catch (error) {
                assert.equal(error.code, 'ESRCH');
                return true;
              }
            }, 6000);
          }
        }
        receipt = await reapOwnedHttpWorker(handle);
        assert.equal(directCalls.length, 0);
      }
      assert.equal(receipt.closeObserved, true);
      assert.equal(receipt.groupOutcome, 'ABSENT');
      assert.equal(receipt.groupNativeCode, 'ESRCH');
      assert.equal(receipt.absenceBasis, 'NATIVE_CLOSE_AND_GROUP_ESRCH');
      assert.throws(() => Reflect.apply(originalProbe, process, [receipt.pid, 0]), {
        code: 'ESRCH',
      });
      if (kind === 'subscriber-throw') assert(receipt.subscriberFailureCount >= 1);
    }
  }
  if (receipt) {
    assert.equal(receipt.complete, true);
    complete = true;
    for (const forbidden of ['child', 'kill', 'send', 'emit', 'closePromise', 'resolveClose'])
      assert.equal(Object.hasOwn(receipt, forbidden), false);
    assert.notEqual(snapshotOwnedHttpWorker(handle), receipt);
    assert(Object.isFrozen(receipt));
    assert(Object.isFrozen(receipt.events));
    assert.throws(() => {
      receipt.complete = false;
    }, TypeError);
    if (receipt.events.length) {
      assert(Object.isFrozen(receipt.events[0]));
      assert.throws(() => {
        receipt.events[0].kind = 'FORGED';
      }, TypeError);
    }
    assert.deepEqual(
      receipt.events.map((row) => row.sequence),
      receipt.events.map((_, index) => index + 1),
    );
    const effects = { kills: directCalls.length, probes: probes.length };
    assert.deepEqual(await reapOwnedHttpWorker(handle), receipt);
    assert.deepEqual(snapshotOwnedHttpWorker(handle), receipt);
    assert.equal(terminateOwnedHttpWorker(handle).reason, 'COMPLETE');
    assert.throws(() => launchOwnedHttpWorker(handle, request), invalid);
    assert.throws(() => sendOwnedHttpWorker(handle, { action: 'exit' }), invalid);
    assert.deepEqual({ kills: directCalls.length, probes: probes.length }, effects);
    assert.equal(receipt.runtimeCustodyComplete, false);
    assert.equal(receipt.readinessPromoting, false);
    rmSync(evidence, { recursive: true });
    assert.equal(existsSync(evidence), false);
  }
  assert(probes.every((row) => row.pid < 0 && row.signal === 0));
  testPassed = true;
} catch (error) {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
} finally {
  killFault = false;
  probeFault = false;
  if (!complete && !preserveEvidence) {
    try {
      receipt = await reapOwnedHttpWorker(handle);
      complete = receipt.complete;
    } catch {
      /* Real obligation/evidence retained. */
    }
    if (complete) rmSync(evidence, { recursive: true });
  }
  ChildProcess.prototype.kill = originalKill;
  process.kill = originalProbe;
}
if (testPassed)
  process.stdout.write(
    `${JSON.stringify({ kind, status: 'PASS', complete, preserveEvidence, evidence: preserveEvidence ? evidence : null, elapsed, before, receipt, directCalls, probes, nativeSpawnSubstituted: false, actualFactoryInvoked: false, runtimeCustodyComplete: false, readinessPromoting: false })}\n`,
  );
