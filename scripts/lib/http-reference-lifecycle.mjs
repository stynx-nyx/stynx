import { httpComposition, isHttpComposition } from './http-composition-roster.mjs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  readFileSync,
  constants,
  openSync,
  closeSync,
  writeSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  realpathSync,
} from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import { isDeepStrictEqual, types } from 'node:util';
import { observeReferenceBootstrapModule } from './http-runtime-bindings.mjs';
import { serializeHttpRuntimePlainJson } from './http-runtime-protocol.mjs';
import {
  emitReferenceLifecyclePhase,
  assertReferenceLifecycleChannel,
} from './http-reference-loopback-protocol.mjs';
import {
  bindOwnedReferenceListener,
  bindOwnedReferenceObjectStoreClient,
  observeOwnedReferenceNetwork,
} from './http-reference-network.mjs';
import {
  observeReferenceRegistryObjects,
  observeReferenceRegistry,
} from './http-reference-registry.mjs';

import {
  installReferenceNestGuard,
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
} from './http-reference-nest-guard.mjs';

// This is a fixed-worker component, not a launcher or an admission capability.
// The supervisor must independently bind its actual child/fixture/control graph.
let active;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => serializeHttpRuntimePlainJson(value);
const sha = (value) => digest(json(value));
const deadlineMs = 30_000;
const requestLimit = 64 * 1024;
const monotonicNow = process.hrtime.bigint.bind(process.hrtime);
const remainingTime = (state) =>
  state.job.mode === 'http-original-scenario'
    ? Number(state.monotonicDeadline - monotonicNow()) / 1_000_000
    : state.deadline - Date.now();
function setLifecycleDeadline(state, milliseconds) {
  state.deadline = Date.now() + milliseconds;
  if (state.job.mode === 'http-original-scenario')
    state.monotonicDeadline = monotonicNow() + BigInt(milliseconds) * 1_000_000n;
}

function refuse(state, reason) {
  state.failure ??= reason;
  const error = new Error('Reference factory lifecycle refused its closed observation');
  error.code = `HTTP_REFERENCE_LIFECYCLE_${state.failure}`;
  throw error;
}

function data(object, key) {
  if (!object || types.isProxy(object)) return undefined;
  let current = object;
  while (current) {
    if (types.isProxy(current)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) return Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

function check(state) {
  if (state.failure || state.closed) refuse(state, state.failure ?? 'CLOSED');
  if (
    state.job.mode === 'http-original-scenario' &&
    (!process.connected || process.ppid !== state.job.parentPid)
  )
    refuse(state, 'ORIGINAL_PARENT_DISCONNECTED');
  const environment = Object.fromEntries(
    Object.keys(process.env)
      .filter((key) => key !== 'STYNX_HTTP_JOB_SHA256')
      .sort()
      .map((key) => [key, digest(process.env[key])]),
  );
  if (!isDeepStrictEqual(environment, state.job.environment)) refuse(state, 'ENVIRONMENT_DRIFT');
  for (const row of state.patches)
    if (!isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.object, row.key), row.installed))
      refuse(state, 'DESCRIPTOR_DRIFT');
  checkOptions(state);
  if (remainingTime(state) <= 0) refuse(state, 'DEADLINE');
}

function patch(state, object, key, make) {
  const original = Object.getOwnPropertyDescriptor(object, key);
  if (
    !original ||
    !Object.hasOwn(original, 'value') ||
    typeof original.value !== 'function' ||
    !original.configurable ||
    !original.writable
  )
    refuse(state, 'DESCRIPTOR');
  const value = make(original.value);
  const installed = { ...original, value };
  Object.defineProperty(object, key, installed);
  const row = { object, key, original, installed };
  state.patches.push(row);
  return row;
}

function note(state, callback, kind, configuration = null, extra = {}) {
  if (typeof callback !== 'function' || types.isProxy(callback) || state.callbacks.has(callback))
    refuse(state, 'CALLBACK_IDENTITY');
  const row = { callback, id: state.callbacks.size + 1, kind, configuration, calls: 0, ...extra };
  state.callbacks.set(callback, row);
  return row;
}

function optionSnapshot(state, value, seen = new Set()) {
  if (value === null || !['object', 'function'].includes(typeof value)) return;
  if (types.isProxy(value)) refuse(state, 'OPTION_PROXY');
  if (seen.has(value)) return;
  seen.add(value);
  if (seen.size > 10_000) refuse(state, 'OPTION_POPULATION_BOUND');
  const prototype = Object.getPrototypeOf(value);
  if (typeof value !== 'function' && ![Object.prototype, Array.prototype, null].includes(prototype))
    refuse(state, 'OPTION_OBJECT_KIND');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value'))
      refuse(state, 'OPTION_DESCRIPTOR');
  }
  state.optionSnapshots.push({ object: value, prototype, descriptors });
  if (typeof value !== 'function')
    for (const descriptor of Object.values(descriptors))
      optionSnapshot(state, descriptor.value, seen);
}

function checkOptions(state) {
  for (const row of state.optionSnapshots) {
    if (Object.getPrototypeOf(row.object) !== row.prototype) refuse(state, 'OPTION_DRIFT');
    const actual = Object.getOwnPropertyDescriptors(row.object);
    const keys = Reflect.ownKeys(row.descriptors);
    if (!isDeepStrictEqual(Reflect.ownKeys(actual), keys)) refuse(state, 'OPTION_DRIFT');
    for (const key of keys) {
      const before = row.descriptors[key],
        after = actual[key];
      if (
        before.value !== after.value ||
        before.writable !== after.writable ||
        before.enumerable !== after.enumerable ||
        before.configurable !== after.configurable ||
        !Object.hasOwn(after, 'value')
      )
        refuse(state, 'OPTION_DRIFT');
    }
  }
}

function sourceConstructor(state, source, name) {
  const unit = state.job.referenceRegistry.units.find((row) => row.source.path === source);
  if (!unit || !unit.classes.some((row) => row.exportName === name)) refuse(state, 'DECLARATION');
  const cached = state.require.cache[resolve(state.job.checkoutRoot, unit.emitted.path)];
  const value = cached?.loaded && Object.getOwnPropertyDescriptor(cached.exports, name)?.value;
  if (typeof value !== 'function') refuse(state, 'CACHED_DECLARATION');
  return value;
}

function snapshotStack(state) {
  check(state);
  const stack = state.adapter.getInstance().router?.stack;
  if (!Array.isArray(stack) || types.isProxy(stack)) refuse(state, 'LAYER_POPULATION');
  const snapshots = [];
  const report = [];
  const reached = new Set();
  for (const [index, layer] of stack.entries()) {
    if (!layer || types.isProxy(layer) || typeof data(layer, 'handle') !== 'function')
      refuse(state, 'LAYER_IDENTITY');
    const route = data(layer, 'route');
    if (!route) {
      const origin = state.callbacks.get(data(layer, 'handle'));
      if (!origin || data(layer.handle, 'stack') !== undefined) refuse(state, 'UNKNOWN_MIDDLEWARE');
      snapshots.push({ layer, handle: layer.handle, route, origin });
      report.push({ index, kind: 'middleware', callbackId: origin.id, middleware: origin.kind });
      continue;
    }
    if (
      types.isProxy(route) ||
      typeof data(route, 'path') !== 'string' ||
      !Array.isArray(data(route, 'stack')) ||
      route.stack.length !== 1 ||
      !data(route, 'methods') ||
      types.isProxy(route.methods)
    )
      refuse(state, 'ROUTE_SHAPE');
    const inner = route.stack[0];
    const callback = data(inner, 'handle');
    const origin = state.callbacks.get(callback);
    if (!origin) refuse(state, 'UNKNOWN_ROUTE_CALLBACK');
    const methods = Object.getOwnPropertyDescriptors(route.methods);
    if (
      Reflect.ownKeys(methods).some(
        (key) =>
          typeof key !== 'string' ||
          !Object.hasOwn(methods[key], 'value') ||
          methods[key].value !== true,
      )
    )
      refuse(state, 'ROUTE_METHODS');
    const enabled = Object.keys(methods);
    if (enabled.length !== 1) refuse(state, 'ROUTE_METHODS');
    if (origin.kind === 'product-route') {
      if (
        enabled[0] !== origin.method.toLowerCase() ||
        inner.method !== enabled[0] ||
        route.path !== origin.path
      )
        refuse(state, 'ROUTE_REGISTRATION');
      reached.add(origin);
    } else if (
      !['request-logging', 'cls', 'privacy-http-context'].includes(origin.kind) ||
      enabled[0] !== '_all' ||
      inner.method !== undefined
    )
      refuse(state, 'MIDDLEWARE_ROUTE');
    snapshots.push({
      layer,
      handle: layer.handle,
      route,
      path: route.path,
      methods,
      inner,
      innerHandle: callback,
      innerMethod: inner.method,
      origin,
    });
    report.push({
      index,
      kind: origin.kind === 'product-route' ? 'route' : 'middleware-route',
      callbackId: origin.id,
      middleware: origin.kind,
      path: route.path,
      methods: enabled,
    });
  }
  if (reached.size !== state.routes.length) refuse(state, 'REGISTRATION_POPULATION');
  if (state.stackSnapshots) {
    if (snapshots.length !== state.stackSnapshots.length) refuse(state, 'STACK_DRIFT');
    for (const [index, row] of snapshots.entries()) {
      const previous = state.stackSnapshots[index];
      for (const key of [
        'layer',
        'handle',
        'route',
        'path',
        'inner',
        'innerHandle',
        'innerMethod',
        'origin',
      ])
        if (row[key] !== previous[key]) refuse(state, 'STACK_DRIFT');
      if (!isDeepStrictEqual(row.methods, previous.methods)) refuse(state, 'STACK_DRIFT');
    }
  } else state.stackSnapshots = snapshots;
  return report;
}

function publicOperation(state, name, args) {
  return referenceNestOperation(state.nestGuard, name, args);
}

function closeApplication(state, fallback) {
  return closeReferenceNestApplication(state.nestGuard, fallback);
}

function install(state) {
  const require = state.require;
  for (const [specifier, version] of [
    ['@nestjs/core/package.json', '11.2.3'],
    ['@nestjs/platform-express/package.json', '11.2.3'],
  ])
    if (require(specifier).version !== version) refuse(state, 'DEPENDENCY_VERSION');
  const adapterModule = require('@nestjs/platform-express/adapters/express-adapter');
  const OriginalAdapter = adapterModule.ExpressAdapter;
  const adapterRequire = createRequire(
    require.resolve('@nestjs/platform-express/adapters/express-adapter'),
  );
  const express = adapterRequire('express');
  const expressRequire = createRequire(adapterRequire.resolve('express'));
  const Layer = expressRequire('router/lib/layer');
  if (
    adapterRequire('express/package.json').version !== '5.2.1' ||
    expressRequire('router/package.json').version !== '2.2.0'
  )
    refuse(state, 'DEPENDENCY_VERSION');
  const { MiddlewareModule } = require('@nestjs/core/middleware/middleware-module');
  const { RouterExplorer } = require('@nestjs/core/router/router-explorer');
  const { AbstractHttpAdapter } = require('@nestjs/core/adapters/http-adapter');
  const { RequestMethod } = require('@nestjs/common');
  state.ModulesContainer = require('@nestjs/core').ModulesContainer;
  // Capture the actual original adapter before the separately owned export
  // construct observer below. The shared guard is the sole Nest link owner.
  state.nestGuard = installReferenceNestGuard({
    originURL: state.moduleURL,
    custody: state.nestPreparation,
    check: () => check(state),
  });
  const factoryPath = require.resolve('@nestjs/core/nest-factory');
  const factoryRow = state.job.receipt.files.find(
    (row) => row.url === pathToFileURL(factoryPath).href,
  );
  const guard = observeReferenceNestGuard(state.nestGuard);
  if (
    !factoryRow ||
    factoryRow.sha256 !== guard.sourceSha256 ||
    digest(readFileSync(factoryPath)) !== guard.sourceSha256
  )
    refuse(state, 'NEST_PRIVATE_IMPLEMENTATION');

  patch(
    state,
    express.application,
    'use',
    (original) =>
      function (...args) {
        check(state);
        if (state.constructing) {
          if (args.length !== 1 || typeof args[0] !== 'function') refuse(state, 'INITIAL_LAYER');
          state.initial.push({ application: this, callback: args[0] });
          note(state, args[0], 'actual-adapter-initial-hook');
        } else if (state.registration) {
          if (args.length !== 1 || typeof args[0] !== 'function') refuse(state, 'MIDDLEWARE_MOUNT');
          note(state, args[0], state.registration.kind, state.registration.configuration);
        } else if (args.some((arg) => typeof arg === 'function' && !state.callbacks.has(arg)))
          refuse(state, 'UNKNOWN_MIDDLEWARE');
        return Reflect.apply(original, this, args);
      },
  );
  patch(
    state,
    adapterModule,
    'ExpressAdapter',
    (original) =>
      new Proxy(original, {
        construct(target, args, newTarget) {
          check(state);
          if (
            state.adapter ||
            state.constructing ||
            args.length !== 1 ||
            args[0] !== undefined ||
            newTarget !== adapterModule.ExpressAdapter
          )
            refuse(state, 'ADAPTER_CONSTRUCTION');
          state.constructing = true;
          let instance;
          try {
            instance = Reflect.construct(target, args, target);
          } finally {
            state.constructing = false;
          }
          state.adapter = instance;
          if (
            Object.getPrototypeOf(instance) !== OriginalAdapter.prototype ||
            state.initial.length !== 1 ||
            state.initial[0].application !== instance.getInstance()
          )
            refuse(state, 'ACTUAL_ADAPTER');
          bindReferenceNestAdapter(state.nestGuard, instance);
          return instance;
        },
      }),
  );
  const registration = (kind, options, original, receiver, args) => {
    if (state.registration) refuse(state, 'REGISTRATION_REENTRANCY');
    const row = { kind, configuration: JSON.parse(json(options ?? null)) };
    state.registration = row;
    try {
      return Reflect.apply(original, receiver, args);
    } finally {
      state.registration = undefined;
    }
  };
  for (const [name, kind] of [
    ['enableCors', 'cors'],
    ['setNotFoundHandler', 'nest-not-found'],
    ['setErrorHandler', 'nest-error'],
  ])
    patch(
      state,
      OriginalAdapter.prototype,
      name,
      (original) =>
        function (...args) {
          check(state);
          if (this !== state.adapter) refuse(state, 'ADAPTER_IDENTITY');
          return registration(kind, name === 'enableCors' ? args[0] : null, original, this, args);
        },
    );
  for (const name of ['json', 'urlencoded'])
    patch(
      state,
      express,
      name,
      (original) =>
        function (...args) {
          check(state);
          const callback = Reflect.apply(original, this, args);
          note(state, callback, `express-${name}`, JSON.parse(json(args[0] ?? null)));
          return callback;
        },
    );

  const helmetPath = require.resolve('helmet');
  const helmet = require('helmet');
  const helmetModule = require.cache[helmetPath];
  // Helmet intentionally exports no package.json subpath. Read its exact
  // bound manifest path instead of generating a failed optional resolution.
  const helmetManifestPath = resolve(dirname(helmetPath), 'package.json');
  const manifest = state.job.receipt.files.find(
    (row) => row.url === pathToFileURL(helmetManifestPath).href,
  );
  const manifestBytes = readFileSync(helmetManifestPath);
  if (
    !manifest ||
    manifest.moduleKind !== 'json' ||
    digest(manifestBytes) !== manifest.sha256 ||
    JSON.parse(manifestBytes.toString('utf8')).version !== '8.2.0'
  )
    refuse(state, 'HELMET_MANIFEST');
  if (
    !helmetModule?.loaded ||
    helmetModule.exports !== helmet ||
    typeof helmet !== 'function' ||
    helmet.default !== helmet
  )
    refuse(state, 'HELMET_EXPORT');
  // The actual CJS callable's default alias is preserved as a forwarding alias;
  // original returned middleware is retained, never replaced by a stand-in.
  const forwardingHelmet = function (...args) {
    check(state);
    const callback = Reflect.apply(helmet, this, args);
    note(state, callback, 'helmet', JSON.parse(json(args[0] ?? null)));
    return callback;
  };
  Object.defineProperties(
    forwardingHelmet,
    Object.fromEntries(
      Object.entries(Object.getOwnPropertyDescriptors(helmet)).filter(
        ([key]) => !['length', 'name', 'prototype', 'arguments', 'caller', 'default'].includes(key),
      ),
    ),
  );
  Object.defineProperty(forwardingHelmet, 'default', {
    ...Object.getOwnPropertyDescriptor(helmet, 'default'),
    value: forwardingHelmet,
  });
  // Module.exports is a public, actual import boundary with an exact final restore.
  patch(state, helmetModule, 'exports', () => forwardingHelmet);

  patch(
    state,
    MiddlewareModule.prototype,
    'createProxy',
    (original) =>
      function (...args) {
        check(state);
        const instance = args[0];
        const prototype = instance && !types.isProxy(instance) && Object.getPrototypeOf(instance);
        const constructor =
          prototype && Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value;
        const logging = sourceConstructor(
          state,
          'packages/logging/src/request-logging.middleware.ts',
          'RequestLoggingMiddleware',
        );
        const coreUnit = state.job.referenceRegistry.units.find(
          (row) => row.source.path === 'packages/core/src/core.module.ts',
        );
        const corePath = coreUnit && resolve(state.job.checkoutRoot, coreUnit.emitted.path);
        if (!corePath || !require.cache[corePath]?.loaded) refuse(state, 'CLS_DECLARATION_PARENT');
        const clsRequire = createRequire(corePath);
        if (clsRequire('nestjs-cls/package.json').version !== '6.3.0')
          refuse(state, 'DEPENDENCY_VERSION');
        const cls = clsRequire('nestjs-cls').ClsMiddleware;
        const privacy =
          state.job.compositionId === 'privacy'
            ? sourceConstructor(
                state,
                'packages/privacy/src/privacy-context.ts',
                'PrivacyHttpContextMiddleware',
              )
            : undefined;
        const kind =
          constructor === logging
            ? 'request-logging'
            : constructor === cls
              ? 'cls'
              : privacy && constructor === privacy
                ? 'privacy-http-context'
                : undefined;
        if (!kind || typeof data(instance, 'use') !== 'function')
          refuse(state, 'UNKNOWN_MIDDLEWARE_INSTANCE');
        let observed = state.middlewareInstances.find((row) => row.instance === instance);
        if (!observed) {
          const own = Object.getOwnPropertyDescriptor(instance, 'use');
          const use = data(instance, 'use');
          observed = {
            instance,
            prototype,
            constructor,
            prototypeUseDescriptor: Object.getOwnPropertyDescriptor(prototype, 'use'),
            use,
            own,
            kind,
            calls: 0,
            options: data(instance, 'options'),
            setup: data(data(instance, 'options'), 'setup'),
            setupCalls: 0,
          };
          if (kind === 'cls' && typeof observed.setup === 'function') {
            patch(
              state,
              observed.options,
              'setup',
              (originalSetup) =>
                function (...setupArgs) {
                  check(state);
                  observed.setupCalls++;
                  return Reflect.apply(originalSetup, this, setupArgs);
                },
            );
          }
          observed.installedSetup = data(observed.options, 'setup');
          optionSnapshot(state, observed.options);
          const forwarding = function (...useArgs) {
            check(state);
            if (this !== instance) refuse(state, 'MIDDLEWARE_RECEIVER');
            observed.calls++;
            return Reflect.apply(use, this, useArgs);
          };
          // Inherited logging and own CLS use are explicit distinct descriptor cases.
          const installed = own
            ? { ...own, value: forwarding }
            : { value: forwarding, configurable: true, enumerable: false, writable: true };
          if (own && (!Object.hasOwn(own, 'value') || !own.configurable || !own.writable))
            refuse(state, 'MIDDLEWARE_DESCRIPTOR');
          Object.defineProperty(instance, 'use', installed);
          state.instancePatches.push({ instance, original: own, installed });
          state.middlewareInstances.push(observed);
        }
        const result = Reflect.apply(original, this, args);
        if (!(result instanceof Promise)) refuse(state, 'MIDDLEWARE_PROXY_PROMISE');
        // Preserve the actual promise returned by the original async method.
        result.then(
          (callback) => {
            try {
              note(state, callback, kind, null, { middlewareInstance: observed });
            } catch {
              state.failure ??= 'MIDDLEWARE_PROXY';
            }
          },
          () => {
            state.failure ??= 'MIDDLEWARE_PROXY_REJECTED';
          },
        );
        return result;
      },
  );

  patch(
    state,
    RouterExplorer.prototype,
    'applyCallbackToRouter',
    (original) =>
      function (...args) {
        check(state);
        const [adapter, definition, wrapper, moduleKey, metadata, host] = args;
        const method = RequestMethod[definition?.requestMethod];
        if (
          args.length !== 6 ||
          adapter !== state.adapter ||
          host != null ||
          !['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'SEARCH'].includes(
            method,
          ) ||
          !wrapper?.instance ||
          typeof definition.targetCallback !== 'function' ||
          data(wrapper.instance, definition.methodName) !== definition.targetCallback
        )
          refuse(state, 'CONTROLLER_REGISTRATION');
        const key = method.toLowerCase();
        if (Object.hasOwn(adapter, key) || adapter[key] !== AbstractHttpAdapter.prototype[key])
          refuse(state, 'ADAPTER_ROUTE_DESCRIPTOR');
        const originalRegister = adapter[key];
        const installed = {
          configurable: true,
          enumerable: false,
          writable: true,
          value: function (path, ...handlers) {
            check(state);
            if (this !== adapter || typeof path !== 'string' || handlers.length !== 1)
              refuse(state, 'ROUTE_OVERLOAD');
            const row = note(state, handlers[0], 'product-route', null, {
              adapter,
              definition,
              wrapper,
              moduleKey,
              metadata,
              method,
              path,
            });
            state.routes.push(row);
            return Reflect.apply(originalRegister, this, [path, ...handlers]);
          },
        };
        Object.defineProperty(adapter, key, installed);
        try {
          return Reflect.apply(original, this, args);
        } finally {
          if (!isDeepStrictEqual(Object.getOwnPropertyDescriptor(adapter, key), installed))
            refuse(state, 'ADAPTER_ROUTE_DESCRIPTOR');
          delete adapter[key];
        }
      },
  );
  for (const name of ['handleRequest', 'handleError'])
    patch(
      state,
      Layer.prototype,
      name,
      (original) =>
        function (...args) {
          check(state);
          const callback = data(this, 'handle');
          const observed = state.callbacks.get(callback);
          if (observed) observed.calls++;
          else if (
            !state.stackSnapshots?.some((row) => row.layer === this && row.handle === callback)
          )
            refuse(state, 'UNKNOWN_EXECUTED_LAYER');
          return Reflect.apply(original, this, args);
        },
    );
}

async function bounded(state, operation, stage) {
  const remaining = remainingTime(state);
  if (remaining <= 0) refuse(state, 'DEADLINE');
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          state.failure ??= 'DEADLINE';
          const error = new Error('Reference lifecycle deadline expired');
          error.code = `HTTP_REFERENCE_LIFECYCLE_${stage}_DEADLINE`;
          reject(error);
        }, remaining);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function request(state, target, path) {
  return new Promise((accept, reject) => {
    const request = http.request(
      { host: target.host, port: target.port, method: 'GET', path, agent: false },
      (response) => {
        const chunks = [];
        let length = 0;
        response.on('data', (chunk) => {
          length += chunk.length;
          if (length > requestLimit) {
            state.failure ??= 'RESPONSE_BOUND';
            response.destroy();
            request.destroy();
          } else chunks.push(chunk);
        });
        response.once('error', reject);
        response.once('end', () => {
          try {
            check(state);
            if (!response.complete || response.statusCode !== (path === '/healthz' ? 200 : 401))
              refuse(state, 'RESPONSE_STATUS');
            const headers = response.headers;
            if (
              headers['x-content-type-options'] !== 'nosniff' ||
              headers['x-frame-options'] !== 'DENY' ||
              headers['referrer-policy'] !== 'no-referrer'
            )
              refuse(state, 'SECURITY_HEADERS');
            const body = Buffer.concat(chunks);
            accept({
              path,
              status: response.statusCode,
              byteLength: body.length,
              bodySha256: digest(body),
              headersSha256: sha(headers),
              securityHeadersObserved: true,
              principalInjected: false,
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.once('error', reject);
    request.setTimeout(5000, () =>
      request.destroy(new Error('Fixed diagnostic request timed out')),
    );
    request.end();
  });
}

// Fixed preparation requests through the actual owned listener and transport.
// Credentials exist only transiently here; observations retain fingerprints,
// never bearer/refresh tokens or arbitrary response bodies.
function openOriginalPreparationJournal(state) {
  const directory = dirname(state.job.descriptorPath);
  const expected = resolve(directory, `${state.job.nonce}.original-body.json`);
  const stat = lstatSync(directory, { bigint: true });
  if (
    state.job.observationArtifactPath !== expected ||
    realpathSync(directory) !== directory ||
    !stat.isDirectory() ||
    (stat.mode & 0o7777n) !== 0o700n ||
    typeof process.getuid !== 'function' ||
    stat.uid !== BigInt(process.getuid()) ||
    !Number.isInteger(constants.O_NOFOLLOW)
  )
    refuse(state, 'ORIGINAL_JOURNAL_DIRECTORY');
  const path = `${expected}.preparation.jsonl`;
  const parts = directory.split(sep).filter(Boolean);
  if (parts.length > 64) refuse(state, 'ORIGINAL_JOURNAL_DIRECTORY_BOUND');
  const chain = [];
  let parent = sep;
  for (const part of [null, ...parts]) {
    if (part !== null) parent = resolve(parent, part);
    const identity = lstatSync(parent, { bigint: true });
    if (!identity.isDirectory() || realpathSync(parent) !== parent)
      refuse(state, 'ORIGINAL_JOURNAL_DIRECTORY');
    chain.push({ path: parent, identity });
  }
  const descriptor = openSync(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  state.preparationJournal = {
    descriptor,
    path,
    directory,
    directoryStat: stat,
    chain,
    length: 0,
    sequence: 0,
  };
  state.preparationJournal.hash = createHash('sha256');
  state.preparationJournal.identity = fstatSync(descriptor, { bigint: true });
  appendOriginalPreparationJournal(state, {
    event: 'preparation-open',
    candidateCommit: state.job.candidateCommit,
    tree: state.job.tree,
    nonce: state.job.nonce,
    originalScenario: state.job.originalScenario,
  });
  let parentDescriptor;
  try {
    parentDescriptor = openSync(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(parentDescriptor, { bigint: true });
    if (!['dev', 'ino', 'mode', 'uid', 'gid'].every((key) => opened[key] === stat[key]))
      refuse(state, 'ORIGINAL_JOURNAL_DIRECTORY');
    fsyncSync(parentDescriptor);
    checkOriginalPreparationJournal(state);
  } finally {
    if (parentDescriptor !== undefined) closeSync(parentDescriptor);
  }
}
function checkOriginalPreparationJournal(state) {
  const journal = state.preparationJournal;
  const current = fstatSync(journal.descriptor, { bigint: true });
  const path = lstatSync(journal.path, { bigint: true });
  const directory = lstatSync(journal.directory, { bigint: true });
  for (const entry of journal.chain) {
    const identity = lstatSync(entry.path, { bigint: true });
    if (
      !identity.isDirectory() ||
      !['dev', 'ino', 'mode', 'uid', 'gid'].every((key) => identity[key] === entry.identity[key]) ||
      realpathSync(entry.path) !== entry.path
    )
      refuse(state, 'ORIGINAL_JOURNAL_DIRECTORY_CHAIN');
  }
  if (
    !current.isFile() ||
    current.nlink !== 1n ||
    (current.mode & 0o7777n) !== 0o600n ||
    current.size !== BigInt(journal.length) ||
    realpathSync(journal.path) !== journal.path ||
    !['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].every(
      (key) => current[key] === journal.identity[key] && current[key] === path[key],
    ) ||
    !['dev', 'ino', 'mode', 'uid', 'gid'].every(
      (key) => directory[key] === journal.directoryStat[key],
    ) ||
    realpathSync(journal.directory) !== journal.directory
  )
    refuse(state, 'ORIGINAL_JOURNAL_IDENTITY');
}
function appendOriginalPreparationJournal(state, event) {
  const journal = state.preparationJournal;
  checkOriginalPreparationJournal(state);
  const bytes = Buffer.from(`${json({ sequence: journal.sequence + 1, ...event })}\n`);
  if (bytes.length > 4096 || journal.length + bytes.length > 64 * 1024)
    refuse(state, 'ORIGINAL_JOURNAL_BOUND');
  let written = 0;
  while (written < bytes.length) {
    const count = writeSync(journal.descriptor, bytes, written, bytes.length - written);
    if (!count) refuse(state, 'ORIGINAL_JOURNAL_WRITE');
    written += count;
  }
  journal.length += written;
  journal.sequence += 1;
  journal.hash.update(bytes);
  journal.identity = fstatSync(journal.descriptor, { bigint: true });
  checkOriginalPreparationJournal(state);
  fsyncSync(journal.descriptor);
  checkOriginalPreparationJournal(state);
}
function closeOriginalPreparationJournal(state) {
  const journal = state.preparationJournal;
  if (!journal || journal.closed) return;
  let failure;
  try {
    checkOriginalPreparationJournal(state);
  } catch (error) {
    failure = error;
  }
  // Even failed/partial appends must receive a real durability attempt. Never
  // adopt changed bytes or reset the sticky refusal after that attempt.
  try {
    fsyncSync(journal.descriptor);
  } catch (error) {
    failure ??= error;
  }
  try {
    checkOriginalPreparationJournal(state);
  } catch (error) {
    failure ??= error;
  }
  try {
    closeSync(journal.descriptor);
    journal.closed = true;
  } catch (error) {
    failure ??= error;
  }
  if (failure) throw failure;
}
async function originalRequest(state, target, method, path, status, body, token) {
  check(state);
  appendOriginalPreparationJournal(state, { event: 'request-begin', method, path });
  const payload = body === undefined ? undefined : Buffer.from(json(body));
  const raw = await bounded(
    state,
    new Promise((accept, reject) => {
      let timer;
      const req = http.request(
        {
          host: target.host,
          port: target.port,
          method,
          path,
          agent: false,
          headers: {
            ...(payload
              ? { 'content-type': 'application/json', 'content-length': String(payload.length) }
              : {}),
            ...(token
              ? {
                  authorization: `Bearer ${token}`,
                  'x-tenant-id': '01978f4a-32bf-7c27-a131-fd73a9e001a1',
                }
              : {}),
          },
        },
        (response) => {
          const chunks = [];
          let length = 0;
          response.on('data', (chunk) => {
            length += chunk.length;
            if (length > requestLimit) {
              state.failure ??= 'ORIGINAL_RESPONSE_BOUND';
              req.destroy(new Error('Original preparation response bound'));
              response.destroy();
            } else chunks.push(chunk);
          });
          response.once('error', reject);
          response.once('aborted', () =>
            reject(new Error('Original preparation response aborted')),
          );
          response.once('end', () => {
            try {
              check(state);
              const bytes = Buffer.concat(chunks, length);
              appendOriginalPreparationJournal(state, {
                event: 'response-end',
                method,
                path,
                status: response.statusCode,
                complete: response.complete,
                byteLength: bytes.length,
                bodySha256: digest(bytes),
                headersSha256: sha(response.headers),
              });
              if (!response.complete || response.statusCode !== status)
                refuse(state, 'ORIGINAL_RESPONSE_STATUS');
              const headers = response.headers;
              if (
                headers['x-content-type-options'] !== 'nosniff' ||
                headers['x-frame-options'] !== 'DENY' ||
                headers['referrer-policy'] !== 'no-referrer'
              )
                refuse(state, 'ORIGINAL_SECURITY_HEADERS');
              accept({
                bytes,
                evidence: {
                  method,
                  path,
                  status: response.statusCode,
                  byteLength: bytes.length,
                  bodySha256: digest(bytes),
                  headersSha256: sha(headers),
                  securityHeadersObserved: true,
                  principalInjected: false,
                  actualBearerUsed: !!token,
                },
              });
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      req.once('error', reject);
      req.once('close', () => clearTimeout(timer));
      timer = setTimeout(
        () => req.destroy(new Error('Original preparation request deadline')),
        5000,
      );
      req.end(payload);
    }),
    'ORIGINAL_REQUEST',
  );
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw.bytes));
  } catch {
    refuse(state, 'ORIGINAL_RESPONSE_JSON');
  }
  finalObjects(state);
  return { parsed, evidence: raw.evidence };
}

async function prepareOriginalScenario(state, target, responses) {
  openOriginalPreparationJournal(state);
  for (const [source, name, methodName, method, path] of [
    [
      'packages/health/src/health.controller.ts',
      'StynxHealthController',
      'liveness',
      'GET',
      '/healthz',
    ],
    [
      'packages/health/src/health.controller.ts',
      'StynxHealthController',
      'readiness',
      'GET',
      '/readyz',
    ],
    [
      'reference/api/src/sample/reference-dev-auth.controller.ts',
      'ReferenceDevAuthController',
      'login',
      'POST',
      '/_reference/dev-login',
    ],
    [
      'reference/api/src/sample/reference-dev-auth.controller.ts',
      'ReferenceDevAuthController',
      'authVerify',
      'GET',
      '/_reference/auth-verify',
    ],
    [
      'packages/preferences/src/preferences.controller.ts',
      'PreferencesController',
      'profile',
      'GET',
      '/profile',
    ],
  ]) {
    const constructor = sourceConstructor(state, source, name);
    const handler = Object.getOwnPropertyDescriptor(constructor.prototype, methodName)?.value;
    const matches = state.routes.filter((row) => row.method === method && row.path === path);
    if (
      matches.length !== 1 ||
      Object.getPrototypeOf(matches[0].wrapper.instance) !== constructor.prototype ||
      matches[0].definition.targetCallback !== handler ||
      matches[0].definition.methodName !== methodName
    )
      refuse(state, 'ORIGINAL_PREPARATION_ROUTE_IDENTITY');
  }
  const get = async (path, status, token) => {
    const response = await originalRequest(state, target, 'GET', path, status, undefined, token);
    responses.push(response.evidence);
    return response.parsed;
  };
  const health = await get('/healthz', 200);
  if (health?.status !== 'ok') refuse(state, 'ORIGINAL_HEALTH');
  const readiness = await get('/readyz', 200);
  if (readiness?.status !== 'ok') refuse(state, 'ORIGINAL_READINESS');
  await get('/profile', 401);
  const tenantId = '01978f4a-32bf-7c27-a131-fd73a9e001a1';
  const email = 'admin@sample-demo.test';
  const login = await originalRequest(state, target, 'POST', '/_reference/dev-login', 201, {
    tenantId,
    email,
  });
  responses.push(login.evidence);
  const session = login.parsed;
  if (
    session?.tenantId !== tenantId ||
    session.email !== email ||
    typeof session.sid !== 'string' ||
    typeof session.accessToken !== 'string' ||
    session.accessToken.length > 16 * 1024 ||
    typeof session.refreshToken !== 'string' ||
    !session.refreshToken ||
    !Array.isArray(session.permissions)
  )
    refuse(state, 'ORIGINAL_SESSION');
  let claims;
  try {
    const parts = session.accessToken.split('.');
    if (parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/u.test(part)))
      refuse(state, 'ORIGINAL_SESSION_FORMAT');
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    refuse(state, 'ORIGINAL_SESSION_FORMAT');
  }
  // Parsing is structural only. The following normal validator and protected
  // controller requests establish actual application acceptance of this token.
  if (claims?.sid !== session.sid || claims.tenantId !== tenantId || typeof claims.sub !== 'string')
    refuse(state, 'ORIGINAL_SESSION_CLAIMS');
  const verified = await get('/_reference/auth-verify', 200, session.accessToken);
  if (verified?.status !== 'ok') refuse(state, 'ORIGINAL_TOKEN_VALIDATION');
  const profile = await get('/profile', 200, session.accessToken);
  if (profile?.subjectId !== claims.sub) refuse(state, 'ORIGINAL_PROTECTED_SUBJECT');
  appendOriginalPreparationJournal(state, {
    event: 'preparation-validated',
    trafficCount: responses.length,
    sqlEffectCount: null,
    objectEffectCount: null,
    parentBusinessEffectVerificationRequired: true,
  });
  return {
    scope: 'actual-original-scenario-preparation',
    scenarioId: state.job.originalScenario.scenarioId,
    profileId: state.job.originalScenario.profileId,
    traffic: responses,
    actualControllerAndHandlerBound: true,
    responseJournal: {
      path: state.preparationJournal.path,
      sha256: state.preparationJournal.hash.copy().digest('hex'),
      byteLength: state.preparationJournal.length,
      permissions: 0o600,
      actualParentArtifactCorroborationRequired: true,
      retainedInPlace: true,
    },
    session: {
      actualDevLogin: true,
      actualJwtValidatorAccepted: true,
      actualProtectedRouteAccepted: true,
      tenantId,
      subjectId: claims.sub,
      sessionIdSha256: digest(session.sid),
      accessTokenSha256: digest(session.accessToken),
      refreshTokenRawRetained: false,
      accessTokenRawRetained: false,
      noForgedPrincipal: true,
      databaseActiveSessionAndPermissionBinding: 'APPLICATION_GUARD_PATH_ONLY',
    },
    sqlEffectCount: null,
    objectEffectCount: null,
    businessEffectVerification: 'UNVERIFIED_REQUIRES_PARENT_FULL_VISIBILITY_RECONCILIATION',
    runtimeAdmission: false,
    performanceQualified: false,
    readinessPromoting: false,
  };
}

function capturePrivacyOptions(state) {
  if (state.job.compositionId !== 'privacy') return;
  const serviceConstructor = sourceConstructor(
    state,
    'packages/privacy/src/privacy.service.ts',
    'PrivacyService',
  );
  const storeConstructor = sourceConstructor(
    state,
    'packages/privacy/src/privacy-object-store.service.ts',
    'PrivacyObjectStoreService',
  );
  const service = publicOperation(state, 'get', [serviceConstructor]);
  const store = publicOperation(state, 'get', [storeConstructor]);
  const options = data(service, 'options');
  if (
    !options ||
    types.isProxy(options) ||
    Object.getPrototypeOf(options) !== Object.prototype ||
    data(store, 'options') !== options ||
    typeof data(options, 'erasureSalt') !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(data(options, 'erasureSalt')) ||
    data(options, 'endpoint') !== process.env.STYNX_STORAGE_ENDPOINT ||
    data(options, 'bucketName') !== process.env.STYNX_PRIVACY_BUCKET
  ) {
    refuse(state, 'PRIVACY_OPTIONS_IDENTITY');
  }
  optionSnapshot(state, options);
  state.privacyOptions = {
    service,
    store,
    options,
    saltSha256: digest(data(options, 'erasureSalt')),
  };
}

function captureObjectStoreClients(state) {
  const privacyComposition = state.job.compositionId === 'privacy';
  const originalUpload =
    state.job.mode === 'http-original-scenario' &&
    state.job.originalScenario?.scenarioId === 'upload';
  if (!privacyComposition && !originalUpload) return;
  const fixture = state.job.referenceFixture.objectStore;
  if (
    !fixture ||
    fixture.endpoint !== process.env.STYNX_STORAGE_ENDPOINT ||
    fixture.storageBucket !== process.env.STYNX_STORAGE_BUCKET ||
    (privacyComposition && fixture.privacyBucket !== process.env.STYNX_PRIVACY_BUCKET) ||
    (originalUpload &&
      (state.job.compositionId !== 'reference' ||
        process.env.STYNX_STORAGE_FORCE_PATH_STYLE !== 'true'))
  )
    refuse(state, 'SDK_FIXTURE');
  const storageConstructor = sourceConstructor(
    state,
    'packages/storage/src/s3.service.ts',
    'S3Service',
  );
  const objectStoreConstructor = privacyComposition
    ? sourceConstructor(state, 'packages/storage/src/object-store.service.ts', 'StynxObjectStore')
    : null;
  const storage = publicOperation(state, 'get', [storageConstructor]);
  const privacy = state.privacyOptions?.store;
  const objectStore = privacyComposition ? data(privacy, 'objectStore') : null;
  if (
    Object.getPrototypeOf(storage) !== storageConstructor.prototype ||
    (privacyComposition &&
      (!objectStore || Object.getPrototypeOf(objectStore) !== objectStoreConstructor.prototype)) ||
    data(storage, 'bucketName') !== fixture.storageBucket ||
    (privacyComposition &&
      data(data(objectStore, 'options'), 'bucketName') !== fixture.privacyBucket)
  )
    refuse(state, 'SDK_PROVIDER');
  const storageUnit = state.job.referenceRegistry.units.find(
    (row) => row.source.path === 'packages/storage/src/s3.service.ts',
  );
  const storageRequire = createRequire(resolve(state.job.checkoutRoot, storageUnit.emitted.path));
  const awsPath = storageRequire.resolve('@aws-sdk/client-s3');
  const awsRequire = createRequire(awsPath);
  const origins = [];
  const actualExport = (path, name) => {
    const cached = state.require.cache[path];
    const value = cached?.loaded && Object.getOwnPropertyDescriptor(cached.exports, name)?.value;
    if (typeof value !== 'function' || cached.filename !== path) refuse(state, 'SDK_EXPORT_ORIGIN');
    origins.push({
      exportName: name,
      sourcePathSha256: digest(path),
      sourceSha256: digest(readFileSync(path)),
    });
    return value;
  };
  const clientConstructor = actualExport(awsPath, 'S3Client');
  const handlerConstructor = actualExport(
    awsRequire.resolve('@smithy/node-http-handler'),
    'NodeHttpHandler',
  );
  const protocolPath = awsRequire.resolve('@smithy/core/protocols');
  const requestConstructor = actualExport(protocolPath, 'HttpRequest');
  const buildQueryString = actualExport(protocolPath, 'buildQueryString');
  state.objectStoreClients = [
    {
      kind: 'storage',
      provider: storage,
      providerConstructor: storageConstructor,
      property: 'client',
      client: data(storage, 'client'),
      bucket: fixture.storageBucket,
    },
    ...(privacyComposition
      ? [
          {
            kind: 'privacy',
            provider: objectStore,
            providerConstructor: objectStoreConstructor,
            property: 'client',
            client: data(objectStore, 'client'),
            bucket: fixture.privacyBucket,
          },
        ]
      : []),
  ];
  for (const row of state.objectStoreClients) {
    row.destroy = data(row.client, 'destroy');
    if (
      typeof row.destroy !== 'function' ||
      Object.getPrototypeOf(row.client) !== clientConstructor.prototype
    )
      refuse(state, 'SDK_CLIENT');
    row.observation = bindOwnedReferenceObjectStoreClient(state.networkHandle, {
      kind: row.kind,
      client: row.client,
      bucket: row.bucket,
      clientConstructor,
      handlerConstructor,
      requestConstructor,
      buildQueryString,
      sourceOrigins: origins,
    });
    row.destroy = data(row.client, 'destroy');
  }
}

function captureOfflineInstallation(state) {
  if (!['offlineE6', 'offlineCTG9'].includes(state.job.compositionId)) return;
  const constructor = sourceConstructor(
    state,
    'reference/api/src/performance/offline-storage.ts',
    'OfflinePerformanceStorageInstaller',
  );
  const instance = publicOperation(state, 'get', [constructor]);
  const snapshot = data(instance, 'snapshot');
  if (Object.getPrototypeOf(instance) !== constructor.prototype || typeof snapshot !== 'function')
    refuse(state, 'OFFLINE_INSTALLER_IDENTITY');
  const observation = Reflect.apply(snapshot, instance, []);
  if (
    observation?.scope !== 'fresh-offline-performance-installation' ||
    observation.verification?.supported !== true ||
    !Array.isArray(observation.sourceMigrations) ||
    observation.sourceMigrations.length !== 8 ||
    !Array.isArray(observation.verification.checks) ||
    !observation.verification.checks.length ||
    observation.verification.checks.some((row) => row.status !== 'pass')
  )
    refuse(state, 'OFFLINE_INSTALLER_OBSERVATION');
  state.offlineInstallation = {
    constructor,
    instance,
    snapshot,
    observation,
    sha256: sha(observation),
  };
}

function finalObjects(state) {
  check(state);
  checkOptions(state);
  if (state.offlineInstallation) {
    const row = state.offlineInstallation;
    if (
      Object.getPrototypeOf(row.instance) !== row.constructor.prototype ||
      data(row.instance, 'snapshot') !== row.snapshot ||
      sha(Reflect.apply(row.snapshot, row.instance, [])) !== row.sha256
    )
      refuse(state, 'OFFLINE_INSTALLER_DRIFT');
  }
  for (const row of state.objectStoreClients ?? []) {
    if (
      Object.getPrototypeOf(row.provider) !== row.providerConstructor.prototype ||
      data(row.provider, row.property) !== row.client ||
      data(row.client, 'destroy') !== row.destroy
    )
      refuse(state, 'SDK_PROVIDER_DRIFT');
  }
  for (const row of state.instancePatches)
    if (!isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.instance, 'use'), row.installed))
      refuse(state, 'MIDDLEWARE_DESCRIPTOR_DRIFT');
  for (const row of state.middlewareInstances)
    if (
      Object.getPrototypeOf(row.instance) !== row.prototype ||
      Object.getOwnPropertyDescriptor(row.prototype, 'constructor')?.value !== row.constructor ||
      !isDeepStrictEqual(
        Object.getOwnPropertyDescriptor(row.prototype, 'use'),
        row.prototypeUseDescriptor,
      ) ||
      data(row.instance, 'options') !== row.options ||
      data(row.options, 'setup') !== row.installedSetup
    )
      refuse(state, 'MIDDLEWARE_INSTANCE_DRIFT');
  if (state.privacyOptions) {
    const row = state.privacyOptions;
    if (
      state.job.compositionId !== 'privacy' ||
      data(row.service, 'options') !== row.options ||
      data(row.store, 'options') !== row.options ||
      digest(data(row.options, 'erasureSalt')) !== row.saltSha256
    )
      refuse(state, 'PRIVACY_OPTIONS_DRIFT');
  }
  if (
    state.job.compositionId !== 'privacy' &&
    state.middlewareInstances.some((row) => row.kind === 'privacy-http-context')
  )
    refuse(state, 'PRIVACY_MIDDLEWARE_ROOT');
  observeReferenceNestGuard(state.nestGuard);
  for (const route of state.routes) {
    const module = publicOperation(state, 'get', [state.ModulesContainer]).get(route.moduleKey);
    if (
      !module ||
      ![...module.controllers.values()].includes(route.wrapper) ||
      data(route.wrapper.instance, route.definition.methodName) !== route.definition.targetCallback
    )
      refuse(state, 'ROUTE_CONTROLLER_POPULATION');
  }
  if (state.adapter.onRequestHook || state.adapter.onResponseHook)
    refuse(state, 'ADAPTER_HOOK_SUBSTITUTION');
  return {
    layers: snapshotStack(state),
    registry: observeReferenceRegistry(state.registry),
    network: observeOwnedReferenceNetwork(state.networkHandle),
  };
}

function restore(state) {
  state.closed = true;
  for (const row of state.instancePatches.slice().reverse()) {
    if (!isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.instance, 'use'), row.installed)) {
      state.failure ??= 'MIDDLEWARE_RESTORATION';
      continue;
    }
    try {
      if (row.original) Object.defineProperty(row.instance, 'use', row.original);
      else delete row.instance.use;
    } catch {
      state.failure ??= 'MIDDLEWARE_RESTORATION';
    }
  }
  for (const row of state.patches.slice().reverse()) {
    if (!isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.object, row.key), row.installed)) {
      state.failure ??= 'RESTORATION_DRIFT';
      continue;
    }
    try {
      Object.defineProperty(row.object, row.key, row.original);
    } catch {
      state.failure ??= 'RESTORATION_DRIFT';
    }
  }
  for (const row of state.instancePatches)
    if (!isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.instance, 'use'), row.original))
      state.failure ??= 'MIDDLEWARE_RESTORATION';
  for (const row of state.patches)
    if (!isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.object, row.key), row.original))
      state.failure ??= 'RESTORATION_DRIFT';
  if (state.nestGuard) {
    try {
      restoreReferenceNestGuard(state.nestGuard);
    } catch {
      state.cleanupIncomplete = true;
      state.failure ??= 'CLEANUP_INCOMPLETE';
    }
  }
  active = state.cleanupIncomplete ? state : undefined;
}

/** Invoke only the actual bound reference factory; no caller factory, URL or hook. */
export async function observeOwnedReferenceLoopback(
  job,
  networkHandle,
  channelHandle,
  nestPreparation,
) {
  if (arguments.length !== 4 || job?.mode !== 'reference-owned-loopback') refuse({}, 'JOB');
  return executeReferenceLifecycle(job, networkHandle, channelHandle, nestPreparation, false);
}

/** Disjoint persistent mode, only entered by the fixed supervised worker. */
export async function observeOwnedHttpQualification(
  job,
  networkHandle,
  channelHandle,
  nestPreparation,
) {
  if (arguments.length !== 4 || job?.mode !== 'http-endpoint-qualification') refuse({}, 'JOB');
  return executeReferenceLifecycle(job, networkHandle, channelHandle, nestPreparation, true);
}

/** Disjoint original scenario mode, with the unchanged profile and real auth. */
export async function observeOwnedHttpOriginalScenario(
  job,
  networkHandle,
  channelHandle,
  nestPreparation,
) {
  if (arguments.length !== 4 || job?.mode !== 'http-original-scenario') refuse({}, 'JOB');
  return executeReferenceLifecycle(job, networkHandle, channelHandle, nestPreparation, false, true);
}

async function executeReferenceLifecycle(
  job,
  networkHandle,
  channelHandle,
  nestPreparation,
  qualification,
  original = false,
) {
  const persistent = qualification || original;
  const qualificationWire = qualification
    ? await import('./http-qualification-protocol.mjs')
    : original
      ? await import('./http-original-protocol.mjs')
      : null;
  const recipes = qualification ? await import('./http-qualification-liveness.mjs') : null;
  const exchangeApi = qualification
    ? await import('./http-qualification-exchange.mjs')
    : original
      ? await import('./http-original-exchange.mjs')
      : null;
  const originalProfile = original
    ? (await import('./http-original-scenarios.mjs')).httpOriginalScenarioProfile({
        scenarioId: job.originalScenario?.scenarioId,
        profileId: job.originalScenario?.profileId,
      })
    : null;
  const state = {
    job,
    networkHandle,
    channelHandle,
    nestPreparation,
    patches: [],
    instancePatches: [],
    middlewareInstances: [],
    optionSnapshots: [],
    callbacks: new Map(),
    routes: [],
    initial: [],
    deadline: Date.now() + deadlineMs,
    ...(original ? { monotonicDeadline: monotonicNow() + BigInt(deadlineMs) * 1_000_000n } : {}),
    phases: [],
    failure: undefined,
    closed: false,
    app: undefined,
    retainedApps: [],
    closedApps: new Set(),
    appClosed: false,
  };
  if (
    arguments.length !== (original ? 6 : 5) ||
    active ||
    job?.mode !==
      (qualification
        ? 'http-endpoint-qualification'
        : original
          ? 'http-original-scenario'
          : 'reference-owned-loopback') ||
    (original && job.compositionId !== 'reference') ||
    !isHttpComposition(job.compositionId) ||
    job.referenceRegistry?.candidateCommit !== job.candidateCommit ||
    job.referenceRegistry?.tree !== job.tree ||
    job.referenceFixture?.identity?.candidateCommit !== job.candidateCommit ||
    job.referenceFixture?.identity?.tree !== job.tree ||
    job.referenceFixture?.identity?.nonce !== job.nonce ||
    !job.referenceFixture.environment ||
    (original &&
      originalProfile.scenarioId === 'upload' &&
      (!job.referenceFixture.objectStore ||
        job.referenceFixture.objectStore.endpoint !== process.env.STYNX_STORAGE_ENDPOINT ||
        job.referenceFixture.objectStore.storageBucket !== process.env.STYNX_STORAGE_BUCKET ||
        process.env.STYNX_STORAGE_FORCE_PATH_STYLE !== 'true')) ||
    process.versions.node !== '24.20.0'
  )
    refuse(state, 'JOB');
  for (const [name, expected] of Object.entries(job.referenceFixture.environment))
    if (typeof process.env[name] !== 'string' || digest(process.env[name]) !== expected)
      refuse(state, 'FIXTURE_ENVIRONMENT');
  // The opaque network handle must name an actually installed guard. Scalar job
  // data and this observation still cannot authenticate the live parent fixture.
  observeOwnedReferenceNetwork(networkHandle);
  if (qualification) qualificationWire.assertHttpQualificationChannel(channelHandle, job);
  else if (original) qualificationWire.assertHttpOriginalChannel(channelHandle, job);
  else assertReferenceLifecycleChannel(channelHandle, job);
  const declaration = qualification
    ? recipes.readWorkerLivenessQualificationDeclaration(job)
    : null;
  const exchange = qualification
    ? exchangeApi.openHttpQualificationParentExchange(job)
    : original
      ? exchangeApi.openHttpOriginalParentExchange(job)
      : null;
  active = state;
  const phase = async (body) => {
    if (persistent) {
      const { phase: name, ...payload } = body;
      if (original)
        await qualificationWire.emitHttpOriginalPhase(state.channelHandle, name, payload);
      else await qualificationWire.emitHttpQualificationPhase(state.channelHandle, name, payload);
    } else await emitReferenceLifecyclePhase(state.channelHandle, body);
    state.phases.push(body);
  };
  let result;
  try {
    const bootstrap = await observeReferenceBootstrapModule(job);
    const moduleURL = pathToFileURL(resolve(job.checkoutRoot, job.bootstrap.emitted.path)).href;
    state.moduleURL = moduleURL;
    state.require = createRequire(moduleURL); // already-evaluated actual bootstrap origin
    const namespace = await import(moduleURL);
    const factory = Object.getOwnPropertyDescriptor(namespace, 'createReferenceApplication')?.value;
    if (typeof factory !== 'function' || namespace.default?.createReferenceApplication !== factory)
      refuse(state, 'FACTORY_EXPORT');
    const factoryDescriptors = Object.getOwnPropertyDescriptors(factory);
    const appModule = resolve(
      job.checkoutRoot,
      httpComposition(job.compositionId).emittedRootModule,
    );
    const securityModule = resolve(
      job.checkoutRoot,
      'reference/api/dist/reference/api/src/security-headers.js',
    );
    if (state.require.cache[appModule] || state.require.cache[securityModule])
      refuse(state, 'PREIMPORTED_PRODUCT');
    install(state);
    let returned;
    let endingError;
    beginReferenceNestCreation(state.nestGuard);
    try {
      // Retain the actual outer factory Promise too: it can remain pending
      // before Nest's public create is entered. Never restore over that work.
      const promise = Reflect.apply(factory, undefined, [
        {
          onNestCreated(app) {
            if (!state.retainedApps.includes(app)) state.retainedApps.push(app);
            check(state);
            if (state.app || !state.adapter) refuse(state, 'APP_IDENTITY');
            acceptReferenceNestApplication(state.nestGuard, app);
            state.app = app;
            if (publicOperation(state, 'getHttpAdapter', []) !== state.adapter)
              refuse(state, 'APP_IDENTITY');
          },
        },
      ]);
      state.factoryPromise = promise;
      if (!types.isPromise(promise) || types.isProxy(promise)) {
        state.cleanupIncomplete = true;
        refuse(state, 'FACTORY_PROMISE');
      }
      state.factoryPending = true;
      promise.then(
        () => {
          state.factoryPending = false;
        },
        () => {
          state.factoryPending = false;
        },
      );
      returned = await bounded(state, promise, 'FACTORY');
    } finally {
      if (state.factoryPending) state.cleanupIncomplete = true;
      else {
        try {
          endReferenceNestCreation(state.nestGuard);
        } catch (error) {
          // Preserve the original failure while retaining the guard refusal.
          endingError = error;
        }
      }
    }
    if (endingError) throw endingError;
    if (
      !state.app ||
      returned !== state.app ||
      !isDeepStrictEqual(Object.getOwnPropertyDescriptors(factory), factoryDescriptors) ||
      namespace.createReferenceApplication !== factory ||
      namespace.default.createReferenceApplication !== factory
    )
      refuse(state, 'FACTORY_IDENTITY');
    await phase({
      phase: 'factory',
      actualFactoryInvoked: true,
      actualAdapterCount: 1,
      appRetainedBeforeFactoryReturn: true,
    });
    await bounded(state, publicOperation(state, 'init', []), 'INIT');
    capturePrivacyOptions(state);
    captureObjectStoreClients(state);
    captureOfflineInstallation(state);
    state.registry = observeReferenceRegistryObjects(
      job,
      publicOperation(state, 'get', [state.ModulesContainer]),
    );
    const initial = finalObjects(state);
    await phase({
      phase: 'init',
      layerCount: initial.layers.length,
      controllerCount: initial.registry.controllers.length,
      routeCount: state.routes.length,
      ...(persistent ? { runtimeObjectSnapshotSha256: sha(initial) } : {}),
    });
    await bounded(state, publicOperation(state, 'listen', [0, '127.0.0.1']), 'LISTEN');
    const target = bindOwnedReferenceListener(
      networkHandle,
      publicOperation(state, 'getHttpServer', []),
    );
    await phase({ phase: 'listen', host: target.host, port: target.port });
    const responses = [];
    let preparation;
    let measurement;
    if (qualification) {
      state.deadline = Date.now() + 180_000;
      const constructor = sourceConstructor(
        state,
        declaration.binding.operation.file,
        'StynxHealthController',
      );
      const handler = Object.getOwnPropertyDescriptor(constructor.prototype, 'liveness')?.value;
      const matches = state.routes.filter((row) => row.method === 'GET' && row.path === '/healthz');
      if (
        matches.length !== 1 ||
        Object.getPrototypeOf(matches[0].wrapper.instance) !== constructor.prototype ||
        matches[0].definition.targetCallback !== handler ||
        matches[0].definition.methodName !== 'liveness'
      )
        refuse(state, 'QUALIFICATION_ROUTE_IDENTITY');
      // Exact actual metadata: no health handler/class rate-limit or audit
      // annotation may be silently replaced with a guessed quota/effect model.
      const rateLimitKey = state.require('@stynx-nyx/ratelimit').STYNX_RATE_LIMIT_ROUTE;
      const auditKey = state.require('@stynx-nyx/backend').STYNX_AUDIT_METADATA;
      if (
        typeof rateLimitKey !== 'symbol' ||
        typeof auditKey !== 'symbol' ||
        [constructor, handler].some(
          (value) =>
            Reflect.getMetadata(rateLimitKey, value) !== undefined ||
            Reflect.getMetadata(auditKey, value) !== undefined,
        )
      )
        refuse(state, 'QUALIFICATION_METADATA');
      preparation = {
        caseSha256: declaration.caseSha256,
        recipeId: declaration.binding.operation.fixtureRecipeId,
        actualControllerAndHandlerBound: true,
        route: { method: matches[0].method, path: matches[0].path },
        setupTrafficCount: 0,
        sqlEffectCount: 0,
        objectEffectCount: 0,
        session: { requiredByActualHandler: false, credentialsCreated: false },
        effectiveRateLimitMetadata: null,
        effectiveAuditMetadata: null,
        businessEffectVerification: 'PENDING_PARENT_FULL_VISIBILITY_RECONCILIATION',
      };
      await phase({
        phase: 'preparation-complete',
        caseSha256: declaration.caseSha256,
        evidenceSha256: sha(preparation),
        trafficCount: 0,
        sqlEffectCount: 0,
        objectEffectCount: 0,
      });
      const begin = exchangeApi.waitHttpQualificationParentCommand(exchange, 'begin-measurement');
      // Phase emission is asynchronous; retain early exchange rejection until
      // the original promise is awaited without creating an unhandled rejection.
      void begin.catch(() => {});
      await phase({
        phase: 'ready',
        host: target.host,
        port: target.port,
        caseSha256: declaration.caseSha256,
        manifestSha256: declaration.manifestSha256,
        preparationEvidenceSha256: sha(preparation),
        sessionEvidenceSha256: sha(preparation.session),
      });
      const beginBody = await bounded(state, begin, 'PARENT_BEGIN');
      state.deadline = Date.now() + 330_000;
      const finish = exchangeApi.waitHttpQualificationParentCommand(exchange, 'finish-measurement');
      void finish.catch(() => {});
      await phase({ phase: 'measurement-start', ...beginBody });
      measurement = await bounded(state, finish, 'PARENT_MEASUREMENT');
      await phase({ phase: 'measurement-complete', ...measurement });
      finalObjects(state);
      state.deadline = Date.now() + 30_000;
    } else if (original) {
      setLifecycleDeadline(state, 180_000);
      preparation = await prepareOriginalScenario(state, target, responses);
      await phase({
        phase: 'preparation-complete',
        profileSha256: job.originalScenario.profileSha256,
        evidenceSha256: sha(preparation),
        trafficCount: responses.length,
        sqlEffectCount: null,
        objectEffectCount: null,
      });
      const begin = exchangeApi.waitHttpOriginalParentCommand(exchange, 'begin-measurement');
      void begin.catch(() => {});
      await phase({
        phase: 'ready',
        host: target.host,
        port: target.port,
        profileSha256: job.originalScenario.profileSha256,
        manifestSha256: job.originalScenario.manifestSha256,
        preparationEvidenceSha256: sha(preparation),
        sessionEvidenceSha256: sha(preparation.session),
      });
      const beginBody = await bounded(state, begin, 'ORIGINAL_PARENT_BEGIN');
      setLifecycleDeadline(state, (originalProfile.nominalProfile.durationSeconds + 60) * 1000);
      const finish = exchangeApi.waitHttpOriginalParentCommand(exchange, 'finish-measurement');
      void finish.catch(() => {});
      await phase({ phase: 'measurement-start', ...beginBody });
      measurement = await bounded(state, finish, 'ORIGINAL_PARENT_MEASUREMENT');
      await phase({ phase: 'measurement-complete', ...measurement });
      finalObjects(state);
      setLifecycleDeadline(state, 30_000);
    } else {
      for (const path of ['/healthz', '/profile']) {
        responses.push(await bounded(state, request(state, target, path), 'REQUEST'));
        await phase({ phase: path === '/healthz' ? 'healthz' : 'profile', ...responses.at(-1) });
        finalObjects(state);
      }
    }
    await bounded(state, closeApplication(state, false), 'CLOSE');
    state.appClosed = true;
    state.closedApps.add(state.app);
    // A destroy request is not a socket close. Give owned asynchronous close
    // events a bounded opportunity, retaining all guards throughout the wait.
    const drainDeadline = original
      ? monotonicNow() + 1_000_000_000n
      : Math.min(state.deadline, Date.now() + 1000);
    let final;
    do {
      final = finalObjects(state);
      if (final.network.openSocketCount === 0 && final.network.listenerClosed) break;
      await new Promise((accept) => setTimeout(accept, 5));
    } while (
      original
        ? remainingTime(state) > 0 && monotonicNow() < drainDeadline
        : Date.now() < drainDeadline
    );
    if (final.network.openSocketCount !== 0 || !final.network.listenerClosed)
      refuse(state, 'CLEANUP_INCOMPLETE');
    await phase({
      phase: 'close',
      actualAppCloseResolved: true,
      ownedSocketCloseEventsComplete: true,
      ...(persistent
        ? {
            listenerClosed: final.network.listenerClosed,
            openSocketCount: final.network.openSocketCount,
            clientDisposalEvidenceSha256: sha({
              network: final.network,
              providers: state.objectStoreClients?.map((row) => row.observation) ?? [],
            }),
          }
        : {}),
    });
    if (persistent) setLifecycleDeadline(state, 30_000);
    result = {
      schemaVersion: 1,
      scope: job.mode,
      compositionId: job.compositionId,
      bootstrap,
      phases: state.phases,
      layers: final.layers,
      registry: final.registry,
      network: final.network,
      responses,
      ...(persistent ? { preparation, measurement, initialObjectSnapshot: initial } : {}),
      privacyOptions: state.privacyOptions
        ? {
            actualSharedOptionsIdentityObserved: true,
            saltByteLength: 32,
            saltSha256: state.privacyOptions.saltSha256,
            saltRawRetainedInReport: false,
          }
        : null,
      objectStoreClients: state.objectStoreClients?.map((row) => row.observation) ?? null,
      offlineInstallation: state.offlineInstallation?.observation ?? null,
      middlewareInstances: state.middlewareInstances.map((row, index) => ({
        instanceId: index + 1,
        kind: row.kind,
        calls: row.calls,
        setupFunctionIdentityObserved: typeof row.setup === 'function',
        setupCallCount: row.setupCalls,
        setupDeclarationCorrespondence: 'UNVERIFIED',
        setupDeclarationProvenance: 'UNVERIFIED',
      })),
      callbacks: [...state.callbacks.values()].map((row) => ({
        id: row.id,
        kind: row.kind,
        configuration: row.configuration,
        calls: row.calls,
      })),
      parentCorroborationRequired: true,
      complete: false,
      constructorEffectsBeforeNestCreated: 'NETWORK_OBSERVER_ONLY',
      nestAppLink: (() => {
        const guard = observeReferenceNestGuard(state.nestGuard);
        return {
          provenance: guard.provenance,
          sourceSha256: guard.sourceSha256,
          preparation: guard.preparation,
          rawFirstPublicIdentityObserved: guard.rawFirstPublicIdentityObserved,
          publicOperations: guard.publicOperations,
          closeKind: guard.closeKind,
          closeResolved: guard.closeResolved,
        };
      })(),
      nativeSdkClientDisposal: 'UNVERIFIED',
      sourceMapFunctionCorrespondence: 'UNVERIFIED',
      middleware: 'PENDING_INDEPENDENT_ACCEPTANCE',
      blockedOn: [
        'full-disjoint-worker-startup-and-module-custody',
        'constructor-side-effect-source-closure',
        'cls-setup-source-declaration',
        'sdk-client-disposal',
        'generated-session-public-fingerprint',
        'authenticated-tenant-and-sql-isolation',
        'five-other-compositions',
        ...(original
          ? ['original-native-execution-and-business-effects-proof']
          : ['600-request-performance-profile']),
      ],
      runtimeCustodyComplete: false,
      performanceQualified: false,
      readinessPromoting: false,
    };
  } catch (error) {
    state.failure ??= 'OPERATION_REFUSED';
    if (
      state.nestGuard &&
      snapshotReferenceNestGuard(state.nestGuard).rawAcquired &&
      !state.appClosed
    ) {
      // Reuse an in-flight public close promise; never race it with raw close.
      // The raw descriptor/receiver is failure-only fallback before any attempt.
      try {
        if (original) setLifecycleDeadline(state, Math.max(5000, Math.ceil(remainingTime(state))));
        else state.deadline = Math.max(state.deadline, Date.now() + 5000);
        await bounded(state, closeApplication(state, true), 'FAILED_CLOSE');
        state.appClosed = true;
        for (const app of state.retainedApps)
          if (referenceNestApplicationClosed(state.nestGuard, app)) state.closedApps.add(app);
      } catch {
        state.cleanupIncomplete = true;
      }
    }
    throw error;
  } finally {
    // Restore observer descriptors after the bounded shutdown attempt on every
    // path. The separately owned network guard remains installed. Unknown app
    // cleanup is a sticky refusal and prevents reuse of this worker scope.
    if (original) {
      try {
        closeOriginalPreparationJournal(state);
      } catch {
        state.cleanupIncomplete = true;
        state.failure ??= 'ORIGINAL_JOURNAL_CLOSE';
      }
    }
    if (
      (!state.appClosed && state.adapter) ||
      state.retainedApps.some((app) => !state.closedApps.has(app))
    )
      state.cleanupIncomplete = true;
    restore(state);
    if (exchange) {
      const exchangeClosure = original
        ? exchangeApi.closeHttpOriginalParentExchange(exchange)
        : exchangeApi.closeHttpQualificationParentExchange(exchange);
      if (!exchangeClosure.complete)
        state.failure ??= original
          ? 'ORIGINAL_EXCHANGE_INCOMPLETE'
          : 'QUALIFICATION_EXCHANGE_INCOMPLETE';
    }
    if (state.cleanupIncomplete) active = state;
  }
  if (state.failure || state.cleanupIncomplete)
    refuse(state, state.failure ?? 'CLEANUP_INCOMPLETE');
  await phase(
    persistent
      ? {
          phase: 'final',
          runtimeEvidenceSha256: sha(result),
          sourceEvidenceSha256: sha(job.controls),
          fixtureFinalEvidenceSha256: sha({
            scope: 'worker-network-subset',
            network: result.network,
            actualParentFixtureFinalVerification: 'REQUIRED',
          }),
          parentFixtureCleanupRequired: true,
        }
      : {
          phase: 'final',
          descriptorsRestored: true,
          registrySha256: sha(result.registry),
          middlewareSha256: sha({
            layers: result.layers,
            instances: result.middlewareInstances,
            callbacks: result.callbacks,
          }),
          networkSha256: sha(result.network),
        },
  );
  return result;
}
