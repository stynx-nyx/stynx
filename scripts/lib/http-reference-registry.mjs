import { isHttpComposition } from './http-composition-roster.mjs';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { isDeepStrictEqual, types } from 'node:util';
import * as ts from 'typescript';

// Source plans are descriptive. Only the fixed worker's actual already-loaded
// CJS exports and runtime objects can populate the private identity registry.
const require = createRequire(import.meta.url);
const registries = new WeakMap();
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function refuse(reason) {
  const error = new Error('Reference object registry refused its closed binding');
  error.code = `HTTP_REFERENCE_REGISTRY_${reason}`;
  throw error;
}

function readBound(root, row) {
  if (
    !row ||
    typeof row.path !== 'string' ||
    isAbsolute(row.path) ||
    row.path.split('/').some((part) => !part || part === '.' || part === '..') ||
    row.path.includes('\\')
  )
    refuse('PATH');
  const file = resolve(root, row.path);
  const local = relative(root, file);
  const stat = lstatSync(file);
  if (
    local.startsWith('../') ||
    isAbsolute(local) ||
    !stat.isFile() ||
    realpathSync(file) !== file ||
    (stat.mode & 0o7777) !== row.permissions
  )
    refuse('FILE_IDENTITY');
  const bytes = readFileSync(file);
  if (bytes.length !== row.byteLength || digest(bytes) !== row.sha256) refuse('FILE_BYTES');
  return bytes;
}

function parsed(root, row, kind) {
  const file = ts.createSourceFile(
    row.path,
    readBound(root, row).toString('utf8'),
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  if (file.parseDiagnostics.length) refuse('SYNTAX');
  return file;
}

function ownOutput(packageRoot, source) {
  const prefix = `${packageRoot}/src/`;
  if (!source.startsWith(prefix) || !source.endsWith('.ts') || source.endsWith('.d.ts'))
    return undefined;
  const stem = source.slice(0, -3);
  // Exact existing rootDir layouts: packages use ../.., reference/api ../../... .
  return packageRoot.startsWith('packages/')
    ? `${packageRoot}/dist/${stem.slice('packages/'.length)}.js`
    : packageRoot === 'reference/api' || packageRoot === 'domain/demo-bookmark/api'
      ? `${packageRoot}/dist/${stem}.js`
      : undefined;
}

function exportClass(node) {
  return (
    ts.isClassDeclaration(node) &&
    node.name &&
    node.modifiers?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function controllerImportNames(file) {
  const names = new Set();
  for (const node of file.statements) {
    if (
      !ts.isImportDeclaration(node) ||
      !ts.isStringLiteral(node.moduleSpecifier) ||
      node.moduleSpecifier.text !== '@nestjs/common' ||
      !node.importClause?.namedBindings ||
      !ts.isNamedImports(node.importClause.namedBindings)
    )
      continue;
    for (const element of node.importClause.namedBindings.elements)
      if ((element.propertyName ?? element.name).text === 'Controller')
        names.add(element.name.text);
  }
  return names;
}

function decoratedController(node, names) {
  return (ts.getDecorators(node) ?? []).some(
    (row) =>
      ts.isCallExpression(row.expression) &&
      ts.isIdentifier(row.expression.expression) &&
      names.has(row.expression.expression.text),
  );
}

function classRow(file, node) {
  const methods = [];
  for (const member of node.members) {
    if (
      !ts.isMethodDeclaration(member) ||
      member.modifiers?.some((row) => row.kind === ts.SyntaxKind.StaticKeyword) ||
      !member.body
    )
      continue;
    if (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)) refuse('METHOD_NAME');
    methods.push({
      name: member.name.text,
      start: member.getStart(file),
      end: member.end,
      bodySha256: digest(member.body.getText(file)),
    });
  }
  if (new Set(methods.map((row) => row.name)).size !== methods.length) refuse('METHOD_POPULATION');
  return {
    exportName: node.name.text,
    start: node.getStart(file),
    end: node.end,
    methods,
    decorators: (ts.getDecorators(node) ?? []).map((row) => row.getText(file)),
    heritage: (node.heritageClauses ?? []).map((row) => row.getText(file)),
  };
}

/** Parent uses actual private compiler state. JSON plans grant no admission. */
export function deriveReferenceRegistryPlan({ checkoutRoot, inputs, compilers }) {
  const root = realpathSync(checkoutRoot);
  if (
    ts.version !== '6.0.3' ||
    inputs?.schemaVersion !== 1 ||
    !Array.isArray(inputs.files) ||
    !Array.isArray(compilers) ||
    !/^[a-f0-9]{40}$/u.test(inputs.candidateCommit ?? '') ||
    !/^[a-f0-9]{40}$/u.test(inputs.tree ?? '')
  )
    refuse('INPUT');
  const sourceRows = new Map(inputs.files.map((row) => [row.path, row]));
  const units = [];
  const seen = new Set();
  for (const compiler of compilers) {
    const packageRoot = compiler.plan?.packageRoot;
    if (!packageRoot || compiler.plan.compiler?.version !== '6.0.3') refuse('COMPILER');
    for (const planned of compiler.plan.expectedOutputs) {
      if (!planned.path.endsWith('.js') || ownOutput(packageRoot, planned.source) !== planned.path)
        continue;
      if (seen.has(planned.source)) refuse('OWN_OUTPUT_COLLISION');
      seen.add(planned.source);
      const source = sourceRows.get(planned.source);
      const emitted = compiler.byteRows.find((row) => row.path === planned.path);
      const map = compiler.byteRows.find((row) => row.path === `${planned.path}.map`);
      const link = compiler.outputs.mapLinks.find((row) => row.emittedPath === planned.path);
      if (
        !source ||
        !emitted ||
        !map ||
        link?.sha256 !== map.sha256 ||
        link.sources.length !== 1 ||
        link.sources[0].path !== source.path ||
        link.sources[0].sha256 !== source.sha256
      )
        refuse('COMPILER_RELATION');
      const file = parsed(root, source, ts.ScriptKind.TS);
      const names = controllerImportNames(file);
      const classes = file.statements.filter(exportClass).map((node) => ({
        ...classRow(file, node),
        controller: decoratedController(node, names),
        guardedPreferences:
          source.path === 'reference/api/src/app.module.ts' &&
          node.name.text === 'GuardedPreferencesController',
      }));
      if (!classes.length) continue;
      readBound(root, emitted);
      const mapping = JSON.parse(readBound(root, map).toString('utf8'));
      if (
        mapping.version !== 3 ||
        mapping.sourceRoot ||
        mapping.sources?.length !== 1 ||
        mapping.file !== planned.path.split('/').at(-1) ||
        resolve(dirname(resolve(root, map.path)), mapping.sources[0]) !==
          resolve(root, source.path) ||
        typeof mapping.mappings !== 'string' ||
        !mapping.mappings
      )
        refuse('MAP');
      units.push({ packageRoot, source, emitted, map, classes });
    }
  }
  units.sort((a, b) => a.source.path.localeCompare(b.source.path));
  if (
    !units.some(
      (unit) =>
        unit.source.path === 'reference/api/src/app.module.ts' &&
        unit.classes.some((row) => row.guardedPreferences),
    )
  )
    refuse('REFERENCE_ROOT');
  return structuredClone({
    schemaVersion: 1,
    candidateCommit: inputs.candidateCommit,
    tree: inputs.tree,
    parserVersion: ts.version,
    units,
    provenance: 'PRIVATE_PARENT_COMPILER_RELATION_REQUIRED',
    sourceMapFunctionCorrespondence: 'UNVERIFIED',
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  });
}

function emittedClass(unit, root, row) {
  const file = parsed(root, unit.emitted, ts.ScriptKind.JS);
  const matches = [];
  const visit = (node) => {
    if (
      (ts.isClassDeclaration(node) || ts.isClassExpression(node)) &&
      node.name?.text === row.exportName
    )
      matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (matches.length !== 1) refuse('EMITTED_CLASS');
  const ownMethods = matches[0].members
    .filter(
      (node) =>
        ts.isMethodDeclaration(node) &&
        !node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword),
    )
    .map((node) => {
      if (!ts.isIdentifier(node.name) && !ts.isStringLiteral(node.name)) refuse('EMITTED_METHOD');
      return node.name.text;
    });
  if (!isDeepStrictEqual(ownMethods.sort(), row.methods.map((item) => item.name).sort()))
    refuse('EMITTED_METHOD_POPULATION');
  const exports = [];
  const exportVisit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      ts.isIdentifier(node.left.expression) &&
      node.left.expression.text === 'exports' &&
      node.left.name.text === row.exportName
    )
      exports.push(node);
    ts.forEachChild(node, exportVisit);
  };
  exportVisit(file);
  if (!exports.some((node) => ts.isIdentifier(node.right) && node.right.text === row.exportName))
    refuse('EMITTED_NAMED_EXPORT');
  return { start: matches[0].getStart(file), end: matches[0].end };
}

function actualClasses(job) {
  const root = realpathSync(job.checkoutRoot);
  const plan = job.referenceRegistry;
  if (
    job.mode !== 'reference-owned-loopback' ||
    !isHttpComposition(job.compositionId) ||
    plan?.schemaVersion !== 1 ||
    plan.candidateCommit !== job.candidateCommit ||
    plan.tree !== job.tree ||
    plan.parserVersion !== ts.version ||
    !Array.isArray(plan.units)
  )
    refuse('JOB');
  const bindings = new Map();
  const rows = [];
  const snapshots = [];
  for (const unit of plan.units) {
    if (ownOutput(unit.packageRoot, unit.source.path) !== unit.emitted.path) refuse('OWN_OUTPUT');
    const source = parsed(root, unit.source, ts.ScriptKind.TS);
    readBound(root, unit.map);
    readBound(root, unit.emitted);
    const importNames = controllerImportNames(source);
    const actualDeclarations = source.statements.filter(exportClass).map((node) => ({
      ...classRow(source, node),
      controller: decoratedController(node, importNames),
      guardedPreferences:
        unit.source.path === 'reference/api/src/app.module.ts' &&
        node.name.text === 'GuardedPreferencesController',
    }));
    if (!isDeepStrictEqual(actualDeclarations, unit.classes)) refuse('CLASS_POPULATION');
    const modulePath = resolve(root, unit.emitted.path);
    const cached = require.cache[modulePath];
    // No opportunistic evaluation of unused modules/providers for a registry.
    if (!cached) {
      rows.push({
        source: unit.source.path,
        emitted: unit.emitted.path,
        state: 'NOT_EVALUATED',
        exports: unit.classes.map((row) => row.exportName),
      });
      continue;
    }
    if (!cached.loaded || cached.id !== modulePath || cached.filename !== modulePath)
      refuse('CACHED_MODULE');
    for (const row of unit.classes) {
      const declarations = source.statements.filter(
        (node) => exportClass(node) && node.name.text === row.exportName,
      );
      if (
        declarations.length !== 1 ||
        !isDeepStrictEqual(classRow(source, declarations[0]), {
          exportName: row.exportName,
          start: row.start,
          end: row.end,
          methods: row.methods,
          decorators: row.decorators,
          heritage: row.heritage,
        })
      )
        refuse('SOURCE_CLASS');
      const emitted = emittedClass(unit, root, row);
      const descriptor = Object.getOwnPropertyDescriptor(cached.exports, row.exportName);
      if (
        !descriptor ||
        !Object.hasOwn(descriptor, 'value') ||
        typeof descriptor.value !== 'function'
      )
        refuse('ACTUAL_NAMED_EXPORT');
      const constructor = descriptor.value;
      const prototype = constructor.prototype;
      if (
        !prototype ||
        Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value !== constructor
      )
        refuse('CONSTRUCTOR_PROTOTYPE');
      const methods = new Map();
      for (const method of row.methods) {
        const own = Object.getOwnPropertyDescriptor(prototype, method.name);
        if (
          !own ||
          typeof own.value !== 'function' ||
          Object.hasOwn(own, 'get') ||
          Object.hasOwn(own, 'set')
        )
          refuse('ACTUAL_METHOD');
        methods.set(method.name, own.value);
      }
      const binding = {
        constructor,
        prototype,
        methods,
        source: unit.source.path,
        sourceSha256: unit.source.sha256,
        className: row.exportName,
        unit,
        row,
      };
      if (bindings.has(constructor)) refuse('CONSTRUCTOR_COLLISION');
      bindings.set(constructor, binding);
      snapshots.push({
        constructor,
        constructorDescriptors: Object.getOwnPropertyDescriptors(constructor),
        constructorAncestry: ancestry(constructor),
        cached,
        exports: cached.exports,
        descriptor,
        prototype,
        prototypeDescriptors: Object.getOwnPropertyDescriptors(prototype),
        prototypeAncestry: ancestry(prototype),
        unit,
        row,
      });
      rows.push({
        source: unit.source.path,
        emitted: unit.emitted.path,
        exportName: row.exportName,
        sourceDeclaration: { start: row.start, end: row.end },
        emittedDeclaration: emitted,
        state: 'ACTUAL_CACHED_NAMED_EXPORT',
        controllerDeclaration: row.controller,
        ownMethodNames: [...methods.keys()],
        compilerBoundNamedExport: true,
        sourceMapFunctionCorrespondence: 'UNVERIFIED',
      });
    }
  }
  const guarded = [...bindings.values()].find((row) => row.row.guardedPreferences);
  const preferences = [...bindings.values()].find(
    (row) =>
      row.source === 'packages/preferences/src/preferences.controller.ts' &&
      row.className === 'PreferencesController',
  );
  if (
    !guarded ||
    !preferences ||
    Object.getPrototypeOf(guarded.prototype) !== preferences.prototype ||
    Object.getPrototypeOf(guarded.constructor) !== preferences.constructor ||
    guarded.methods.size !== 0 ||
    preferences.methods.size !== 7
  )
    refuse('PREFERENCES_INHERITANCE');
  for (const [name, callback] of preferences.methods)
    if (Object.hasOwn(guarded.prototype, name) || guarded.prototype[name] !== callback)
      refuse('PREFERENCES_SHADOW');
  return { root, bindings, rows, snapshots };
}

// Descriptor-only traversal must never invoke a newly installed handler getter.
function ancestry(object) {
  const result = [];
  while (object !== null) {
    if (types.isProxy(object) || result.includes(object)) refuse('PROTOTYPE_CHAIN');
    result.push(object);
    object = Object.getPrototypeOf(object);
  }
  return result;
}

function sameAncestry(object, expected) {
  const actual = ancestry(object);
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  );
}

function effectiveHandler(instance, name) {
  const chain = ancestry(instance);
  const descriptors = chain.map((object) => Object.getOwnPropertyDescriptor(object, name));
  const effective = descriptors.find((descriptor) => descriptor !== undefined);
  if (!effective || !Object.hasOwn(effective, 'value') || typeof effective.value !== 'function')
    refuse('HANDLER_DESCRIPTOR');
  return { name, chain, descriptors, callback: effective.value };
}

/** ModulesContainer is obtained by the actual fixed census, never reconstructed. */
export function observeReferenceRegistryObjects(job, modules) {
  if (arguments.length !== 2 || !(modules instanceof Map) || types.isProxy(modules))
    refuse('MODULE_CONTAINER');
  const state = actualClasses(job);
  const controllers = [],
    providers = [],
    moduleRows = [];
  state.moduleSnapshots = [];
  state.mountedSnapshots = [];
  let objectId = 0;
  const ids = new Map();
  const id = (value) => {
    if (!ids.has(value)) ids.set(value, ++objectId);
    return ids.get(value);
  };
  for (const [key, module] of modules) {
    if (
      !(module.controllers instanceof Map) ||
      !(module.providers instanceof Map) ||
      !(module.imports instanceof Set) ||
      !(module.exports instanceof Set)
    )
      refuse('MODULE_SHAPE');
    state.moduleSnapshots.push({
      key,
      module,
      metatype: module.metatype,
      controllers: [...module.controllers],
      providers: [...module.providers],
      imports: [...module.imports],
      exports: [...module.exports],
      wrappers: [...module.controllers.values(), ...module.providers.values()].map((wrapper) => ({
        wrapper,
        metatype: wrapper.metatype,
        instance: wrapper.instance,
        token: wrapper.token,
        inject: wrapper.inject && [...wrapper.inject],
        isAlias: wrapper.isAlias,
      })),
    });
    const moduleId = id(module);
    moduleRows.push({
      moduleId,
      key: typeof key === 'string' ? key : 'UNRESOLVED_NONSTRING_KEY',
      constructor: state.bindings.get(module.metatype)?.className ?? null,
      constructorProvenance: state.bindings.has(module.metatype)
        ? 'ACTUAL_NAMED_EXPORT'
        : 'UNRESOLVED_FRAMEWORK_OR_DYNAMIC',
      imports: [...module.imports].map(id),
      exportCount: module.exports.size,
    });
    for (const [token, wrapper] of module.controllers) {
      const binding = state.bindings.get(wrapper.metatype);
      if (
        !binding ||
        (!binding.row.controller && !binding.row.guardedPreferences) ||
        !wrapper.instance ||
        Object.getPrototypeOf(wrapper.instance) !== binding.prototype ||
        (token !== wrapper.metatype && token !== wrapper.token)
      )
        refuse('MOUNTED_CONTROLLER');
      const inherited = [];
      const handlers = [];
      let origin = binding.prototype;
      while (origin && origin !== Object.prototype) {
        const declaration = state.bindings.get(
          Object.getOwnPropertyDescriptor(origin, 'constructor')?.value,
        );
        if (!declaration) refuse('DECLARING_CONTROLLER');
        for (const [name, callback] of declaration.methods)
          if (!inherited.some((row) => row.name === name)) {
            const observed = effectiveHandler(wrapper.instance, name);
            if (observed.callback !== callback) refuse('HANDLER_IDENTITY');
            handlers.push(observed);
            inherited.push({
              name,
              declaringSource: declaration.source,
              declaringClass: declaration.className,
              functionId: id(callback),
            });
          }
        origin = Object.getPrototypeOf(origin);
      }
      state.mountedSnapshots.push({
        instance: wrapper.instance,
        ancestry: ancestry(wrapper.instance),
        handlers,
      });
      controllers.push({
        moduleId,
        wrapperId: id(wrapper),
        instanceId: id(wrapper.instance),
        constructorId: id(wrapper.metatype),
        source: binding.source,
        className: binding.className,
        methods: inherited,
        actualConstructorPrototypeHandlersObserved: true,
      });
    }
    for (const wrapper of module.providers.values()) {
      const binding = state.bindings.get(wrapper.metatype);
      const instance = wrapper.instance;
      const kind =
        binding && instance && Object.getPrototypeOf(instance) === binding.prototype
          ? 'ACTUAL_NAMED_CLASS_EXPORT'
          : wrapper.isAlias
            ? 'OBSERVED_USE_EXISTING_ALIAS'
            : Array.isArray(wrapper.inject)
              ? 'OBSERVED_FACTORY_WITH_UNBOUND_DECLARATION'
              : instance !== undefined && wrapper.metatype == null
                ? 'OBSERVED_VALUE_WITH_UNBOUND_DECLARATION'
                : 'UNRESOLVED_FRAMEWORK_OR_DYNAMIC';
      providers.push({
        moduleId,
        wrapperId: id(wrapper),
        instanceId: instance === undefined ? null : id(instance),
        metatypeId: wrapper.metatype == null ? null : id(wrapper.metatype),
        provenance: kind,
        source: binding?.source ?? null,
        exportName: binding?.className ?? null,
        declarationVerified: kind === 'ACTUAL_NAMED_CLASS_EXPORT',
        alias: wrapper.isAlias === true,
        injectionCount: Array.isArray(wrapper.inject) ? wrapper.inject.length : null,
      });
    }
  }
  state.modules = modules;
  state.report = {
    schemaVersion: 1,
    scope: 'reference-actual-object-registry-diagnostic',
    modules: moduleRows,
    constructors: state.rows,
    controllers,
    providers,
    unresolvedProviderCount: providers.filter((row) => !row.declarationVerified).length,
    complete: false,
    parentCorroborationRequired: true,
    sourceMapFunctionCorrespondence: 'UNVERIFIED',
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  };
  const handle = Object.freeze(Object.create(null));
  registries.set(handle, state);
  return handle;
}

export function referenceRegistryControllerBindings(handle) {
  const state = registries.get(handle);
  if (!state) refuse('HANDLE');
  if (state.failure) refuse('STICKY_DRIFT');
  return [...state.bindings.values()]
    .filter((row) => row.row.controller || row.row.guardedPreferences)
    .map((row) =>
      Object.freeze({
        controller: row.constructor,
        source: row.source,
        sourceSha256: row.sourceSha256,
        className: row.className,
      }),
    );
}

export function observeReferenceRegistry(handle) {
  const state = registries.get(handle);
  if (!state) refuse('HANDLE');
  if (state.failure) refuse('STICKY_DRIFT');
  try {
    for (const row of state.snapshots) {
      for (const file of [row.unit.source, row.unit.emitted, row.unit.map])
        readBound(state.root, file);
      if (
        require.cache[row.cached.filename] !== row.cached ||
        !row.cached.loaded ||
        row.cached.exports !== row.exports ||
        !sameAncestry(row.constructor, row.constructorAncestry) ||
        !sameAncestry(row.prototype, row.prototypeAncestry) ||
        !isDeepStrictEqual(
          Object.getOwnPropertyDescriptors(row.constructor),
          row.constructorDescriptors,
        ) ||
        !isDeepStrictEqual(
          Object.getOwnPropertyDescriptor(row.cached.exports, row.row.exportName),
          row.descriptor,
        ) ||
        !isDeepStrictEqual(
          Object.getOwnPropertyDescriptors(row.prototype),
          row.prototypeDescriptors,
        )
      )
        refuse('OBJECT_DRIFT');
    }
    const sameValues = (actual, expected) =>
      actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]);
    const sameEntries = (actual, expected) =>
      actual.length === expected.length &&
      actual.every(
        ([key, value], index) => key === expected[index][0] && value === expected[index][1],
      );
    if (
      !sameValues(
        [...state.modules.keys()],
        state.moduleSnapshots.map((row) => row.key),
      )
    )
      refuse('MODULE_POPULATION_DRIFT');
    for (const row of state.moduleSnapshots) {
      if (
        state.modules.get(row.key) !== row.module ||
        row.module.metatype !== row.metatype ||
        !sameEntries([...row.module.controllers], row.controllers) ||
        !sameEntries([...row.module.providers], row.providers) ||
        !sameValues([...row.module.imports], row.imports) ||
        !sameValues([...row.module.exports], row.exports)
      )
        refuse('MODULE_POPULATION_DRIFT');
      for (const item of row.wrappers)
        if (
          item.wrapper.metatype !== item.metatype ||
          item.wrapper.instance !== item.instance ||
          item.wrapper.token !== item.token ||
          item.wrapper.isAlias !== item.isAlias ||
          (item.inject === undefined
            ? item.wrapper.inject !== undefined
            : !Array.isArray(item.wrapper.inject) ||
              !sameValues([...item.wrapper.inject], item.inject))
        )
          refuse('WRAPPER_DRIFT');
    }
    for (const row of state.mountedSnapshots) {
      if (!sameAncestry(row.instance, row.ancestry)) refuse('INSTANCE_PROTOTYPE_DRIFT');
      for (const handler of row.handlers) {
        const actual = effectiveHandler(row.instance, handler.name);
        if (
          actual.callback !== handler.callback ||
          !sameAncestry(row.instance, handler.chain) ||
          !isDeepStrictEqual(actual.descriptors, handler.descriptors)
        )
          refuse('EFFECTIVE_HANDLER_DRIFT');
      }
    }
    return structuredClone(state.report);
  } catch (error) {
    // Restoring an object after a failed final check cannot erase the refusal.
    state.failure = true;
    throw error;
  }
}
