import assert from 'node:assert/strict';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import { once } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import net, * as netNamespace from 'node:net';
import tls from 'node:tls';
import { test } from 'node:test';
import {
  bindOwnedReferenceListener,
  closeOwnedReferenceNetworkScope,
  installOwnedReferenceNetworkScope,
  observeOwnedReferenceNetwork,
} from '../../scripts/lib/http-reference-network.mjs';

// INV-PERF-001: bounded production network-component probes, never app/load or
// native/undici completeness acceptance. Every positive native effect is owned.
const binding = { postgresPort: 1, redisPort: 2 };
const baseline = {
  connect: net.connect,
  listen: net.Server.prototype.listen,
  fetch: globalThis.fetch,
};

function restored() {
  assert.equal(net.connect, baseline.connect);
  assert.equal(net.createConnection, baseline.connect);
  assert.equal(netNamespace.connect, baseline.connect);
  assert.equal(net.Server.prototype.listen, baseline.listen);
  assert.equal(globalThis.fetch, baseline.fetch);
}

test('closed scalar binding and opaque handle admission precede transport effects', () => {
  let calls = 0;
  const accessor = { ...binding };
  Object.defineProperty(accessor, 'postgresPort', {
    enumerable: true,
    get() {
      calls++;
      return 1;
    },
  });
  for (const input of [
    undefined,
    {},
    { ...binding, extra: true },
    { postgresPort: 2, redisPort: 2 },
    { postgresPort: '1', redisPort: 2 },
    accessor,
    new Proxy(binding, {}),
  ])
    assert.throws(
      () => installOwnedReferenceNetworkScope(input),
      /Invalid fixed reference network binding/u,
    );
  assert.equal(calls, 0);
  for (const handle of [{}, Object.freeze(Object.create(null)), new Proxy({}, {})]) {
    assert.throws(() => observeOwnedReferenceNetwork(handle), /Unknown or closed/u);
    assert.throws(() => closeOwnedReferenceNetworkScope(handle), /Unknown or closed/u);
  }
  restored();
});

const refusedEffects = [
  ['DNS name', () => net.connect({ host: 'localhost', port: 1 })],
  ['IPv6', () => net.connect({ host: '::1', port: 1 })],
  ['foreign port', () => net.connect({ host: '127.0.0.1', port: 3 })],
  ['Unix socket', () => net.connect('/tmp/never-open-reference.sock')],
  [
    'custom resolver',
    () =>
      net.connect({
        host: '127.0.0.1',
        port: 1,
        lookup() {
          throw new Error('RESOLVER EXECUTED');
        },
      }),
  ],
  [
    'custom local bind',
    () => net.connect({ host: '127.0.0.1', port: 1, localAddress: '127.0.0.1' }),
  ],
  ['caller normalized-array overload', () => net.connect([{ host: '127.0.0.1', port: 1 }])],
  [
    'Socket receiver identity',
    () => net.Socket.prototype.connect.call({}, { host: '127.0.0.1', port: 1 }),
  ],
  ['listen fixed port', () => net.createServer().listen(1, '127.0.0.1')],
  ['listen wildcard', () => net.createServer().listen(0, '0.0.0.0')],
  [
    'HTTP self target absent',
    () => http.get({ host: '127.0.0.1', port: 1, method: 'GET', path: '/healthz', agent: false }),
  ],
  [
    'HTTP unsupported method',
    () =>
      http.request({ host: '127.0.0.1', port: 1, method: 'POST', path: '/healthz', agent: false }),
  ],
  ['TLS', () => tls.connect({ host: '127.0.0.1', port: 1 })],
  ['HTTPS', () => https.get('https://127.0.0.1/')],
  ['DNS callback', () => dns.lookup('example.invalid', () => {})],
  ['numeric DNS outside listen ticket', () => dns.lookup('127.0.0.1', { all: true }, () => {})],
  ['direct null callback overload', () => net.connect({ host: '127.0.0.1', port: 1 }, null)],
  [
    'direct undefined callback overload',
    () => net.connect({ host: '127.0.0.1', port: 1 }, undefined),
  ],
  [
    'forged normalized marker outside ticket',
    () => {
      const normalized = [{ host: '127.0.0.1', port: 1 }, null];
      normalized[Symbol('normalizedArgs')] = true;
      const socket = new net.Socket();
      try {
        socket.connect(normalized);
      } finally {
        socket.destroy();
      }
    },
  ],
  ['DNS promise', () => dnsPromises.lookup('example.invalid')],
  ['resolver instance', () => new dns.Resolver().resolve4('example.invalid', () => {})],
  ['fetch', () => globalThis.fetch('http://127.0.0.1/')],
];
for (const [name, effect] of refusedEffects) {
  test(`public boundary refuses ${name} before native dispatch and preserves sticky refusal`, () => {
    const handle = installOwnedReferenceNetworkScope(binding);
    let first;
    try {
      assert.throws(effect, (error) => {
        assert.match(error.code, /^HTTP_REFERENCE_NETWORK_/u);
        first = error.code;
        return true;
      });
      assert.throws(() => observeOwnedReferenceNetwork(handle), { code: first });
    } finally {
      assert.throws(() => closeOwnedReferenceNetworkScope(handle), { code: first });
      restored();
    }
    assert.throws(() => observeOwnedReferenceNetwork(handle), /Unknown or closed/u);
  });
}

test('unchanged empty scope is closed and reports unverified transport completeness', () => {
  const handle = installOwnedReferenceNetworkScope(binding);
  try {
    assert.equal(Object.isFrozen(handle), true);
    assert.equal(Object.getPrototypeOf(handle), null);
    assert.throws(() => installOwnedReferenceNetworkScope(binding), /Invalid fixed/u);
    const report = observeOwnedReferenceNetwork(handle);
    assert.equal(report.retainedSocketCount, 0);
    assert.equal(report.effects.length, 0);
    assert.equal(report.actualTransportSourceAdmission, 'PENDING_INDEPENDENT_INSPECTOR');
    assert.equal(report.capturedNativeUndiciTransportCompleteness, 'UNVERIFIED');
    assert.equal(report.runtimeCustodyComplete, false);
    assert.equal(report.performanceQualified, false);
    assert.equal(report.readinessPromoting, false);
    assert.deepEqual(closeOwnedReferenceNetworkScope(handle), {
      closed: true,
      parentCorroborationRequired: true,
      readinessPromoting: false,
    });
  } finally {
    restored();
  }
});

test('builtin descriptor drift refuses and restoration does not erase it', () => {
  const original = Object.getOwnPropertyDescriptor(net, 'connect');
  const handle = installOwnedReferenceNetworkScope(binding);
  const installed = Object.getOwnPropertyDescriptor(net, 'connect');
  Object.defineProperty(net, 'connect', { ...installed, value() {} });
  try {
    assert.throws(() => observeOwnedReferenceNetwork(handle), {
      code: 'HTTP_REFERENCE_NETWORK_DESCRIPTOR_DRIFT',
    });
    Object.defineProperty(net, 'connect', installed);
    assert.throws(() => observeOwnedReferenceNetwork(handle), {
      code: 'HTTP_REFERENCE_NETWORK_DESCRIPTOR_DRIFT',
    });
    assert.throws(() => closeOwnedReferenceNetworkScope(handle), {
      code: 'HTTP_REFERENCE_NETWORK_DESCRIPTOR_DRIFT',
    });
  } finally {
    Object.defineProperty(net, 'connect', original);
    syncBuiltinESMExports();
    restored();
  }
});

async function ownedListener(t) {
  const handle = installOwnedReferenceNetworkScope(binding);
  const server = net.createServer();
  const sockets = [];
  const events = [];
  let scopeClosed = false;
  server.on('connection', (socket) => {
    sockets.push(socket);
    socket.on('close', () => events.push('accepted:close'));
  });
  server.on('close', () => events.push('server:close'));
  try {
    const listening = once(server, 'listening');
    server.listen(0, '127.0.0.1');
    await listening;
    const address = bindOwnedReferenceListener(handle, server);
    assert.equal(address.host, '127.0.0.1');
    assert.equal(address.kind, 'owned-listener');
    assert.equal(address.port, server.address().port);
    t.diagnostic(`Owned listener: ${JSON.stringify(address)}`);
    return {
      handle,
      server,
      sockets,
      events,
      address,
      markScopeClosed() {
        scopeClosed = true;
      },
      async close() {
        const waits = sockets
          .filter((socket) => !socket.closed)
          .map((socket) => once(socket, 'close').catch(() => {}));
        for (const socket of sockets) socket.destroy();
        await Promise.all(waits);
        if (server.listening)
          await new Promise((accept, reject) =>
            server.close((error) => (error ? reject(error) : accept())),
          );
        assert.equal(server.listening, false);
        assert.equal(
          sockets.every((socket) => socket.destroyed && socket.closed),
          true,
        );
        assert.equal(events.includes('server:close'), true);
        if (!scopeClosed) closeOwnedReferenceNetworkScope(handle);
        restored();
        t.diagnostic(
          `Owned cleanup: ${JSON.stringify({ sockets: sockets.length, events, listening: server.listening })}`,
        );
      },
    };
  } catch (error) {
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise((accept) => server.close(accept));
    try {
      closeOwnedReferenceNetworkScope(handle);
    } catch {
      /* Original setup refusal remains decisive. */
    }
    restored();
    throw error;
  }
}

test('real outbound and accepted sockets require actual close before a clean scope close', async (t) => {
  const fixture = await ownedListener(t);
  try {
    const accepted = once(fixture.server, 'connection');
    const socket = net.connect({ host: fixture.address.host, port: fixture.address.port });
    fixture.sockets.push(socket);
    socket.on('close', () => fixture.events.push('client:close'));
    await Promise.all([once(socket, 'connect'), accepted]);
    const before = observeOwnedReferenceNetwork(fixture.handle);
    assert.equal(before.retainedSocketCount, 2);
    assert.equal(before.openSocketCount, 2);
    assert.equal(before.observedClosedSocketCount, 0);
    const closed = fixture.sockets.map((row) => once(row, 'close'));
    for (const row of fixture.sockets) row.destroy();
    await Promise.all(closed);
    await new Promise((accept, reject) =>
      fixture.server.close((error) => (error ? reject(error) : accept())),
    );
    const after = observeOwnedReferenceNetwork(fixture.handle);
    assert.equal(after.retainedSocketCount, 2);
    assert.equal(after.destroyRequestedSocketCount, 2);
    assert.equal(after.observedClosedSocketCount, 2);
    assert.equal(after.openSocketCount, 0);
    assert.equal(after.listenerClosed, true);
    assert.equal(closeOwnedReferenceNetworkScope(fixture.handle).closed, true);
    fixture.markScopeClosed();
  } finally {
    await fixture.close();
  }
});

test('destroy requested without close observed refuses; later cleanup cannot promote that scope', async (t) => {
  const fixture = await ownedListener(t);
  try {
    const accepted = once(fixture.server, 'connection');
    const socket = net.connect(fixture.address.port, fixture.address.host);
    fixture.sockets.push(socket);
    await Promise.all([once(socket, 'connect'), accepted]);
    socket.destroy();
    const report = observeOwnedReferenceNetwork(fixture.handle);
    assert.equal(socket.destroyed, true);
    assert.equal(report.destroyRequestedSocketCount, 1);
    assert.equal(report.observedClosedSocketCount, 0);
    assert.equal(report.openSocketCount, 2);
    assert.throws(() => closeOwnedReferenceNetworkScope(fixture.handle), {
      code: 'HTTP_REFERENCE_NETWORK_RESOURCE_REMAINS',
    });
    fixture.markScopeClosed();
    assert.throws(() => observeOwnedReferenceNetwork(fixture.handle), /Unknown or closed/u);
  } finally {
    await fixture.close();
  }
});

test('connect failure is retained until its actual error and close events', async (t) => {
  const fixture = await ownedListener(t);
  try {
    await new Promise((accept, reject) =>
      fixture.server.close((error) => (error ? reject(error) : accept())),
    );
    const socket = net.connect({ host: fixture.address.host, port: fixture.address.port });
    fixture.sockets.push(socket);
    let error;
    socket.on('error', (value) => {
      error = value;
      fixture.events.push('client:error');
    });
    await new Promise((accept) => socket.once('close', accept));
    fixture.events.push('client:close');
    assert.equal(error?.code, 'ECONNREFUSED');
    const report = observeOwnedReferenceNetwork(fixture.handle);
    assert.equal(report.retainedSocketCount, 1);
    assert.equal(report.observedClosedSocketCount, 1);
    assert.equal(report.openSocketCount, 0);
    assert.equal(report.destroyRequestedSocketCount, 1);
    assert.equal(closeOwnedReferenceNetworkScope(fixture.handle).closed, true);
    fixture.markScopeClosed();
  } finally {
    await fixture.close();
  }
});

test('native object overload preserves its actual callback and closes all owned sockets', async (t) => {
  const fixture = await ownedListener(t);
  try {
    let calls = 0,
      receiver;
    const accepted = once(fixture.server, 'connection');
    const options = Object.freeze({ host: fixture.address.host, port: fixture.address.port });
    const socket = net.createConnection(options, function () {
      calls++;
      receiver = this;
    });
    fixture.sockets.push(socket);
    await Promise.all([once(socket, 'connect'), accepted]);
    assert.equal(calls, 1);
    assert.equal(receiver, socket);
    assert.deepEqual(options, { host: fixture.address.host, port: fixture.address.port });
    assert.equal(observeOwnedReferenceNetwork(fixture.handle).retainedSocketCount, 2);
  } finally {
    await fixture.close();
  }
});

test('destroy-versus-observed-close independently applies to the admitted native object overload', async (t) => {
  const fixture = await ownedListener(t);
  try {
    const accepted = once(fixture.server, 'connection');
    const socket = net.connect({ host: fixture.address.host, port: fixture.address.port });
    fixture.sockets.push(socket);
    await Promise.all([once(socket, 'connect'), accepted]);
    socket.destroy();
    const report = observeOwnedReferenceNetwork(fixture.handle);
    assert.equal(socket.destroyed, true);
    assert.equal(report.destroyRequestedSocketCount, 1);
    assert.equal(report.observedClosedSocketCount, 0);
    assert.equal(report.openSocketCount, 2);
    assert.throws(() => closeOwnedReferenceNetworkScope(fixture.handle), {
      code: 'HTTP_REFERENCE_NETWORK_RESOURCE_REMAINS',
    });
    fixture.markScopeClosed();
    assert.throws(() => observeOwnedReferenceNetwork(fixture.handle), /Unknown or closed/u);
  } finally {
    await fixture.close();
  }
});

for (const [portForm, withCallback] of [
  ['number', true],
  ['string', false],
  ['string', true],
]) {
  test(`actual primitive ${portForm} port with ${withCallback ? 'original callback' : 'no callback'} preserves native identity and closes`, async (t) => {
    const fixture = await ownedListener(t);
    try {
      const rawPort = portForm === 'string' ? String(fixture.address.port) : fixture.address.port;
      const accepted = once(fixture.server, 'connection');
      let calls = 0,
        receiver,
        callbackArguments;
      const callback = function (...args) {
        calls++;
        receiver = this;
        callbackArguments = args;
      };
      const socket = withCallback
        ? net.connect(rawPort, fixture.address.host, callback)
        : net.connect(rawPort, fixture.address.host);
      fixture.sockets.push(socket);
      await Promise.all([once(socket, 'connect'), accepted]);
      assert.equal(socket instanceof net.Socket, true);
      assert.equal(calls, withCallback ? 1 : 0);
      if (withCallback) {
        assert.equal(receiver, socket);
        assert.deepEqual(callbackArguments, []);
      }
      const report = observeOwnedReferenceNetwork(fixture.handle);
      assert.equal(report.retainedSocketCount, 2);
      assert.equal(report.numericListenLowering.callbackCount, 1);
      assert.equal(report.numericListenLowering.callbackOutcome, 'FORWARDED');
      assert.equal(report.numericListenLowering.synchronousAdmissionClosed, true);
      assert.equal(report.runtimeCustodyComplete, false);
    } finally {
      await fixture.close();
    }
  });
}
