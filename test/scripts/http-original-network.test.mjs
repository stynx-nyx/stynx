import assert from 'node:assert/strict';
import { once } from 'node:events';
import net from 'node:net';
import test from 'node:test';
import {
  bindOwnedReferenceListener,
  closeOwnedReferenceNetworkScope,
  installOwnedOriginalReferenceNetworkScope,
  installOwnedReferenceNetworkScope,
  observeOwnedReferenceNetwork,
  snapshotOwnedOriginalReferenceNetworkFailure,
} from '../../scripts/lib/http-reference-network.mjs';

// INV-PERF-001: actual bounded loopback transport-component observations, never
// a nominal workload, application sample, history sample or capacity-adequacy proof.
const binding = { postgresPort: 1, redisPort: 2 };
const baseline = { connect: net.connect, listen: net.Server.prototype.listen };
function restored() {
  assert.equal(net.connect, baseline.connect);
  assert.equal(net.Server.prototype.listen, baseline.listen);
}
for (const scenarioId of ['auth', 'crud', 'upload', 'cascade-delete'])
  for (const profileId of ['local', 'hardening'])
    test(`original network ${scenarioId}/${profileId} has fixed100k storage without granting admission`, () => {
      const selector = { scenarioId, profileId };
      const handle = installOwnedOriginalReferenceNetworkScope(binding, selector);
      try {
        selector.scenarioId = 'changed';
        const result = observeOwnedReferenceNetwork(handle);
        assert.deepEqual(result.originalScenarioCapacity, {
          scenarioId,
          profileId,
          maximumRetainedEffects: 100000,
        });
        assert.deepEqual(result.effects, []);
        for (const key of ['runtimeCustodyComplete', 'performanceQualified', 'readinessPromoting'])
          assert.equal(result[key], false);
        result.originalScenarioCapacity.maximumRetainedEffects = 1;
        assert.equal(
          observeOwnedReferenceNetwork(handle).originalScenarioCapacity.maximumRetainedEffects,
          100000,
        );
        assert.throws(
          () => snapshotOwnedOriginalReferenceNetworkFailure(handle),
          /No actual original/u,
        );
      } finally {
        closeOwnedReferenceNetworkScope(handle);
        restored();
      }
    });
test('legacy observer stays disjoint and cannot request an original failure archive', () => {
  const handle = installOwnedReferenceNetworkScope(binding);
  try {
    assert.equal(
      Object.hasOwn(observeOwnedReferenceNetwork(handle), 'originalScenarioCapacity'),
      false,
    );
    assert.throws(
      () => snapshotOwnedOriginalReferenceNetworkFailure(handle),
      /No actual original/u,
    );
    assert.throws(
      () => installOwnedReferenceNetworkScope(binding, { maximumRetainedEffects: 100000 }),
      /Invalid fixed/u,
    );
  } finally {
    closeOwnedReferenceNetworkScope(handle);
    restored();
  }
});
test('closed original selectors and snapshots cannot supply a capacity, callback or fake state', () => {
  let reads = 0;
  const selector = { scenarioId: 'auth', profileId: 'local' };
  const accessor = {
    scenarioId: 'auth',
    get profileId() {
      reads++;
      throw new Error('not evidence');
    },
  };
  for (const value of [
    undefined,
    {},
    new Proxy(selector, {}),
    accessor,
    { ...selector, maximumRetainedEffects: 1 },
    { ...selector, capacity: 100000 },
    { ...selector, profileId: 'LOCAL' },
  ])
    assert.throws(
      () => installOwnedOriginalReferenceNetworkScope(binding, value),
      /Invalid fixed original/u,
    );
  assert.throws(
    () => installOwnedOriginalReferenceNetworkScope(binding, selector, {}),
    /Invalid fixed original/u,
  );
  for (const handle of [{}, new Proxy({}, {}), { failure: 'EFFECT_BOUND', effects: [] }])
    assert.throws(
      () => snapshotOwnedOriginalReferenceNetworkFailure(handle),
      /No actual original/u,
    );
  assert.throws(() => snapshotOwnedOriginalReferenceNetworkFailure({}, {}), /Invalid original/u);
  assert.equal(reads, 0);
  restored();
});
test('actual listener and refused transport rows remain ordered and retained through sticky close failure', async () => {
  const handle = installOwnedOriginalReferenceNetworkScope(binding, {
    scenarioId: 'auth',
    profileId: 'local',
  });
  const server = net.createServer();
  let closed = false;
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    bindOwnedReferenceListener(handle, server);
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    assert.throws(() => net.connect({ host: '127.0.0.1', port: 3 }), {
      code: 'HTTP_REFERENCE_NETWORK_DESTINATION',
    });
    const first = snapshotOwnedOriginalReferenceNetworkFailure(handle);
    assert.equal(
      first.effects.some((row) => row.decision === 'FORWARDED'),
      true,
    );
    assert.equal(first.effects.at(-1).decision, 'REFUSED');
    assert.equal(first.scopeClosed, false);
    assert.equal(first.cleanupComplete, false);
    const count = first.capturedEffects;
    assert.throws(() => observeOwnedReferenceNetwork(handle));
    const second = snapshotOwnedOriginalReferenceNetworkFailure(handle);
    assert.equal(second.capturedEffects, count + 1);
    assert.deepEqual(second.effects.slice(0, count), first.effects);
    first.effects.length = 0;
    assert.equal(snapshotOwnedOriginalReferenceNetworkFailure(handle).capturedEffects, count + 1);
    assert.throws(() => closeOwnedReferenceNetworkScope(handle));
    closed = true;
    const final = snapshotOwnedOriginalReferenceNetworkFailure(handle);
    assert.equal(final.scopeClosed, true);
    assert.deepEqual(final.effects, second.effects);
    for (const key of [
      'cleanupComplete',
      'runtimeCustodyComplete',
      'performanceQualified',
      'readinessPromoting',
    ])
      assert.equal(final[key], false);
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    if (!closed)
      try {
        closeOwnedReferenceNetworkScope(handle);
      } catch (error) {
        void error;
      }
    restored();
  }
});
test('actual sticky-refusal storage retains exactly100k rows without truncation, replacement or admission', () => {
  const handle = installOwnedOriginalReferenceNetworkScope(binding, {
    scenarioId: 'upload',
    profileId: 'hardening',
  });
  let closed = false;
  try {
    assert.throws(() => net.connect({ host: '127.0.0.1', port: 3 }));
    for (let i = 1; i < 100002; i++) assert.throws(() => observeOwnedReferenceNetwork(handle));
    const result = snapshotOwnedOriginalReferenceNetworkFailure(handle);
    assert.equal(result.capturedEffects, 100000);
    assert.equal(result.effects.length, 100000);
    assert.equal(result.failure, 'DESTINATION');
    assert.deepEqual(
      result.effects.map((row) => row.sequence),
      Array.from({ length: 100000 }, (_, i) => i + 1),
    );
    assert.equal(
      result.effects.every((row) => row.decision === 'REFUSED' && row.reason === result.failure),
      true,
    );
    assert.throws(() => closeOwnedReferenceNetworkScope(handle));
    closed = true;
    const final = snapshotOwnedOriginalReferenceNetworkFailure(handle);
    assert.deepEqual(final.effects, result.effects);
    assert.equal(final.scopeClosed, true);
    assert.equal(final.cleanupComplete, false);
    assert.ok(Buffer.byteLength(JSON.stringify(final)) < 64 * 1024 * 1024);
  } finally {
    if (!closed)
      try {
        closeOwnedReferenceNetworkScope(handle);
      } catch (error) {
        void error;
      }
    restored();
  }
});
