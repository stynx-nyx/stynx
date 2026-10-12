import assert from 'node:assert/strict';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { types } from 'node:util';
import {
  installReferenceNestGuard,
  prepareReferenceNestGuard,
  observeReferenceNestPreparation,
  beginReferenceNestCreation,
  endReferenceNestCreation,
  bindReferenceNestAdapter,
  acceptReferenceNestApplication,
  referenceNestOperation,
  closeReferenceNestApplication,
  observeReferenceNestGuard,
  snapshotReferenceNestGuard,
  referenceNestApplicationClosed,
  restoreReferenceNestGuard,
} from '../../../scripts/lib/http-reference-nest-guard.mjs';

const [kind, origin] = process.argv.slice(2);
const originURL = pathToFileURL(origin).href;
const require = createRequire(originURL);
require('reflect-metadata');
if (kind.startsWith('preloaded-')) {
  const targets = {
    'preloaded-factory': '@nestjs/core/nest-factory',
    'preloaded-application': '@nestjs/core/nest-application',
    'preloaded-adapter': '@nestjs/platform-express/adapters/express-adapter',
  };
  require(targets[kind]);
  assert.throws(() => prepareReferenceNestGuard(), {
    code: 'HTTP_REFERENCE_LIFECYCLE_NEST_PREPARATION_ALREADY_CACHED',
  });
  process.stdout.write(
    `${JSON.stringify({ kind, status: 'PASS', constructorCalls: 0, destroyCalls: 0, actualCreateSettled: false, restored: false, closeVerified: false, noListenerStarted: true, runtimeCustodyComplete: false, performanceQualified: false, readinessPromoting: false })}\n`,
  );
  process.exit(0);
}
if (kind === 'prepare-arguments')
  assert.throws(() => prepareReferenceNestGuard({}), {
    code: 'HTTP_REFERENCE_LIFECYCLE_NEST_PREPARATION_CONTEXT',
  });
// No target Nest module has been imported by this producer at preparation.
const custody = prepareReferenceNestGuard();
assert(Object.isFrozen(custody));
assert.equal(Reflect.ownKeys(custody).length, 0);
const preparation = observeReferenceNestPreparation(custody);
assert.equal(preparation.cacheAbsentBeforeRequire, true);
assert.equal(preparation.provenance, 'FIRST_ORIGINAL_REQUIRE_COMPLETION');
assert.equal(preparation.modules.length, 3);
assert(preparation.modules.every((row) => row.loaded === true));
assert.throws(() => prepareReferenceNestGuard(), {
  code: 'HTTP_REFERENCE_LIFECYCLE_NEST_PREPARATION_ALREADY_CACHED',
});
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { NestApplication } = require('@nestjs/core/nest-application');
const { ExpressAdapter } = require('@nestjs/platform-express');
const prototype = Object.getPrototypeOf(NestFactory);
const keys = ['create', 'createNestInstance', 'createAdapterProxy'];
const originals = keys.map((key) => Object.getOwnPropertyDescriptor(prototype, key));
const tick = () => new Promise((accept) => setImmediate(accept));
const marker = new Error('Owned real provider teardown rejection');
let release,
  providerEntered = false,
  constructorCalls = 0,
  destroyCalls = 0;
const barrier = new Promise((accept) => {
  release = accept;
});
class OwnedProvider {
  constructor() {
    constructorCalls++;
  }
  async onModuleDestroy() {
    destroyCalls++;
    if (kind === 'pending-close') await barrier;
    if (kind === 'rejected-close') throw marker;
  }
}
class MinimalModule {}
Module({
  providers:
    kind === 'pending-create'
      ? [
          {
            provide: OwnedProvider,
            useFactory: async () => {
              providerEntered = true;
              await barrier;
              return new OwnedProvider();
            },
          },
        ]
      : [OwnedProvider],
})(MinimalModule);
const adapter = new ExpressAdapter();
let handle,
  app,
  snapshot,
  restored = false,
  closeVerified = false,
  actualCreateSettled = false;
const check = () => {};
const fault = {
  'first-throw': 'FIRST_FORWARD_THROW',
  'second-throw': 'SECOND_FORWARD_THROW',
  'close-throw': 'CLOSE_THROW',
  'close-nonpromise': 'CLOSE_NON_PROMISE',
  'first-duplicate': 'FIRST_ENTRY_DUPLICATE',
  'second-duplicate': 'SECOND_ENTRY_DUPLICATE',
  'second-before-complete': 'SECOND_WITHOUT_FIRST_COMPLETION',
  'second-foreign-proxy': 'SECOND_FOREIGN_PROXY',
  'second-foreign-adapter': 'SECOND_FOREIGN_ADAPTER',
  'first-foreign-raw': 'FIRST_FOREIGN_RAW',
}[kind];
try {
  if (
    [
      'cache-loaded-drift',
      'singleton-drift',
      'constructor-export-drift',
      'constructor-parent-drift',
    ].includes(kind)
  ) {
    let restore;
    const cached = require.cache[require.resolve('@nestjs/core/nest-factory')];
    if (kind === 'cache-loaded-drift') {
      const loaded = cached.loaded;
      cached.loaded = false;
      restore = () => {
        cached.loaded = loaded;
      };
    }
    if (kind === 'singleton-drift') {
      const descriptor = Object.getOwnPropertyDescriptor(cached.exports, 'NestFactory');
      Object.defineProperty(cached.exports, 'NestFactory', { ...descriptor, value: {} });
      restore = () => Object.defineProperty(cached.exports, 'NestFactory', descriptor);
    }
    if (kind === 'constructor-export-drift') {
      const exports = require('@nestjs/core/nest-application');
      const descriptor = Object.getOwnPropertyDescriptor(exports, 'NestApplication');
      Object.defineProperty(exports, 'NestApplication', {
        ...descriptor,
        value: class ForeignApplication {},
      });
      restore = () => Object.defineProperty(exports, 'NestApplication', descriptor);
    }
    if (kind === 'constructor-parent-drift') {
      const parent = Object.getPrototypeOf(NestApplication);
      Object.setPrototypeOf(NestApplication, function ForeignBase() {});
      restore = () => Object.setPrototypeOf(NestApplication, parent);
    }
    let admitted;
    try {
      assert.throws(
        () => {
          admitted = installReferenceNestGuard({ originURL, custody, check });
        },
        (error) => /^HTTP_REFERENCE_LIFECYCLE_/u.test(error.code),
      );
    } finally {
      if (admitted) restoreReferenceNestGuard(admitted);
      restore();
    }
  } else if (kind === 'preexisting-method') {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'createNestInstance');
    let admitted;
    try {
      Object.defineProperty(prototype, 'createNestInstance', {
        ...descriptor,
        value: function (...args) {
          return Reflect.apply(descriptor.value, this, args);
        },
      });
      assert.throws(
        () => {
          admitted = installReferenceNestGuard({ originURL, custody, check });
        },
        (error) => /^HTTP_REFERENCE_LIFECYCLE_/u.test(error.code),
      );
    } finally {
      if (admitted) restoreReferenceNestGuard(admitted);
      Object.defineProperty(prototype, 'createNestInstance', descriptor);
    }
  } else if (kind === 'source-drift') {
    const originalRead = fs.readFileSync;
    const factoryPath = require.resolve('@nestjs/core/nest-factory');
    let tamperedReads = 0;
    fs.readFileSync = function (file, ...args) {
      const value = Reflect.apply(originalRead, this, [file, ...args]);
      if (file === factoryPath) {
        tamperedReads++;
        return Buffer.concat([value, Buffer.from('\n')]);
      }
      return value;
    };
    syncBuiltinESMExports();
    try {
      assert.throws(() => installReferenceNestGuard({ originURL, custody, check }), {
        code: 'HTTP_REFERENCE_LIFECYCLE_NEST_PRIVATE_IMPLEMENTATION',
      });
    } finally {
      fs.readFileSync = originalRead;
      syncBuiltinESMExports();
    }
    assert.equal(tamperedReads, 1);
    assert.equal(constructorCalls, 0);
  } else {
    if (kind === 'forged-custody') {
      for (const forged of [{}, structuredClone(preparation), new Proxy(custody, {})])
        assert.throws(() => installReferenceNestGuard({ originURL, custody: forged, check }), {
          code: 'HTTP_REFERENCE_LIFECYCLE_NEST_PREPARATION_CONTEXT',
        });
    }
    handle = installReferenceNestGuard({ originURL, custody, check, ...(fault ? { fault } : {}) });
    bindReferenceNestAdapter(handle, adapter);
    if (kind === 'concurrent-install') {
      assert.throws(() => installReferenceNestGuard({ originURL, custody, check }), {
        code: 'HTTP_REFERENCE_LIFECYCLE_NEST_GUARD_CONTEXT',
      });
      assert.equal(observeReferenceNestGuard(handle).failure, null);
    }
    beginReferenceNestCreation(handle);
    const creating = NestFactory.create(
      MinimalModule,
      kind === 'adapter-mismatch' ? new ExpressAdapter() : adapter,
      {
        logger: false,
        abortOnError: false,
      },
    );
    assert(types.isPromise(creating));
    if (kind === 'pending-create') {
      await tick();
      assert.equal(providerEntered, true);
      assert.equal(snapshotReferenceNestGuard(handle).creationPending, true);
      assert.throws(() => restoreReferenceNestGuard(handle), {
        code: 'HTTP_REFERENCE_LIFECYCLE_CLEANUP_INCOMPLETE',
      });
      assert.equal(snapshotReferenceNestGuard(handle).descriptorsRestored, false);
      release();
      await assert.rejects(creating, { code: 'HTTP_REFERENCE_LIFECYCLE_CLEANUP_INCOMPLETE' });
      actualCreateSettled = true;
      assert.throws(() => endReferenceNestCreation(handle), {
        code: 'HTTP_REFERENCE_LIFECYCLE_CLEANUP_INCOMPLETE',
      });
      // Architect v5: sticky admission failure permits verified raw cleanup
      // after actual creation settles; restoration grants no acceptance.
      assert.throws(() => observeReferenceNestGuard(handle), {
        code: 'HTTP_REFERENCE_LIFECYCLE_CLEANUP_INCOMPLETE',
      });
      assert.equal(snapshotReferenceNestGuard(handle).failure, 'CLEANUP_INCOMPLETE');
      const closing = closeReferenceNestApplication(handle, true);
      assert(types.isPromise(closing));
      assert.equal(closeReferenceNestApplication(handle, true), closing);
      assert.equal(closeReferenceNestApplication(handle, false), closing);
      await closing;
      assert.equal(destroyCalls, 1);
      assert.equal(snapshotReferenceNestGuard(handle).actualCloseResolved, true);
      assert.equal(snapshotReferenceNestGuard(handle).actualClosePending, false);
      assert.throws(() => observeReferenceNestGuard(handle), {
        code: 'HTTP_REFERENCE_LIFECYCLE_CLEANUP_INCOMPLETE',
      });
      snapshot = restoreReferenceNestGuard(handle);
      restored = true;
      assert.equal(snapshot.failure, 'CLEANUP_INCOMPLETE');
      assert.equal(snapshot.publicAppAccepted, false);
      assert.equal(snapshot.closeKind, 'raw-fallback');
      assert.equal(snapshot.closeResolved, true);
      assert.equal(snapshot.complete, false);
      assert.equal(snapshot.runtimeCustodyComplete, false);
      assert.equal(snapshot.performanceQualified, false);
      assert.equal(snapshot.readinessPromoting, false);
    } else if (
      [
        'first-throw',
        'second-throw',
        'adapter-mismatch',
        'first-duplicate',
        'second-duplicate',
        'second-before-complete',
        'second-foreign-proxy',
        'second-foreign-adapter',
        'first-foreign-raw',
      ].includes(kind)
    ) {
      await assert.rejects(creating, {
        code: [
          'adapter-mismatch',
          'second-duplicate',
          'second-before-complete',
          'second-foreign-proxy',
          'second-foreign-adapter',
        ].includes(kind)
          ? 'HTTP_REFERENCE_LIFECYCLE_PUBLIC_NEST_PROXY_LINK'
          : ['first-duplicate', 'first-foreign-raw'].includes(kind)
            ? 'HTTP_REFERENCE_LIFECYCLE_RAW_NEST_APPLICATION_LINK'
            : 'HTTP_REFERENCE_NEST_GUARD_INJECTED',
      });
      actualCreateSettled = true;
      const code = [
        'adapter-mismatch',
        'second-duplicate',
        'second-before-complete',
        'second-foreign-proxy',
        'second-foreign-adapter',
      ].includes(kind)
        ? 'HTTP_REFERENCE_LIFECYCLE_PUBLIC_NEST_PROXY_LINK'
        : ['first-duplicate', 'first-foreign-raw'].includes(kind)
          ? 'HTTP_REFERENCE_LIFECYCLE_RAW_NEST_APPLICATION_LINK'
          : kind === 'first-throw'
            ? 'HTTP_REFERENCE_LIFECYCLE_FIRST_NEST_PROXY_FORWARDING'
            : 'HTTP_REFERENCE_LIFECYCLE_PUBLIC_NEST_PROXY_FORWARDING';
      assert.throws(() => endReferenceNestCreation(handle), { code });
      const pending = closeReferenceNestApplication(handle, true);
      assert.equal(closeReferenceNestApplication(handle, true), pending);
      await pending;
      snapshot = restoreReferenceNestGuard(handle);
      restored = true;
      assert.equal(snapshot.closeKind, 'raw-fallback');
      assert.equal(snapshot.actualCloseResolved, true);
      assert.equal(snapshot.faultUsed, kind !== 'adapter-mismatch');
      if (kind !== 'adapter-mismatch' && !['first-throw', 'second-throw'].includes(kind)) {
        assert.deepEqual(snapshot.injectedEvents, [fault]);
        assert.equal(snapshot.firstForwardCount, kind === 'first-foreign-raw' ? 0 : 1);
        assert.equal(snapshot.secondForwardCount, kind === 'second-duplicate' ? 1 : 0);
        assert.equal(snapshot.rawValidated, true);
      }
      assert.equal(snapshot.failure, code.replace('HTTP_REFERENCE_LIFECYCLE_', ''));
    } else {
      app = await creating;
      actualCreateSettled = true;
      endReferenceNestCreation(handle);
      assert(types.isProxy(app));
      acceptReferenceNestApplication(handle, app);
      assert.equal(referenceNestOperation(handle, 'getHttpAdapter', []), adapter);
      const server = referenceNestOperation(handle, 'getHttpServer', []);
      assert.equal(server.listening, false);
      assert.notEqual(app.init, app.init);
      const provider = referenceNestOperation(handle, 'get', [OwnedProvider, { strict: false }]);
      assert(provider instanceof OwnedProvider);
      assert.equal(constructorCalls, 1);
      await referenceNestOperation(handle, 'init', []);
      assert.equal(server.listening, false);
      if (kind === 'duplicate-create') {
        assert.throws(
          () => NestFactory.create(MinimalModule, adapter, { logger: false, abortOnError: false }),
          { code: 'HTTP_REFERENCE_LIFECYCLE_NEST_CREATE_SCOPE' },
        );
      } else if (kind === 'wrong-app') {
        assert.throws(() => acceptReferenceNestApplication(handle, new Proxy({}, {})), {
          code: 'HTTP_REFERENCE_LIFECYCLE_APP_IDENTITY',
        });
      } else if (kind === 'wrong-adapter') {
        assert.throws(() => bindReferenceNestAdapter(handle, new ExpressAdapter()), {
          code: 'HTTP_REFERENCE_LIFECYCLE_ACTUAL_ADAPTER',
        });
      } else if (kind === 'method-drift' || kind === 'descriptor-drift') {
        const owner = kind === 'method-drift' ? NestApplication.prototype : prototype;
        const key = kind === 'method-drift' ? 'init' : 'createNestInstance';
        const descriptor = Object.getOwnPropertyDescriptor(owner, key);
        try {
          Object.defineProperty(owner, key, {
            ...descriptor,
            value: function (...args) {
              return Reflect.apply(descriptor.value, this, args);
            },
          });
          assert.throws(() => observeReferenceNestGuard(handle), {
            code:
              kind === 'method-drift'
                ? 'HTTP_REFERENCE_LIFECYCLE_NEST_PREEXISTING_APPLICATION_METHOD_DRIFT'
                : 'HTTP_REFERENCE_LIFECYCLE_DESCRIPTOR_DRIFT',
          });
        } finally {
          Object.defineProperty(owner, key, descriptor);
        }
      }
      if (kind === 'close-throw' || kind === 'close-nonpromise') {
        const code =
          kind === 'close-throw'
            ? 'HTTP_REFERENCE_NEST_GUARD_INJECTED'
            : 'HTTP_REFERENCE_LIFECYCLE_CLOSE_PROMISE';
        assert.throws(() => closeReferenceNestApplication(handle, false), { code });
        const retained = closeReferenceNestApplication(handle, true);
        assert.equal(closeReferenceNestApplication(handle, false), retained);
        await assert.rejects(retained, { code });
        await tick();
        assert.equal(destroyCalls, 1);
        assert.equal(snapshotReferenceNestGuard(handle).actualCloseResolved, true);
        assert.equal(snapshotReferenceNestGuard(handle).closeUncertain, true);
        assert.throws(() => restoreReferenceNestGuard(handle), {
          code:
            kind === 'close-throw'
              ? 'HTTP_REFERENCE_LIFECYCLE_CLOSE_FORWARDING'
              : 'HTTP_REFERENCE_LIFECYCLE_CLOSE_PROMISE',
        });
      } else if (kind === 'rejected-close') {
        const pending = closeReferenceNestApplication(handle, false);
        assert.equal(closeReferenceNestApplication(handle, true), pending);
        await assert.rejects(pending, (error) => error === marker);
        assert.equal(destroyCalls, 1);
        assert.equal(snapshotReferenceNestGuard(handle).actualCloseRejected, true);
        assert.throws(() => restoreReferenceNestGuard(handle), {
          code: 'HTTP_REFERENCE_LIFECYCLE_CLEANUP_INCOMPLETE',
        });
      } else if (kind === 'pending-close') {
        const pending = closeReferenceNestApplication(handle, false);
        await tick();
        assert.equal(destroyCalls, 1);
        assert.equal(snapshotReferenceNestGuard(handle).actualClosePending, true);
        assert.equal(closeReferenceNestApplication(handle, true), pending);
        assert.throws(() => restoreReferenceNestGuard(handle), {
          code: 'HTTP_REFERENCE_LIFECYCLE_CLEANUP_INCOMPLETE',
        });
        assert.equal(snapshotReferenceNestGuard(handle).descriptorsRestored, false);
        release();
        await pending;
        closeVerified = referenceNestApplicationClosed(handle, app);
        assert.equal(closeVerified, true);
        snapshot = restoreReferenceNestGuard(handle);
        restored = true;
        assert.equal(snapshot.failure, 'CLEANUP_INCOMPLETE');
      } else {
        const fallback = [
          'duplicate-create',
          'wrong-app',
          'wrong-adapter',
          'method-drift',
          'descriptor-drift',
        ].includes(kind);
        const pending = closeReferenceNestApplication(handle, fallback);
        assert.equal(closeReferenceNestApplication(handle, !fallback), pending);
        await pending;
        assert.equal(destroyCalls, 1);
        closeVerified = referenceNestApplicationClosed(handle, app);
        assert.equal(closeVerified, true);
        snapshot = restoreReferenceNestGuard(handle);
        restored = true;
        assert.equal(snapshot.rawFirstPublicIdentityObserved, true);
        assert.equal(snapshot.publicAppAccepted, true);
        assert.equal(snapshot.actualCloseResolved, true);
        assert.equal(snapshot.closeKind, fallback ? 'raw-fallback' : 'public');
        if (!fallback) assert.equal(snapshot.failure, null);
      }
    }
    if (kind === 'serialized-reuse') {
      assert.equal(restored, true);
      const repeated = installReferenceNestGuard({ originURL, custody, check });
      const actualAdapter = new ExpressAdapter();
      bindReferenceNestAdapter(repeated, actualAdapter);
      beginReferenceNestCreation(repeated);
      const actualApp = await NestFactory.create(MinimalModule, actualAdapter, {
        logger: false,
        abortOnError: false,
      });
      endReferenceNestCreation(repeated);
      acceptReferenceNestApplication(repeated, actualApp);
      await referenceNestOperation(repeated, 'init', []);
      const closing = closeReferenceNestApplication(repeated, false);
      assert.equal(closeReferenceNestApplication(repeated, true), closing);
      await closing;
      assert.equal(referenceNestApplicationClosed(repeated, actualApp), true);
      snapshot = restoreReferenceNestGuard(repeated);
      assert.equal(constructorCalls, 2);
      assert.equal(destroyCalls, 2);
      assert.equal(snapshot.descriptorsRestored, true);
    }
    snapshot ??= snapshotReferenceNestGuard(handle);
    assert.equal(snapshot.creationPending, false);
    assert.equal(snapshot.actualClosePending, false);
    assert.equal(snapshot.runtimeCustodyComplete, false);
    assert.equal(snapshot.readinessPromoting, false);
    if (restored) {
      for (const [index, key] of keys.entries())
        assert.deepEqual(Object.getOwnPropertyDescriptor(prototype, key), originals[index]);
      assert.equal(restoreReferenceNestGuard(handle).descriptorsRestored, true);
    }
  }
  process.stdout.write(
    `${JSON.stringify({ kind, status: 'PASS', constructorCalls, destroyCalls, actualCreateSettled, restored, closeVerified, snapshot, noListenerStarted: true, runtimeCustodyComplete: false, performanceQualified: false, readinessPromoting: false })}\n`,
  );
} catch (error) {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
}
