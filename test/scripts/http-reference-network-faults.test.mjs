import assert from 'node:assert/strict';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import { test } from 'node:test';
import {
  closeOwnedReferenceNetworkScope,
  installOwnedReferenceNetworkScope,
  observeOwnedReferenceNetwork,
} from '../../scripts/lib/http-reference-network.mjs';

// INV-PERF-001. These are faults at the real component's captured builtin seams,
// not replacement acceptance producers. Native positivity is measured separately
// with untouched Node originals; fault probes confer no native/source admission.
const binding = { postgresPort: 1, redisPort: 2 };
const tick = () => new Promise((accept) => setImmediate(accept));
const numeric = () => [null, [{ address: '127.0.0.1', family: 4 }]];

for (const kind of [
  'error',
  'wrong-address',
  'wrong-family',
  'extra-entry',
  'entry-accessor',
  'array-accessor',
  'extra-result',
  'duplicate',
  'synchronous',
]) {
  test(`actual continuation guard safely refuses ${kind} builtin-result fault and retains cleanup failure`, async (t) => {
    const original = dns.lookup;
    const events = [];
    let calls = 0,
      getterReads = 0,
      handle,
      scopeClosed = false;
    dns.lookup = function (...args) {
      calls++;
      const callback = args[2];
      const emit = () => {
        const values = numeric();
        if (kind === 'error') values[0] = new Error('Injected native failure');
        if (kind === 'wrong-address') values[1][0].address = '127.0.0.2';
        if (kind === 'wrong-family') values[1][0].family = 6;
        if (kind === 'extra-entry') values[1].push({ address: '127.0.0.1', family: 4 });
        if (kind === 'entry-accessor')
          Object.defineProperty(values[1][0], 'address', {
            enumerable: true,
            get() {
              getterReads++;
              return '127.0.0.1';
            },
          });
        if (kind === 'array-accessor')
          Object.defineProperty(values[1], '0', {
            enumerable: true,
            get() {
              getterReads++;
              return { address: '127.0.0.1', family: 4 };
            },
          });
        if (kind === 'extra-result') values.push('unadmitted');
        assert.doesNotThrow(() => Reflect.apply(callback, this, values));
        if (kind === 'duplicate') assert.doesNotThrow(() => Reflect.apply(callback, this, values));
      };
      if (kind === 'synchronous') emit();
      else process.nextTick(emit);
      return { diagnosticBuiltinReturnOnly: true };
    };
    syncBuiltinESMExports();
    const server = net.createServer();
    server.on('error', (error) => events.push({ kind: 'error', code: error.code }));
    server.on('listening', () => events.push({ kind: 'listening' }));
    server.on('close', () => events.push({ kind: 'close' }));
    try {
      handle = installOwnedReferenceNetworkScope(binding);
      assert.equal(server.listen(0, '127.0.0.1'), server);
      await tick();
      await tick();
      assert.equal(calls, 1);
      assert.equal(getterReads, 0);
      assert.equal(
        events.some(
          (row) =>
            row.kind === 'error' &&
            row.code === 'HTTP_REFERENCE_NETWORK_NUMERIC_LISTEN_CONTINUATION',
        ),
        true,
      );
      assert.throws(() => observeOwnedReferenceNetwork(handle), {
        code: 'HTTP_REFERENCE_NETWORK_NUMERIC_LISTEN_CONTINUATION',
      });
      assert.throws(() => closeOwnedReferenceNetworkScope(handle), {
        code: 'HTTP_REFERENCE_NETWORK_NUMERIC_LISTEN_CONTINUATION',
      });
      scopeClosed = true;
      assert.equal(server.listening, false);
      assert.equal(server.address(), null);
      t.diagnostic(
        JSON.stringify({
          kind,
          calls,
          getterReads,
          events,
          listening: server.listening,
          nativeAcceptance: false,
          readinessPromoting: false,
        }),
      );
    } finally {
      if (server.listening) await new Promise((accept) => server.close(accept));
      if (handle && !scopeClosed) {
        try {
          closeOwnedReferenceNetworkScope(handle);
        } catch {
          /* The explicit fault remains decisive. */
        }
      }
      dns.lookup = original;
      syncBuiltinESMExports();
      assert.equal(server.listening, false);
      assert.equal(dns.lookup, original);
    }
  });
}

test('pending continuation cannot bind after irreversible scope cleanup or be replayed', async (t) => {
  const original = dns.lookup;
  let pending,
    handle,
    scopeClosed = false;
  const server = net.createServer();
  const events = [];
  server.on('listening', () => events.push('listening'));
  server.on('error', () => events.push('error'));
  server.on('close', () => events.push('close'));
  dns.lookup = function (...args) {
    pending = args[2];
  };
  syncBuiltinESMExports();
  try {
    handle = installOwnedReferenceNetworkScope(binding);
    server.listen(0, '127.0.0.1');
    assert.equal(typeof pending, 'function');
    const report = observeOwnedReferenceNetwork(handle);
    assert.equal(report.numericListenLowering.lookupStarted, true);
    assert.equal(report.numericListenLowering.callbackCount, 0);
    assert.equal(report.numericListenLowering.callbackOutcome, 'PENDING');
    assert.equal(report.numericListenLowering.synchronousAdmissionClosed, true);
    assert.throws(() => dns.lookup('127.0.0.1', { all: true }, () => {}), {
      code: 'HTTP_REFERENCE_NETWORK_UNOWNED_TRANSPORT',
    });
    assert.throws(() => closeOwnedReferenceNetworkScope(handle), {
      code: 'HTTP_REFERENCE_NETWORK_UNOWNED_TRANSPORT',
    });
    scopeClosed = true;
    assert.doesNotThrow(() => Reflect.apply(pending, undefined, numeric()));
    assert.doesNotThrow(() => Reflect.apply(pending, undefined, numeric()));
    await tick();
    assert.equal(server.listening, false);
    assert.equal(server.address(), null);
    assert.equal(events.includes('listening'), false);
    assert.throws(() => observeOwnedReferenceNetwork(handle), /Unknown or closed/u);
    t.diagnostic(
      JSON.stringify({
        events,
        lateCallbackCalls: 2,
        actualNativeBinding: false,
        readinessPromoting: false,
      }),
    );
  } finally {
    if (server.listening) await new Promise((accept) => server.close(accept));
    if (handle && !scopeClosed) {
      try {
        closeOwnedReferenceNetworkScope(handle);
      } catch {
        /* explicit pending refusal */
      }
    }
    dns.lookup = original;
    syncBuiltinESMExports();
  }
});

test('pending numeric lookup alone prevents a clean close and suppresses later binding', async () => {
  const original = dns.lookup;
  let pending,
    handle,
    scopeClosed = false;
  const server = net.createServer();
  let listeningEvents = 0;
  server.on('listening', () => listeningEvents++);
  dns.lookup = function (...args) {
    pending = args[2];
  };
  syncBuiltinESMExports();
  try {
    handle = installOwnedReferenceNetworkScope(binding);
    server.listen(0, '127.0.0.1');
    assert.equal(
      observeOwnedReferenceNetwork(handle).numericListenLowering.callbackOutcome,
      'PENDING',
    );
    assert.throws(() => closeOwnedReferenceNetworkScope(handle), {
      code: 'HTTP_REFERENCE_NETWORK_RESOURCE_REMAINS',
    });
    scopeClosed = true;
    assert.doesNotThrow(() => Reflect.apply(pending, undefined, numeric()));
    await tick();
    assert.equal(server.listening, false);
    assert.equal(server.address(), null);
    assert.equal(listeningEvents, 0);
  } finally {
    if (server.listening) await new Promise((accept) => server.close(accept));
    if (handle && !scopeClosed) {
      try {
        closeOwnedReferenceNetworkScope(handle);
      } catch {
        /* explicit pending refusal */
      }
    }
    dns.lookup = original;
    syncBuiltinESMExports();
  }
});

for (const kind of ['host', 'options', 'accessor', 'nested', 'throw']) {
  test(`private numeric listen ticket refuses ${kind} captured-builtin fault without granting general DNS`, () => {
    const originalListen = net.Server.prototype.listen;
    let getterReads = 0,
      handle,
      scopeClosed = false;
    const marker = new Error('Injected original listen throw');
    net.Server.prototype.listen = function () {
      if (kind === 'throw') throw marker;
      const options = { all: kind !== 'options' };
      if (kind === 'accessor')
        Object.defineProperty(options, 'all', {
          enumerable: true,
          get() {
            getterReads++;
            return true;
          },
        });
      dns.lookup(kind === 'host' ? 'localhost' : '127.0.0.1', options, () => {});
      return this;
    };
    const originalDns = dns.lookup;
    if (kind === 'nested') dns.lookup = () => dns.lookup('127.0.0.1', { all: true }, () => {});
    syncBuiltinESMExports();
    const server = net.createServer();
    try {
      handle = installOwnedReferenceNetworkScope(binding);
      assert.throws(
        () => server.listen(0, '127.0.0.1'),
        kind === 'throw'
          ? (error) => error === marker
          : { code: 'HTTP_REFERENCE_NETWORK_UNOWNED_TRANSPORT' },
      );
      assert.equal(getterReads, 0);
      assert.equal(server.listening, false);
      assert.throws(() => dns.lookup('127.0.0.1', { all: true }, () => {}), {
        code: 'HTTP_REFERENCE_NETWORK_UNOWNED_TRANSPORT',
      });
      assert.throws(() => closeOwnedReferenceNetworkScope(handle), {
        code:
          kind === 'throw'
            ? 'HTTP_REFERENCE_NETWORK_LISTEN_THROWN'
            : 'HTTP_REFERENCE_NETWORK_UNOWNED_TRANSPORT',
      });
      scopeClosed = true;
    } finally {
      if (handle && !scopeClosed) {
        try {
          closeOwnedReferenceNetworkScope(handle);
        } catch {
          /* explicit fault */
        }
      }
      net.Server.prototype.listen = originalListen;
      dns.lookup = originalDns;
      syncBuiltinESMExports();
      assert.equal(server.listening, false);
    }
  });
}

for (const kind of [
  'extra-slot',
  'hole',
  'accessor',
  'extra-symbol',
  'false-marker',
  'cloned-options',
  'undefined-callback',
  'changed-target',
]) {
  test(`private normalized socket ticket refuses ${kind} builtin-output fault before native connect`, async () => {
    const originalConnect = net.connect,
      originalCreate = net.createConnection;
    const originalSocketConnect = net.Socket.prototype.connect;
    let socket,
      nativeCalls = 0,
      getterReads = 0,
      handle,
      scopeClosed = false;
    net.Socket.prototype.connect = function () {
      nativeCalls++;
      throw new Error('Unexpected native connect after malformed normalization');
    };
    const malformed = function (options) {
      socket = new net.Socket();
      const normalized = [options, null];
      normalized[Symbol('normalizedArgs')] = kind !== 'false-marker';
      if (kind === 'extra-slot') normalized.push('extra');
      if (kind === 'hole') delete normalized[1];
      if (kind === 'accessor')
        Object.defineProperty(normalized, '0', {
          enumerable: true,
          configurable: true,
          get() {
            getterReads++;
            return options;
          },
        });
      if (kind === 'extra-symbol') normalized[Symbol('extra')] = true;
      if (kind === 'cloned-options') normalized[0] = { ...options };
      if (kind === 'undefined-callback') normalized[1] = undefined;
      if (kind === 'changed-target') options.port = 3;
      return socket.connect(normalized);
    };
    net.connect = malformed;
    net.createConnection = malformed;
    syncBuiltinESMExports();
    try {
      handle = installOwnedReferenceNetworkScope(binding);
      assert.throws(
        () => net.connect({ host: '127.0.0.1', port: 1 }),
        (error) => {
          assert.match(error.code, /^HTTP_REFERENCE_NETWORK_NORMALIZED_CONNECT/u);
          return true;
        },
      );
      assert.equal(nativeCalls, 0);
      assert.equal(getterReads, 0);
      assert.throws(
        () => observeOwnedReferenceNetwork(handle),
        (error) => /^HTTP_REFERENCE_NETWORK_NORMALIZED_CONNECT/u.test(error.code),
      );
      assert.throws(
        () => closeOwnedReferenceNetworkScope(handle),
        (error) => /^HTTP_REFERENCE_NETWORK_NORMALIZED_CONNECT/u.test(error.code),
      );
      scopeClosed = true;
    } finally {
      if (socket && !socket.closed) {
        const closed = new Promise((accept) => socket.once('close', accept));
        socket.destroy();
        await closed;
      }
      if (handle && !scopeClosed) {
        try {
          closeOwnedReferenceNetworkScope(handle);
        } catch {
          /* explicit fault */
        }
      }
      net.connect = originalConnect;
      net.createConnection = originalCreate;
      net.Socket.prototype.connect = originalSocketConnect;
      syncBuiltinESMExports();
      assert.equal(socket?.destroyed ?? true, true);
    }
  });
}

for (const kind of ['duplicate', 'nested', 'throw', 'wrong-return', 'different-callback']) {
  test(`normalized ticket ${kind} fault stays refused after cleanup and restores its synchronous scope`, async () => {
    const originalConnect = net.connect,
      originalCreate = net.createConnection;
    const originalSocketConnect = net.Socket.prototype.connect;
    let socket,
      capturedSocketCalls = 0,
      handle,
      scopeClosed = false;
    const marker = new Error('Injected captured net.connect throw');
    net.Socket.prototype.connect = function () {
      capturedSocketCalls++;
      return this;
    };
    const faulty = function (options, callback) {
      if (kind === 'nested') return net.connect(options);
      if (kind === 'throw') throw marker;
      socket = new net.Socket();
      const normalized = [options, kind === 'different-callback' ? () => {} : (callback ?? null)];
      normalized[Symbol('normalizedArgs')] = true;
      const result = socket.connect(normalized);
      if (kind === 'duplicate') socket.connect(normalized);
      return kind === 'wrong-return' ? {} : result;
    };
    net.connect = faulty;
    net.createConnection = faulty;
    syncBuiltinESMExports();
    try {
      handle = installOwnedReferenceNetworkScope(binding);
      const code = {
        duplicate: 'HTTP_REFERENCE_NETWORK_NORMALIZED_CONNECT',
        nested: 'HTTP_REFERENCE_NETWORK_CONNECT_REENTRANCY',
        throw: 'HTTP_REFERENCE_NETWORK_CONNECT_THROWN',
        'wrong-return': 'HTTP_REFERENCE_NETWORK_CONNECT_RETURN_IDENTITY',
        'different-callback': 'HTTP_REFERENCE_NETWORK_NORMALIZED_CONNECT_IDENTITY',
      }[kind];
      assert.throws(
        () => net.connect({ host: '127.0.0.1', port: 1 }, () => {}),
        kind === 'throw' ? (error) => error === marker : { code },
      );
      assert.equal(capturedSocketCalls, ['duplicate', 'wrong-return'].includes(kind) ? 1 : 0);
      if (socket && !socket.closed) {
        const closed = new Promise((accept) => socket.once('close', accept));
        socket.destroy();
        await closed;
      }
      const outside = [{ host: '127.0.0.1', port: 1 }, null];
      outside[Symbol('normalizedArgs')] = true;
      const stranger = new net.Socket();
      try {
        assert.throws(() => stranger.connect(outside), {
          code: 'HTTP_REFERENCE_NETWORK_NORMALIZED_CONNECT',
        });
      } finally {
        const closed = new Promise((accept) => stranger.once('close', accept));
        stranger.destroy();
        await closed;
      }
      assert.throws(() => observeOwnedReferenceNetwork(handle), { code });
      assert.throws(() => closeOwnedReferenceNetworkScope(handle), { code });
      scopeClosed = true;
    } finally {
      if (socket && !socket.closed) {
        const closed = new Promise((accept) => socket.once('close', accept));
        socket.destroy();
        await closed;
      }
      if (handle && !scopeClosed) {
        try {
          closeOwnedReferenceNetworkScope(handle);
        } catch {
          /* explicit fault */
        }
      }
      net.connect = originalConnect;
      net.createConnection = originalCreate;
      net.Socket.prototype.connect = originalSocketConnect;
      syncBuiltinESMExports();
      assert.equal(socket?.destroyed ?? true, true);
    }
  });
}

for (const kind of [
  'numeric-coercion',
  'string-coercion',
  'wrong-host',
  'extra-field',
  'extra-symbol',
  'accessor',
  'null-prototype',
  'callback-substitution',
]) {
  test(`primitive captured normalization refuses ${kind} before native connect`, async () => {
    const originalConnect = net.connect,
      originalCreate = net.createConnection;
    const originalSocketConnect = net.Socket.prototype.connect;
    let socket,
      handle,
      scopeClosed = false,
      nativeCalls = 0,
      getterReads = 0;
    net.Socket.prototype.connect = function () {
      nativeCalls++;
      throw new Error('Unexpected native connect from primitive fault');
    };
    const faulty = function (port, host, callback) {
      socket = new net.Socket();
      const options = { port, host };
      if (kind === 'numeric-coercion') options.port = String(port);
      if (kind === 'string-coercion') options.port = Number(port);
      if (kind === 'wrong-host') options.host = '127.0.0.2';
      if (kind === 'extra-field') options.extra = true;
      if (kind === 'extra-symbol') options[Symbol('extra')] = true;
      if (kind === 'accessor')
        Object.defineProperty(options, 'host', {
          enumerable: true,
          get() {
            getterReads++;
            return host;
          },
        });
      if (kind === 'null-prototype') Object.setPrototypeOf(options, null);
      const normalized = [options, kind === 'callback-substitution' ? () => {} : callback];
      normalized[Symbol('normalizedArgs')] = true;
      return socket.connect(normalized);
    };
    net.connect = faulty;
    net.createConnection = faulty;
    syncBuiltinESMExports();
    try {
      handle = installOwnedReferenceNetworkScope(binding);
      const code =
        kind === 'callback-substitution'
          ? 'HTTP_REFERENCE_NETWORK_NORMALIZED_CONNECT_IDENTITY'
          : 'HTTP_REFERENCE_NETWORK_NORMALIZED_CONNECT_PRIMITIVE';
      assert.throws(
        () => net.connect(kind === 'string-coercion' ? '1' : 1, '127.0.0.1', () => {}),
        { code },
      );
      assert.equal(nativeCalls, 0);
      assert.equal(getterReads, 0);
      assert.throws(() => observeOwnedReferenceNetwork(handle), { code });
      assert.throws(() => closeOwnedReferenceNetworkScope(handle), { code });
      scopeClosed = true;
    } finally {
      if (socket && !socket.closed) {
        const closed = new Promise((accept) => socket.once('close', accept));
        socket.destroy();
        await closed;
      }
      if (handle && !scopeClosed) {
        try {
          closeOwnedReferenceNetworkScope(handle);
        } catch {
          /* explicit primitive fault */
        }
      }
      net.connect = originalConnect;
      net.createConnection = originalCreate;
      net.Socket.prototype.connect = originalSocketConnect;
      syncBuiltinESMExports();
      assert.equal(socket?.destroyed ?? true, true);
    }
  });
}

for (const receiver of ['same', 'other']) {
  for (const overload of ['options', 'primitive']) {
    test(`consumed normalized ticket refuses second ${overload} entry on ${receiver} socket before forwarding`, async (t) => {
      const originalConnect = net.connect,
        originalCreate = net.createConnection,
        originalSocketConnect = net.Socket.prototype.connect;
      const sockets = [];
      const forwarded = [];
      let handle,
        scopeClosed = false;
      net.Socket.prototype.connect = function (...args) {
        forwarded.push({ socket: this, args });
        return this;
      };
      const faulty = function (options, callback) {
        const first = new net.Socket();
        sockets.push(first);
        const normalized = [options, callback];
        normalized[Symbol('normalizedArgs')] = true;
        assert.equal(first.connect(normalized), first);
        const second = receiver === 'same' ? first : new net.Socket();
        if (second !== first) sockets.push(second);
        return overload === 'options'
          ? second.connect(options, callback)
          : second.connect(options.port, options.host, callback);
      };
      net.connect = faulty;
      net.createConnection = faulty;
      syncBuiltinESMExports();
      try {
        handle = installOwnedReferenceNetworkScope(binding);
        const callback = () => {};
        assert.throws(() => net.connect({ host: '127.0.0.1', port: 1 }, callback), {
          code: 'HTTP_REFERENCE_NETWORK_NORMALIZED_CONNECT',
        });
        assert.equal(forwarded.length, 1);
        assert.equal(forwarded[0].socket, sockets[0]);
        assert.equal(forwarded[0].args.length, 1);
        assert.equal(forwarded[0].args[0][1], callback);
        assert.throws(() => observeOwnedReferenceNetwork(handle), {
          code: 'HTTP_REFERENCE_NETWORK_NORMALIZED_CONNECT',
        });
        for (const socket of sockets) {
          const closed = new Promise((accept) => socket.once('close', accept));
          socket.destroy();
          await closed;
        }
        assert.throws(() => closeOwnedReferenceNetworkScope(handle), {
          code: 'HTTP_REFERENCE_NETWORK_NORMALIZED_CONNECT',
        });
        scopeClosed = true;
        assert.equal(forwarded.length, 1);
        t.diagnostic(
          JSON.stringify({
            receiver,
            overload,
            capturedForwardCount: 1,
            socketsClosed: sockets.every((socket) => socket.closed),
            nativeAcceptance: false,
            readinessPromoting: false,
          }),
        );
      } finally {
        for (const socket of sockets) {
          if (!socket.closed) {
            const closed = new Promise((accept) => socket.once('close', accept));
            socket.destroy();
            await closed;
          }
        }
        if (handle && !scopeClosed) {
          try {
            closeOwnedReferenceNetworkScope(handle);
          } catch {
            /* retained refusal */
          }
        }
        net.connect = originalConnect;
        net.createConnection = originalCreate;
        net.Socket.prototype.connect = originalSocketConnect;
        syncBuiltinESMExports();
        assert.equal(net.connect, originalConnect);
        assert.equal(net.Socket.prototype.connect, originalSocketConnect);
      }
    });
  }
}
