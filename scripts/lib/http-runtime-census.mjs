import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import * as ts from 'typescript';

// Use the application's installed dependency closure, not an ambient Express copy.
const require = createRequire(new URL('../../packages/flow/package.json', import.meta.url));
const { MetadataScanner, ModulesContainer, Reflector } = require('@nestjs/core');
const { RouterExplorer } = require('@nestjs/core/router/router-explorer');
const { AbstractHttpAdapter } = require('@nestjs/core/adapters/http-adapter');
const { RequestMethod, VERSION_NEUTRAL, VersioningType } = require('@nestjs/common');
const { PATH_METADATA, METHOD_METADATA } = require('@nestjs/common/constants');
const {
  STYNX_PUBLIC_ROUTE,
  STYNX_PERMISSION_ROUTE,
  STYNX_READONLY_ROUTE,
  STYNX_SYSTEM_ROUTE,
} = require('@stynx-nyx/auth');
const authRequire = createRequire(require.resolve('@stynx-nyx/auth'));
const { STYNX_PUBLIC_TENANT_ROUTE } = authRequire('@stynx-nyx/contracts');
const adapterRequire = createRequire(require.resolve('@nestjs/platform-express'));
const expressRequire = createRequire(adapterRequire.resolve('express'));
const { ExpressAdapter } = require('@nestjs/platform-express');
const express = adapterRequire('express');
let capturing = false;

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function portableSource(root, binding) {
  if (
    !binding ||
    typeof binding.source !== 'string' ||
    isAbsolute(binding.source) ||
    binding.source.includes('\\') ||
    binding.source.split('/').some((part) => !part || part === '.' || part === '..') ||
    !/^[a-f0-9]{64}$/u.test(binding.sourceSha256 ?? '')
  )
    throw new Error('Invalid runtime census source binding');
  const path = realpathSync(resolve(root, binding.source));
  const confined = relative(root, path);
  if (isAbsolute(confined) || confined === '..' || confined.startsWith('../'))
    throw new Error('Runtime census source binding escapes repository');
  const bytes = readFileSync(path);
  if (hash(bytes) !== binding.sourceSha256)
    throw new Error(`Runtime census source binding digest drift: ${binding.source}`);
  return bytes.toString('utf8');
}

function serializable(value) {
  if (value === VERSION_NEUTRAL) return { symbol: 'VERSION_NEUTRAL' };
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof RegExp) return { regexp: value.source, flags: value.flags };
  if (Array.isArray(value)) return value.map(serializable);
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, serializable(item)]),
    );
  throw new Error('Unsupported runtime census configuration value');
}

function configuration(app) {
  const config = app.config;
  if (
    !config ||
    typeof config.getGlobalPrefix !== 'function' ||
    typeof config.getGlobalPrefixOptions !== 'function' ||
    typeof config.getVersioning !== 'function'
  )
    throw new Error('Unsupported Nest runtime application configuration');
  const versioning = config.getVersioning();
  if (versioning && versioning.type !== VersioningType.URI)
    throw new Error('Unsupported runtime census header, media or custom version configuration');
  return serializable({
    globalPrefix: config.getGlobalPrefix(),
    globalPrefixOptions: config.getGlobalPrefixOptions(),
    versioning,
  });
}

function routingConfiguration(adapter, expected) {
  const router = adapter.getInstance()?.router;
  const actual = { caseSensitive: router?.caseSensitive, strict: router?.strict };
  if (
    Object.values(actual).some((value) => typeof value !== 'boolean') ||
    !isDeepStrictEqual(actual, expected)
  )
    throw new Error('Runtime adapter routing configuration binding drift');
  return actual;
}

function classDeclared(text, name, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) throw new Error(`Invalid runtime census source: ${file}`);
  let found = false;
  const visit = (node) => {
    if (ts.isClassDeclaration(node) && node.name?.text === name) found = true;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function dependencyEvidence() {
  const coreVersion = require('@nestjs/core/package.json').version;
  const adapterVersion = require('@nestjs/platform-express/package.json').version;
  const expressVersion = adapterRequire('express/package.json').version;
  const routerVersion = expressRequire('router/package.json').version;
  if (
    coreVersion !== '11.2.3' ||
    adapterVersion !== '11.2.3' ||
    expressVersion !== '5.2.1' ||
    routerVersion !== '2.2.0'
  )
    throw new Error('Unsupported runtime census Nest/Express dependency versions');
  const files = [
    ['router-explorer', require.resolve('@nestjs/core/router/router-explorer')],
    ['metadata-scanner', require.resolve('@nestjs/core/metadata-scanner')],
    ['express-adapter', require.resolve('@nestjs/platform-express/adapters/express-adapter')],
    ['express', adapterRequire.resolve('express')],
    ['router', expressRequire.resolve('router')],
  ];
  return {
    nestCore: coreVersion,
    nestExpressAdapter: adapterVersion,
    express: expressVersion,
    router: routerVersion,
    implementationSha256: Object.fromEntries(
      files.map(([id, path]) => [id, hash(readFileSync(path))]),
    ),
  };
}

function canonicalPath(path, routing) {
  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path.includes('//') ||
    path.split('/').some((part) => part === '.' || part === '..') ||
    /[?*{}()\\]/u.test(path)
  )
    throw new Error(`Unsupported runtime adapter route path: ${String(path)}`);
  if (!routing.caseSensitive && /[^\x20-\x7e]/u.test(path))
    throw new Error('Unsupported non-ASCII case-insensitive adapter route collision semantics');
  let canonical = path.replace(/:[A-Za-z_$][\w$]*/gu, ':parameter');
  if (!routing.caseSensitive) canonical = canonical.toLowerCase();
  if (!routing.strict) canonical = canonical.replace(/\/$/u, '');
  return canonical || '/';
}

/** Observe one owned app's actual registrations. The caller closes a successful app. */
export async function captureNestHttpRuntime({
  createApplication,
  repoRoot,
  compositionId,
  bootstrapBinding,
  expectedConfiguration,
  expectedRouting = { caseSensitive: false, strict: false },
  controllerBindings,
}) {
  if (capturing) throw new Error('Concurrent runtime census capture is unsupported');
  if (typeof createApplication !== 'function' || !/^[a-z][a-z0-9-]*$/u.test(compositionId ?? ''))
    throw new Error('Invalid runtime census composition binding');
  const root = realpathSync(repoRoot);
  portableSource(root, bootstrapBinding);
  const bindings = new Map();
  for (const binding of controllerBindings ?? []) {
    const text = portableSource(root, binding);
    if (
      typeof binding.controller !== 'function' ||
      binding.controller.name !== binding.className ||
      !classDeclared(text, binding.className, binding.source) ||
      bindings.has(binding.controller)
    )
      throw new Error(`Invalid runtime controller binding: ${binding.className}`);
    bindings.set(binding.controller, binding);
  }
  const dependencies = dependencyEvidence();
  const original = RouterExplorer.prototype.applyCallbackToRouter;
  if (typeof original !== 'function' || original.length !== 6)
    throw new Error('Unsupported Nest runtime registration observer boundary');
  const observations = [];
  const middleware = new Map();
  const restoreMiddleware = [];
  const initialHookSha256 = hash(
    new ExpressAdapter().getInstance().router.stack[0].handle.toString(),
  );
  for (const name of ['json', 'urlencoded']) {
    const originalFactory = express[name];
    express[name] = function (options) {
      const callback = Reflect.apply(originalFactory, this, [options]);
      middleware.set(callback, { kind: `express-${name}`, configuration: serializable(options) });
      return callback;
    };
    restoreMiddleware.push(() => {
      express[name] = originalFactory;
    });
  }
  const enableCors = ExpressAdapter.prototype.enableCors;
  ExpressAdapter.prototype.enableCors = function (options) {
    const ownUse = Object.getOwnPropertyDescriptor(this, 'use');
    const use = this.use;
    this.use = function (...args) {
      if (args.length !== 1 || typeof args[0] !== 'function')
        throw new Error('Unsupported CORS middleware registration');
      middleware.set(args[0], { kind: 'cors', configuration: serializable(options) });
      return Reflect.apply(use, this, args);
    };
    try {
      return Reflect.apply(enableCors, this, [options]);
    } finally {
      if (ownUse) Object.defineProperty(this, 'use', ownUse);
      else delete this.use;
    }
  };
  restoreMiddleware.push(() => {
    ExpressAdapter.prototype.enableCors = enableCors;
  });
  let app;
  capturing = true;
  RouterExplorer.prototype.applyCallbackToRouter = function (
    adapter,
    definition,
    wrapper,
    moduleKey,
    routeMetadata,
    host,
  ) {
    if (adapter.getType?.() !== 'express') throw new Error('Unsupported runtime HTTP adapter');
    if (host !== undefined && host !== null)
      throw new Error('Unsupported runtime census host selector configuration');
    const method = RequestMethod[definition.requestMethod];
    if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'SEARCH'].includes(method))
      throw new Error(`Unsupported runtime HTTP registration method: ${method}`);
    const key = method.toLowerCase();
    const ownDescriptor = Object.getOwnPropertyDescriptor(adapter, key);
    const register = adapter[key];
    if (typeof register !== 'function' || register !== AbstractHttpAdapter.prototype[key])
      throw new Error('Unsupported runtime adapter registration');
    adapter[key] = function (path, ...handlers) {
      if (!handlers.length || handlers.some((handler) => typeof handler !== 'function'))
        throw new Error('Unsupported runtime adapter callback registration');
      observations.push({
        adapter,
        definition,
        wrapper,
        moduleKey,
        method,
        path,
        handlers,
        selectors: serializable(routeMetadata),
        routing: routingConfiguration(adapter, expectedRouting),
      });
      const result = Reflect.apply(register, this, [path, ...handlers]);
      routingConfiguration(adapter, expectedRouting);
      return result;
    };
    try {
      return Reflect.apply(original, this, [
        adapter,
        definition,
        wrapper,
        moduleKey,
        routeMetadata,
        host,
      ]);
    } finally {
      if (ownDescriptor) Object.defineProperty(adapter, key, ownDescriptor);
      else delete adapter[key];
    }
  };
  try {
    app = await createApplication();
    if (!app || typeof app.init !== 'function') throw new Error('Invalid runtime application');
    const before = configuration(app);
    if (!isDeepStrictEqual(before, serializable(expectedConfiguration)))
      throw new Error('Runtime bootstrap configuration binding drift');
    const ownedAdapter = app.getHttpAdapter();
    routingConfiguration(ownedAdapter, expectedRouting);
    for (const [name, kind] of [
      ['setNotFoundHandler', 'nest-not-found'],
      ['setErrorHandler', 'nest-error'],
    ]) {
      const own = Object.getOwnPropertyDescriptor(ownedAdapter, name);
      const install = ownedAdapter[name];
      ownedAdapter[name] = function (callback, ...args) {
        if (typeof callback !== 'function') throw new Error('Unsupported Nest middleware callback');
        middleware.set(callback, { kind, configuration: null });
        return Reflect.apply(install, this, [callback, ...args]);
      };
      restoreMiddleware.push(() => {
        if (own) Object.defineProperty(ownedAdapter, name, own);
        else delete ownedAdapter[name];
      });
    }
    await app.init();
    const adapter = app.getHttpAdapter();
    if (adapter?.getType?.() !== 'express') throw new Error('Unsupported runtime HTTP adapter');
    if (!isDeepStrictEqual(before, configuration(app)))
      throw new Error('Runtime bootstrap configuration changed during initialization');
    const router = adapter.getInstance()?.router;
    const routing = routingConfiguration(adapter, expectedRouting);
    const scanner = new MetadataScanner();
    const reflector = new Reflector();
    const modules = app.get(ModulesContainer);
    const expected = new Map();
    for (const [moduleKey, module] of modules) {
      for (const wrapper of module.controllers.values()) {
        const mounted = bindings.get(wrapper.metatype);
        if (!mounted)
          throw new Error(`Missing mounted runtime controller binding: ${wrapper.metatype?.name}`);
        const prototype = Object.getPrototypeOf(wrapper.instance);
        const methods = new Map();
        for (const handler of scanner.getAllMethodNames(prototype)) {
          const callback = prototype[handler];
          if (reflector.get(PATH_METADATA, callback) === undefined) continue;
          let origin = prototype;
          while (origin && !Object.hasOwn(origin, handler)) origin = Object.getPrototypeOf(origin);
          const declaring = bindings.get(origin?.constructor);
          if (!declaring || wrapper.instance[handler] !== callback)
            throw new Error(`Missing or unsupported runtime declaring handler binding: ${handler}`);
          methods.set(handler, {
            callback,
            declaring,
            method: RequestMethod[reflector.get(METHOD_METADATA, callback)],
          });
        }
        expected.set(wrapper, { moduleKey, mounted, methods });
      }
    }
    const routes = [];
    const seen = new Set();
    const reached = new Map();
    for (const observation of observations) {
      const { wrapper, definition, method, path } = observation;
      const expectedController = expected.get(wrapper);
      const handler = expectedController?.methods.get(definition.methodName);
      if (
        observation.adapter !== adapter ||
        expectedController?.moduleKey !== observation.moduleKey ||
        !handler ||
        definition.targetCallback !== handler.callback ||
        method !== handler.method
      )
        throw new Error('Runtime registration/source controller binding mismatch');
      const canonical = `${method} ${canonicalPath(path, routing)}`;
      if (seen.has(canonical)) throw new Error(`Runtime route collision: ${canonical}`);
      seen.add(canonical);
      const names = reached.get(wrapper) ?? new Set();
      names.add(definition.methodName);
      reached.set(wrapper, names);
      const identity = (binding) => ({
        source: binding.source,
        className: binding.className,
        sourceSha256: binding.sourceSha256,
      });
      const get = (key) => reflector.getAllAndOverride(key, [handler.callback, wrapper.metatype]);
      const id = `${compositionId}:${expectedController.mounted.source}:${expectedController.mounted.className}.${definition.methodName}:${method}:${path}`;
      routes.push({
        id,
        method,
        path,
        mounted: identity(expectedController.mounted),
        declaring: { ...identity(handler.declaring), handler: definition.methodName },
        metadata: {
          public: get(STYNX_PUBLIC_ROUTE) === true,
          publicTenant: serializable(get(STYNX_PUBLIC_TENANT_ROUTE)),
          permission: serializable(get(STYNX_PERMISSION_ROUTE)),
          readOnly: get(STYNX_READONLY_ROUTE) === true,
          system: get(STYNX_SYSTEM_ROUTE) === true,
        },
        selectors: observation.selectors,
        provenance: 'nest-registration',
        reachability: 'UNKNOWN',
      });
    }
    for (const [wrapper, controller] of expected) {
      if ([...controller.methods.keys()].some((name) => !reached.get(wrapper)?.has(name)))
        throw new Error('Runtime controller binding has missing adapter registrations');
    }
    const stack = router?.stack;
    if (!Array.isArray(stack)) throw new Error('Unsupported or missing runtime adapter stack');
    const actual = [];
    const middlewarePopulation = [];
    for (const [index, layer] of stack.entries()) {
      if (!layer || typeof layer !== 'object') throw new Error('Unsupported runtime adapter layer');
      if (!layer.route) {
        if (layer.name === 'router' || layer.handle?.stack)
          throw new Error('Unsupported nested runtime adapter router');
        const recognized = middleware.get(layer.handle);
        const initialHook =
          index === 0 &&
          typeof layer.handle === 'function' &&
          hash(layer.handle.toString()) === initialHookSha256 &&
          !adapter.onRequestHook &&
          !adapter.onResponseHook;
        if (!recognized && !initialHook)
          throw new Error('Unrecognized runtime adapter middleware population');
        middlewarePopulation.push({
          index,
          ...(recognized ?? { kind: 'express-adapter-request-hook', configuration: null }),
          handlerSha256: hash(layer.handle.toString()),
        });
        continue;
      }
      const route = layer.route;
      if (typeof route.path !== 'string' || !Array.isArray(route.stack) || !route.methods)
        throw new Error('Unsupported runtime adapter route shape');
      canonicalPath(route.path, routing);
      const methods = Object.entries(route.methods).filter(([, enabled]) => enabled === true);
      if (methods.length !== 1 || methods[0][0] === '_all' || route.stack.length !== 1)
        throw new Error('Unsupported runtime adapter method/callback population');
      if (route.stack[0].method !== methods[0][0])
        throw new Error('Runtime adapter inner method population mismatch');
      actual.push({
        method: methods[0][0].toUpperCase(),
        path: route.path,
        callback: route.stack[0].handle,
      });
    }
    if (
      actual.length !== observations.length ||
      actual.some(
        (entry, index) =>
          entry.method !== observations[index].method ||
          entry.path !== observations[index].path ||
          entry.callback !== observations[index].handlers[0],
      )
    )
      throw new Error('Runtime adapter registration population or callback identity mismatch');
    portableSource(root, bootstrapBinding);
    for (const binding of bindings.values()) portableSource(root, binding);
    const implicitHead = routes.flatMap((route, index) => {
      if (route.method !== 'GET') return [];
      const headIndex = routes.findIndex(
        (candidate) =>
          candidate.method === 'HEAD' &&
          canonicalPath(candidate.path, routing) === canonicalPath(route.path, routing),
      );
      if (headIndex > index) throw new Error('Runtime HEAD route shadowing collision');
      return [
        {
          method: 'HEAD',
          path: route.path,
          fallbackRouteId: route.id,
          provenance: 'express-get-fallback',
          samePatternEffective: headIndex === -1,
          reachability: 'UNKNOWN',
          ...(headIndex === -1 ? {} : { shadowedByRouteId: routes[headIndex].id }),
        },
      ];
    });
    return {
      app,
      census: {
        schemaVersion: '1.0.0',
        compositionId,
        bootstrapBinding: {
          source: bootstrapBinding.source,
          sourceSha256: bootstrapBinding.sourceSha256,
        },
        configuration: before,
        dependencies,
        routing,
        routes,
        middleware: middlewarePopulation,
        implicitHead,
        options: { reachability: 'UNKNOWN' },
        registrationReconciled: true,
        complete: false,
        assurance: { sourceBuild: 'UNVERIFIED', middlewareConfiguration: 'UNVERIFIED' },
      },
    };
  } catch (error) {
    if (app && typeof app.close === 'function') {
      try {
        await app.close();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Runtime census failed and application cleanup failed',
        );
      }
    }
    throw error;
  } finally {
    for (const restore of restoreMiddleware.reverse()) restore();
    RouterExplorer.prototype.applyCallbackToRouter = original;
    capturing = false;
  }
}
