import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual, types } from 'node:util';

// One production-used installed-implementation observer. It grants no product,
// fixture, transport, provider, process or release authority.
const sessions = new WeakMap();
const preparations = new WeakMap();
let active;
const factorySha256 = '79a2d69a3816102b76a9fbee99c9d9619189cabfb2eb76da1dfa715935cba593';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const methodNames = ['getHttpAdapter', 'getHttpServer', 'get', 'init', 'listen', 'close'];
const faultNames = new Set([
  'FIRST_FORWARD_THROW',
  'SECOND_FORWARD_THROW',
  'CLOSE_THROW',
  'CLOSE_NON_PROMISE',
  'FIRST_ENTRY_DUPLICATE',
  'SECOND_ENTRY_DUPLICATE',
  'SECOND_WITHOUT_FIRST_COMPLETION',
  'SECOND_FOREIGN_PROXY',
  'SECOND_FOREIGN_ADAPTER',
  'FIRST_FOREIGN_RAW',
]);

function injectFault(state, name) {
  if (state.fault !== name || state.faultUsed) return false;
  state.faultUsed = true;
  if (name === 'CLOSE_NON_PROMISE') return true;
  const error = new Error('Explicit installed Nest guard forwarding fault');
  error.code = 'HTTP_REFERENCE_NEST_GUARD_INJECTED';
  throw error;
}

function sourceFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path)
    refuse({}, 'NEST_PRIVATE_IMPLEMENTATION');
  return {
    path,
    sha256: digest(readFileSync(path)),
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mode: stat.mode,
  };
}

function verifyPreparation(preparation, originals) {
  if (preparation.revoked) refuse(preparation, 'NEST_PREPARATION_REVOKED');
  for (const file of preparation.files)
    if (!isDeepStrictEqual(sourceFile(file.path), file))
      refuse(preparation, 'NEST_PRIVATE_IMPLEMENTATION');
  for (const row of preparation.modules) {
    const cached = preparation.require.cache[row.path];
    if (
      cached !== row.module ||
      cached.loaded !== true ||
      cached.exports !== row.exports ||
      Object.getPrototypeOf(cached.exports) !== row.exportPrototype
    )
      refuse(preparation, 'NEST_PREPARATION_DRIFT');
    // During the lease, the lifecycle separately owns the adapter construct
    // export observer. Its original constructor remains retained here.
    if (
      (originals || row.exportName !== 'ExpressAdapter') &&
      !isDeepStrictEqual(Object.getOwnPropertyDescriptors(cached.exports), row.exportDescriptors)
    )
      refuse(preparation, 'NEST_PREPARATION_DRIFT');
  }
  for (const row of preparation.prototypes)
    if (
      Object.getPrototypeOf(row.object) !== row.parent ||
      !isDeepStrictEqual(
        Object.getOwnPropertyDescriptor(row.object, 'constructor'),
        row.constructor,
      )
    )
      refuse(preparation, 'NEST_PREPARATION_DRIFT');
  for (const row of preparation.constructors)
    if (
      Object.getPrototypeOf(row.object) !== row.parent ||
      !isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.object, 'prototype'), row.prototype)
    )
      refuse(preparation, 'NEST_PREPARATION_DRIFT');
  if (Object.getPrototypeOf(preparation.singleton) !== preparation.factoryPrototype)
    refuse(preparation, 'NEST_PREPARATION_DRIFT');
  for (const [name, binding] of preparation.applicationMethods) {
    const current = methodBinding(preparation.applicationPrototype, name);
    if (
      !binding ||
      !current ||
      current.owner !== binding.owner ||
      !isDeepStrictEqual(current.descriptor, binding.descriptor)
    )
      refuse(preparation, 'NEST_PREEXISTING_APPLICATION_METHOD_DRIFT');
  }
  if (originals)
    for (const row of preparation.originalMethods)
      if (
        !isDeepStrictEqual(
          Object.getOwnPropertyDescriptor(preparation.factoryPrototype, row.name),
          row.descriptor,
        ) ||
        !isDeepStrictEqual(
          Object.getOwnPropertyDescriptor(preparation.singleton, row.name),
          row.singletonOwn,
        )
      )
        refuse(preparation, 'NEST_PREEXISTING_METHOD_DRIFT');
}

function preparationProjection(preparation) {
  return {
    originURL: import.meta.url,
    resolutionOriginURL: pathToFileURL(preparation.anchor.path).href,
    provenance: 'FIRST_ORIGINAL_REQUIRE_COMPLETION',
    cacheAbsentBeforeRequire: true,
    files: preparation.files.map((row) => ({
      url: pathToFileURL(row.path).href,
      sha256: row.sha256,
    })),
    modules: preparation.modules.map((row) => ({
      url: pathToFileURL(row.path).href,
      exportName: row.exportName,
      loaded: true,
    })),
    complete: false,
    readinessPromoting: false,
  };
}

/** First load from this evaluated helper; no caller identity or cache reset. */
export function prepareReferenceNestGuard() {
  if (arguments.length !== 0 || active || process.versions.node !== '24.20.0')
    refuse({}, 'NEST_PREPARATION_CONTEXT');
  const anchorPath = fileURLToPath(new URL('../../packages/flow/package.json', import.meta.url));
  const anchor = sourceFile(anchorPath);
  if (
    anchor.sha256 !== '7a9bc69161ab7e2a2c2f1a61e6dd94ee558f1c76b25c3aa48fd564f0e633bbb1' ||
    anchor.size !== 1827
  )
    refuse({}, 'NEST_PREPARATION_ANCHOR');
  const require = createRequire(new URL('../../packages/flow/package.json', import.meta.url));
  const definitions = [
    ['@nestjs/core/nest-factory', 'NestFactory'],
    ['@nestjs/core/nest-application', 'NestApplication'],
    ['@nestjs/platform-express/adapters/express-adapter', 'ExpressAdapter'],
  ];
  // Resolve and check every target before any dependency require.
  const paths = definitions.map(([specifier]) => require.resolve(specifier));
  if (paths.some((path) => require.cache[path] !== undefined))
    refuse({}, 'NEST_PREPARATION_ALREADY_CACHED');
  const manifests = ['@nestjs/core/package.json', '@nestjs/platform-express/package.json'].map(
    (specifier) => require.resolve(specifier),
  );
  const files = [...paths, ...manifests].map(sourceFile);
  files.push(anchor);
  if (
    files[0].sha256 !== factorySha256 ||
    manifests.some((path) => JSON.parse(readFileSync(path, 'utf8')).version !== '11.2.3')
  )
    refuse({}, 'NEST_PRIVATE_IMPLEMENTATION');
  const modules = definitions.map(([specifier, exportName], index) => {
    const exports = require(specifier);
    const module = require.cache[paths[index]];
    if (
      !module ||
      module.loaded !== true ||
      module.exports !== exports ||
      !exports ||
      types.isProxy(exports)
    )
      refuse({}, 'NEST_PREPARATION_COMPLETION');
    return {
      path: paths[index],
      module,
      exports,
      exportName,
      exportPrototype: Object.getPrototypeOf(exports),
      exportDescriptors: Object.getOwnPropertyDescriptors(exports),
    };
  });
  const preparation = {
    require,
    anchor,
    files,
    modules,
    factoryPath: paths[0],
    factoryModule: modules[0].exports,
    applicationModule: modules[1].exports,
    adapterModule: modules[2].exports,
    singleton: modules[0].exports.NestFactory,
    NestApplication: modules[1].exports.NestApplication,
    ExpressAdapter: modules[2].exports.ExpressAdapter,
    leased: false,
    revoked: false,
  };
  if (
    !preparation.singleton ||
    types.isProxy(preparation.singleton) ||
    typeof preparation.NestApplication !== 'function' ||
    types.isProxy(preparation.NestApplication) ||
    typeof preparation.ExpressAdapter !== 'function' ||
    types.isProxy(preparation.ExpressAdapter)
  )
    refuse(preparation, 'NEST_PRIVATE_IMPLEMENTATION');
  preparation.factoryPrototype = Object.getPrototypeOf(preparation.singleton);
  preparation.factoryPrototypeParent = Object.getPrototypeOf(preparation.factoryPrototype);
  preparation.applicationPrototype = preparation.NestApplication.prototype;
  preparation.applicationPrototypeParent = Object.getPrototypeOf(preparation.applicationPrototype);
  preparation.adapterPrototype = preparation.ExpressAdapter.prototype;
  preparation.adapterPrototypeParent = Object.getPrototypeOf(preparation.adapterPrototype);
  preparation.prototypes = [
    preparation.factoryPrototype,
    preparation.applicationPrototype,
    preparation.adapterPrototype,
  ].map((object) => ({
    object,
    parent: Object.getPrototypeOf(object),
    constructor: Object.getOwnPropertyDescriptor(object, 'constructor'),
  }));
  preparation.constructors = [
    data(preparation.factoryPrototype, 'constructor'),
    preparation.NestApplication,
    preparation.ExpressAdapter,
  ].map((object) => ({
    object,
    parent: Object.getPrototypeOf(object),
    prototype: Object.getOwnPropertyDescriptor(object, 'prototype'),
  }));
  preparation.applicationMethods = new Map(
    methodNames.map((name) => [name, methodBinding(preparation.applicationPrototype, name)]),
  );
  preparation.originalMethods = ['create', 'createNestInstance', 'createAdapterProxy'].map(
    (name) => ({
      name,
      descriptor: Object.getOwnPropertyDescriptor(preparation.factoryPrototype, name),
      singletonOwn: Object.getOwnPropertyDescriptor(preparation.singleton, name),
    }),
  );
  if (
    preparation.originalMethods.some(
      (row) =>
        !row.descriptor ||
        !Object.hasOwn(row.descriptor, 'value') ||
        typeof row.descriptor.value !== 'function' ||
        types.isProxy(row.descriptor.value) ||
        row.singletonOwn !== undefined,
    )
  )
    refuse(preparation, 'NEST_PRIVATE_IMPLEMENTATION');
  verifyPreparation(preparation, true);
  const handle = Object.freeze({});
  preparations.set(handle, preparation);
  return handle;
}

/** Scalar evidence cannot mint or replace the private authority. */
export function observeReferenceNestPreparation(handle) {
  const preparation = preparations.get(handle);
  if (arguments.length !== 1 || !preparation) refuse({}, 'NEST_PREPARATION_CONTEXT');
  verifyPreparation(preparation, !preparation.leased);
  return preparationProjection(preparation);
}

function faultEvent(state, name, callback) {
  if (state.fault !== name || state.faultUsed) return;
  state.faultUsed = true;
  state.injectedEvents.push(name);
  callback();
  refuse(state, 'FAULT_EVENT_UNEXPECTED_ACCEPTANCE');
}

function acquireRaw(state, args) {
  if (!state.rawApp && args.length === 1) {
    state.rawApp = args[0];
    if (
      state.rawApp &&
      typeof state.rawApp === 'object' &&
      !types.isProxy(state.rawApp) &&
      Object.getPrototypeOf(state.rawApp) === state.applicationPrototype
    ) {
      state.rawMethods = new Map(methodNames.map((name) => [name, data(state.rawApp, name)]));
      state.rawMethodBindings = new Map(
        methodNames.map((name) => [name, methodBinding(state.rawApp, name)]),
      );
      state.rawValidated = [...state.rawMethods.values()].every(
        (method) => typeof method === 'function',
      );
    }
  }
}

function firstEntry(state, receiver, args) {
  const duplicate = state.firstProxyEntered;
  state.firstProxyEntered = true;
  verify(state);
  if (
    !state.creationScope ||
    receiver !== state.singleton ||
    args.length !== 1 ||
    duplicate ||
    args[0] !== state.rawApp ||
    !state.rawApp ||
    typeof state.rawApp !== 'object' ||
    types.isProxy(state.rawApp) ||
    Object.getPrototypeOf(state.rawApp) !== state.applicationPrototype
  )
    refuse(state, 'RAW_NEST_APPLICATION_LINK');
  if (!state.rawValidated) refuse(state, 'RAW_NEST_APPLICATION_METHOD');
}

function secondEntry(state, receiver, args) {
  const duplicate = state.secondProxyEntered;
  state.secondProxyEntered = true;
  verify(state);
  if (
    !state.creationScope ||
    receiver !== state.singleton ||
    args.length !== 2 ||
    duplicate ||
    !state.firstProxyCompleted ||
    !types.isProxy(state.firstProxy) ||
    !state.adapter ||
    args[0] !== state.firstProxy ||
    args[1] !== state.adapter
  )
    refuse(state, 'PUBLIC_NEST_PROXY_LINK');
}

function refuse(state, reason) {
  state.failure ??= reason;
  const error = new Error('Reference factory lifecycle refused its closed Nest observation');
  // Preserve the existing lifecycle failure identifiers after extraction.
  error.code = `HTTP_REFERENCE_LIFECYCLE_${state.failure}`;
  throw error;
}

function data(object, key) {
  if (!object || types.isProxy(object)) return undefined;
  for (let current = object; current; current = Object.getPrototypeOf(current)) {
    if (types.isProxy(current)) return undefined;
    const row = Object.getOwnPropertyDescriptor(current, key);
    if (row) return Object.hasOwn(row, 'value') ? row.value : undefined;
  }
  return undefined;
}

function methodBinding(object, key) {
  for (let current = object; current; current = Object.getPrototypeOf(current)) {
    if (types.isProxy(current)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) return { owner: current, descriptor };
  }
  return undefined;
}

function stateFor(handle) {
  const state = sessions.get(handle);
  if (!state || state.closed || state !== active)
    throw new Error('Unknown or closed installed Nest guard');
  return state;
}

function verify(state, cleanup = false) {
  try {
    verifyPreparation(state.preparation, false);
  } catch (error) {
    state.failure ??= 'NEST_PREPARATION_DRIFT';
    throw error;
  }
  if (
    digest(readFileSync(state.factoryPath)) !== factorySha256 ||
    realpathSync(state.factoryPath) !== state.factoryPath ||
    state.factoryModule.NestFactory !== state.singleton ||
    Object.getPrototypeOf(state.singleton) !== state.factoryPrototype ||
    Object.getPrototypeOf(state.factoryPrototype) !== state.factoryPrototypeParent ||
    state.applicationModule.NestApplication !== state.NestApplication ||
    state.NestApplication.prototype !== state.applicationPrototype ||
    Object.getPrototypeOf(state.applicationPrototype) !== state.applicationPrototypeParent ||
    Object.getOwnPropertyDescriptor(state.applicationPrototype, 'constructor')?.value !==
      state.NestApplication ||
    state.ExpressAdapter.prototype !== state.adapterPrototype ||
    Object.getPrototypeOf(state.adapterPrototype) !== state.adapterPrototypeParent ||
    Object.getOwnPropertyDescriptor(state.adapterPrototype, 'constructor')?.value !==
      state.ExpressAdapter
  )
    refuse(state, 'NEST_PRIVATE_LINK_DRIFT');
  for (const row of state.patches)
    if (
      !isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.object, row.key), row.installed) ||
      !isDeepStrictEqual(
        Object.getOwnPropertyDescriptor(state.singleton, row.key),
        row.singletonOwn,
      )
    )
      refuse(state, 'DESCRIPTOR_DRIFT');
  if (
    state.rawValidated &&
    (Object.getPrototypeOf(state.rawApp) !== state.applicationPrototype ||
      [...state.rawMethods].some(([name, method]) => data(state.rawApp, name) !== method) ||
      [...state.rawMethodBindings].some(([name, binding]) => {
        const current = methodBinding(state.rawApp, name);
        return (
          !current ||
          current.owner !== binding.owner ||
          !isDeepStrictEqual(current.descriptor, binding.descriptor)
        );
      }))
  )
    refuse(state, 'NEST_PRIVATE_LINK_DRIFT');
  if (state.adapter && Object.getPrototypeOf(state.adapter) !== state.adapterPrototype)
    refuse(state, 'ACTUAL_ADAPTER');
  if (!cleanup) {
    if (state.failure) refuse(state, state.failure);
    try {
      if (state.check() !== undefined) refuse(state, 'PARENT_ADMISSION');
    } catch (error) {
      state.failure ??= 'PARENT_ADMISSION';
      throw error;
    }
  }
}

function patch(state, key, make) {
  const object = state.factoryPrototype;
  const original = Object.getOwnPropertyDescriptor(object, key);
  if (
    !original ||
    Object.getOwnPropertyDescriptor(state.singleton, key) !== undefined ||
    !Object.hasOwn(original, 'value') ||
    typeof original.value !== 'function' ||
    types.isProxy(original.value) ||
    !original.writable ||
    !original.configurable
  )
    refuse(state, 'DESCRIPTOR');
  const installed = { ...original, value: make(original.value) };
  Object.defineProperty(object, key, installed);
  state.patches.push({
    object,
    key,
    original,
    installed,
    singletonOwn: Object.getOwnPropertyDescriptor(state.singleton, key),
  });
}

function publicOperation(state, name, args) {
  verify(state);
  if (
    !state.publicApp ||
    state.acceptedApp !== state.publicApp ||
    data(state.rawApp, name) !== state.rawMethods.get(name)
  )
    refuse(state, 'PUBLIC_APP_LINK');
  // Each read is a fresh legitimate Nest wrapper. Keep this exact wrapper and
  // forward its actual receiver/complete args; never compare a later read.
  const wrapper = state.publicApp[name];
  if (typeof wrapper !== 'function') refuse(state, 'PUBLIC_APP_METHOD');
  state.publicOperations.push({ name, wrapper });
  return Reflect.apply(wrapper, state.publicApp, args);
}

/** The check callback may only revalidate the caller's existing bounded scope. */
export function installReferenceNestGuard(input) {
  const state = {
    patches: [],
    rawMethods: new Map(),
    rawMethodBindings: new Map(),
    publicOperations: [],
    closed: false,
    injectedEvents: [],
    firstForwardCount: 0,
    secondForwardCount: 0,
  };
  if (
    arguments.length !== 1 ||
    active ||
    !input ||
    types.isProxy(input) ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    !['check,custody,originURL', 'check,custody,fault,originURL'].includes(
      Object.keys(input).sort().join(','),
    ) ||
    Reflect.ownKeys(input).length !== Object.keys(input).length ||
    !Object.keys(input).every((key) =>
      Object.hasOwn(Object.getOwnPropertyDescriptor(input, key), 'value'),
    ) ||
    typeof input.originURL !== 'string' ||
    typeof input.check !== 'function' ||
    types.isProxy(input.check) ||
    types.isAsyncFunction(input.check) ||
    types.isGeneratorFunction(input.check) ||
    process.versions.node !== '24.20.0' ||
    (Object.hasOwn(input, 'fault') && !faultNames.has(input.fault))
  )
    refuse(state, 'NEST_GUARD_CONTEXT');
  const originPath = fileURLToPath(input.originURL);
  if (
    pathToFileURL(originPath).href !== input.originURL ||
    realpathSync(originPath) !== originPath ||
    !lstatSync(originPath).isFile()
  )
    refuse(state, 'NEST_GUARD_CONTEXT');
  const preparation = preparations.get(input.custody);
  if (!preparation || preparation.leased || preparation.revoked)
    refuse(state, 'NEST_PREPARATION_CONTEXT');
  try {
    verifyPreparation(preparation, true);
    const require = createRequire(input.originURL);
    const definitions = [
      '@nestjs/core/nest-factory',
      '@nestjs/core/nest-application',
      '@nestjs/platform-express/adapters/express-adapter',
    ];
    for (let index = 0; index < definitions.length; index++) {
      const row = preparation.modules[index];
      if (
        require.resolve(definitions[index]) !== row.path ||
        require.cache[row.path] !== row.module ||
        require(definitions[index]) !== row.exports
      )
        refuse(state, 'NEST_PREPARATION_ORIGIN_MISMATCH');
    }
  } catch (error) {
    preparation.revoked = true;
    throw error;
  }
  for (const key of [
    'factoryPath',
    'factoryModule',
    'singleton',
    'factoryPrototype',
    'factoryPrototypeParent',
    'applicationModule',
    'NestApplication',
    'applicationPrototype',
    'applicationPrototypeParent',
    'ExpressAdapter',
    'adapterPrototype',
    'adapterPrototypeParent',
  ])
    state[key] = preparation[key];
  state.preparation = preparation;
  preparation.leased = true;
  state.check = input.check;
  state.fault = input.fault;
  const handle = Object.freeze({});
  sessions.set(handle, state);
  active = state;
  try {
    verify(state);
    // Public create is also forwarded unchanged so actual pending construction
    // is retained, including failures before the two PRIVATE proxy seams.
    patch(
      state,
      'create',
      (original) =>
        function (...args) {
          const duplicate = !!state.createAttempt;
          const attempt = { pending: true, settled: false, status: 'INVOKING' };
          if (!duplicate) state.createAttempt = attempt;
          let promise;
          try {
            verify(state);
            if (!state.creationScope || this !== state.singleton || duplicate)
              refuse(state, 'NEST_CREATE_SCOPE');
            promise = Reflect.apply(original, this, args);
            attempt.actualReturn = promise;
            if (!types.isPromise(promise) || types.isProxy(promise))
              refuse(state, 'NEST_CREATE_PROMISE');
            attempt.promise = promise;
            attempt.status = 'PENDING';
            promise.then(
              (app) => {
                attempt.pending = false;
                attempt.settled = true;
                attempt.status = 'FULFILLED';
                if (app !== state.publicApp || !state.firstProxyCompleted)
                  state.failure ??= 'PUBLIC_NEST_PROXY_LINK';
              },
              () => {
                attempt.pending = false;
                attempt.settled = true;
                attempt.status = 'REJECTED';
                state.failure ??= 'NEST_CREATE_FORWARDING';
              },
            );
            return promise;
          } catch (error) {
            attempt.pending = false;
            attempt.settled = true;
            attempt.status = 'THREW';
            state.failure ??= 'NEST_CREATE_FORWARDING';
            throw error;
          }
        },
    );
    // Both methods are PRIVATE installed implementation seams, not public API.
    patch(
      state,
      'createNestInstance',
      (original) =>
        function (...args) {
          acquireRaw(state, args);
          faultEvent(state, 'FIRST_FOREIGN_RAW', () => firstEntry(state, this, [state.adapter]));
          firstEntry(state, this, args);
          let result;
          try {
            state.firstForwardCount++;
            result = Reflect.apply(original, this, args);
            state.actualFirstReturn = result;
            injectFault(state, 'FIRST_FORWARD_THROW');
          } catch (error) {
            state.failure ??= 'FIRST_NEST_PROXY_FORWARDING';
            throw error;
          }
          if (!types.isProxy(result) || result === state.rawApp) refuse(state, 'FIRST_NEST_PROXY');
          state.firstProxy = result;
          faultEvent(state, 'FIRST_ENTRY_DUPLICATE', () => firstEntry(state, this, args));
          faultEvent(state, 'SECOND_WITHOUT_FIRST_COMPLETION', () =>
            secondEntry(state, this, [result, state.adapter]),
          );
          state.firstProxyCompleted = true;
          return result;
        },
    );
    patch(
      state,
      'createAdapterProxy',
      (original) =>
        function (...args) {
          state.actualSecondArguments = args;
          faultEvent(state, 'SECOND_FOREIGN_PROXY', () =>
            secondEntry(state, this, [state.rawApp, state.adapter]),
          );
          faultEvent(state, 'SECOND_FOREIGN_ADAPTER', () =>
            secondEntry(state, this, [state.firstProxy, state.rawApp]),
          );
          secondEntry(state, this, args);
          let result;
          try {
            state.secondForwardCount++;
            result = Reflect.apply(original, this, args);
            state.actualSecondReturn = result;
            injectFault(state, 'SECOND_FORWARD_THROW');
          } catch (error) {
            state.failure ??= 'PUBLIC_NEST_PROXY_FORWARDING';
            throw error;
          }
          if (!types.isProxy(result) || result === state.rawApp || result === state.firstProxy)
            refuse(state, 'PUBLIC_NEST_PROXY');
          state.publicApp = result;
          faultEvent(state, 'SECOND_ENTRY_DUPLICATE', () => secondEntry(state, this, args));
          return result;
        },
    );
    return handle;
  } catch (error) {
    // No create can run during synchronous installation. Restore only exactly
    // this session's installed descriptors; retain any uncertain ownership.
    let uncertain = false;
    for (const row of state.patches.slice().reverse()) {
      if (!isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.object, row.key), row.installed))
        uncertain = true;
      else Object.defineProperty(row.object, row.key, row.original);
    }
    preparation.revoked = true;
    if (!uncertain) {
      state.closed = true;
      preparation.leased = false;
      active = undefined;
    }
    throw error;
  }
}

export function beginReferenceNestCreation(handle) {
  const state = stateFor(handle);
  verify(state);
  if (arguments.length !== 1 || state.creationEntered) refuse(state, 'NEST_CREATE_SCOPE');
  state.creationEntered = true;
  state.creationScope = true;
}

export function endReferenceNestCreation(handle) {
  const state = stateFor(handle);
  state.creationScope = false;
  if (arguments.length !== 1 || !state.creationEntered || state.createAttempt?.pending)
    refuse(state, 'NEST_CREATE_PENDING');
  verify(state);
  if (!state.createAttempt?.settled || !state.publicApp) refuse(state, 'PUBLIC_NEST_PROXY_LINK');
}

export function bindReferenceNestAdapter(handle, adapter) {
  const state = stateFor(handle);
  verify(state);
  if (
    arguments.length !== 2 ||
    state.adapter ||
    !adapter ||
    types.isProxy(adapter) ||
    Object.getPrototypeOf(adapter) !== state.adapterPrototype
  )
    refuse(state, 'ACTUAL_ADAPTER');
  state.adapter = adapter;
}

export function acceptReferenceNestApplication(handle, app) {
  const state = stateFor(handle);
  verify(state);
  if (
    arguments.length !== 2 ||
    state.acceptedApp ||
    app !== state.publicApp ||
    !state.firstProxyCompleted ||
    !state.adapter
  )
    refuse(state, 'APP_IDENTITY');
  state.acceptedApp = app;
}

export function referenceNestOperation(handle, name, args) {
  const state = stateFor(handle);
  if (
    arguments.length !== 3 ||
    !methodNames.slice(0, -1).includes(name) ||
    !Array.isArray(args) ||
    types.isProxy(args)
  )
    refuse(state, 'PUBLIC_APP_METHOD');
  return publicOperation(state, name, args);
}

export function closeReferenceNestApplication(handle, fallback) {
  const state = stateFor(handle);
  if (arguments.length !== 2 || typeof fallback !== 'boolean') refuse(state, 'RAW_CLOSE_BINDING');
  if (state.createAttempt?.pending) refuse(state, 'NEST_CREATE_PENDING');
  if (state.closeAttempt) {
    if (!state.closeAttempt.promise) refuse(state, 'CLOSE_REENTRANCY');
    return state.closeAttempt.promise;
  }
  const attempt = {
    kind: fallback ? 'raw-fallback' : 'public',
    resolved: false,
    rejected: false,
    uncertain: false,
  };
  state.closeAttempt = attempt;
  try {
    let promise;
    if (fallback) {
      verify(state, true);
      if (!state.rawValidated || data(state.rawApp, 'close') !== state.rawMethods.get('close'))
        refuse(state, 'RAW_CLOSE_BINDING');
      promise = Reflect.apply(state.rawMethods.get('close'), state.rawApp, []);
    } else promise = publicOperation(state, 'close', []);
    attempt.actualReturn = promise;
    if (types.isPromise(promise) && !types.isProxy(promise)) {
      attempt.actualPending = true;
      promise.then(
        () => {
          attempt.actualPending = false;
          attempt.actualResolved = true;
        },
        () => {
          attempt.actualPending = false;
          attempt.actualRejected = true;
        },
      );
    }
    injectFault(state, 'CLOSE_THROW');
    if (injectFault(state, 'CLOSE_NON_PROMISE')) promise = undefined;
    if (!types.isPromise(promise) || types.isProxy(promise)) refuse(state, 'CLOSE_PROMISE');
    attempt.promise = promise;
    promise.then(
      () => {
        attempt.resolved = true;
      },
      () => {
        attempt.rejected = true;
      },
    );
    return promise;
  } catch (error) {
    state.failure ??= 'CLOSE_FORWARDING';
    attempt.rejected = true;
    attempt.uncertain = true;
    attempt.promise = Promise.reject(error);
    attempt.promise.catch(() => {});
    throw error;
  }
}

export function observeReferenceNestGuard(handle) {
  const state = stateFor(handle);
  verify(state);
  return snapshot(state);
}

function snapshot(state) {
  return {
    schemaVersion: 1,
    scope: 'installed-nest-guard-component',
    provenance: 'INSTALLED_PRIVATE_IMPLEMENTATION_FORWARDING',
    sourceSha256: factorySha256,
    preparation: preparationProjection(state.preparation),
    rawAcquired: !!state.rawApp,
    rawValidated: !!state.rawValidated,
    firstProxyCompleted: !!state.firstProxyCompleted,
    firstForwardCount: state.firstForwardCount,
    secondForwardCount: state.secondForwardCount,
    injectedEvents: [...state.injectedEvents],
    publicAppObserved: !!state.publicApp,
    rawFirstPublicIdentityObserved:
      !!state.rawValidated && !!state.firstProxyCompleted && !!state.publicApp,
    publicAppAccepted: !!state.acceptedApp,
    creationPending: !!state.createAttempt?.pending,
    creationStatus: state.createAttempt?.status ?? 'NOT_INVOKED',
    publicOperations: state.publicOperations.map((row) => row.name),
    closeKind: state.closeAttempt?.kind ?? null,
    closeResolved: state.closeAttempt?.resolved === true,
    closeRejected: state.closeAttempt?.rejected === true,
    closeUncertain: state.closeAttempt?.uncertain === true,
    actualClosePending: state.closeAttempt?.actualPending === true,
    actualCloseResolved: state.closeAttempt?.actualResolved === true,
    actualCloseRejected: state.closeAttempt?.actualRejected === true,
    faultInjected: state.fault !== undefined,
    fault: state.fault ?? null,
    faultUsed: state.faultUsed === true,
    failure: state.failure ?? null,
    descriptorsRestored: state.closed,
    complete: false,
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  };
}

/** Failure snapshots retain ownership facts but make no final custody claim. */
export function snapshotReferenceNestGuard(handle) {
  if (arguments.length !== 1) throw new Error('Nest guard snapshot accepts one handle');
  const state = sessions.get(handle);
  if (!state) throw new Error('Unknown installed Nest guard');
  return snapshot(state);
}

/** Reconcile only an actually retained public app after successful owned close. */
export function referenceNestApplicationClosed(handle, app) {
  const state = stateFor(handle);
  if (arguments.length !== 2) refuse(state, 'APP_IDENTITY');
  verify(state, true);
  return (
    app === state.publicApp &&
    state.closeAttempt?.resolved === true &&
    state.closeAttempt?.actualResolved === true &&
    !state.closeAttempt?.uncertain
  );
}

export function restoreReferenceNestGuard(handle) {
  const state = sessions.get(handle);
  if (arguments.length !== 1 || !state) throw new Error('Unknown installed Nest guard');
  if (state.closed) return snapshot(state);
  if (
    state.creationScope ||
    state.createAttempt?.pending ||
    state.closeAttempt?.actualPending ||
    (state.rawApp && (!state.closeAttempt?.resolved || state.closeAttempt?.uncertain))
  )
    refuse(state, 'CLEANUP_INCOMPLETE');
  // Cleanup is allowed after a historical refusal, but never over another
  // owner's descriptor or while the actual create/close obligation is unknown.
  verify(state, true);
  for (const row of state.patches.slice().reverse())
    Object.defineProperty(row.object, row.key, row.original);
  for (const row of state.patches)
    if (!isDeepStrictEqual(Object.getOwnPropertyDescriptor(row.object, row.key), row.original))
      refuse(state, 'RESTORATION_DRIFT');
  try {
    verifyPreparation(state.preparation, true);
  } catch (error) {
    state.preparation.revoked = true;
    throw error;
  }
  state.closed = true;
  state.preparation.leased = false;
  active = undefined;
  return snapshot(state);
}
