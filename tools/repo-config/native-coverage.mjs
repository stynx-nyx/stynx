import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { globSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, matchesGlob, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { isDeepStrictEqual, types } from 'node:util';
import { repairSourceMap } from './native-source-map.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => {
  throw new Error(`Native coverage: ${message}`);
};
const portable = (value) =>
  typeof value === 'string' &&
  value !== '' &&
  !isAbsolute(value) &&
  !/[:\\?#\u0000]/u.test(value) &&
  value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

function regularPath(root, name) {
  if (!portable(name)) fail('expected an exact portable package-relative path');
  let path = root;
  for (const part of name.split('/')) {
    path = resolve(path, part);
    if (lstatSync(path).isSymbolicLink()) fail(`symbolic link in declared path: ${name}`);
  }
  if (!lstatSync(path).isFile() || realpathSync(path) !== path)
    fail(`not a regular physical file: ${name}`);
  return path;
}

function sourceCensus(root, includes, excludes) {
  const files = new Set(
    globSync(includes, { cwd: root }).filter(
      (name) => !excludes.some((pattern) => matchesGlob(name.split(sep).join('/'), pattern)),
    ),
  );
  return [...files].map((name) => regularPath(root, name.split(sep).join('/'))).sort();
}

function diagnosticRecord(diagnostic) {
  return {
    category: ts.DiagnosticCategory[diagnostic.category],
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    file: diagnostic.file?.fileName,
    start: diagnostic.start,
    length: diagnostic.length,
  };
}

function acceptDiagnostics(diagnostics, records) {
  records.push(...diagnostics.map(diagnosticRecord));
  if (diagnostics.some((entry) => entry.category === ts.DiagnosticCategory.Error)) {
    fail(records.map((entry) => `${entry.code}: ${entry.message}`).join('\n'));
  }
}

function parseNativeMap(mapBytes, source, output) {
  let map;
  try {
    map = JSON.parse(mapBytes.toString('utf8'));
  } catch {
    fail('malformed native source map');
  }
  if (
    !map ||
    Object.keys(map).some(
      (key) =>
        ![
          'version',
          'file',
          'sourceRoot',
          'sources',
          'sourcesContent',
          'names',
          'mappings',
        ].includes(key),
    ) ||
    map.version !== 3 ||
    map.file !== basename(output) ||
    typeof map.mappings !== 'string' ||
    !Array.isArray(map.names) ||
    !map.names.every((name) => typeof name === 'string') ||
    !Array.isArray(map.sources) ||
    map.sources.length !== 1 ||
    typeof map.sources[0] !== 'string' ||
    typeof map.sourceRoot !== 'string' ||
    map.sections !== undefined ||
    /[?#\u0000]/u.test(map.sources[0]) ||
    /[?#\u0000]/u.test(map.sourceRoot) ||
    isAbsolute(map.sources[0]) ||
    isAbsolute(map.sourceRoot) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(map.sources[0]) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(map.sourceRoot)
  )
    fail('unsupported native source map binding');
  const mapped = resolve(dirname(output), map.sourceRoot, map.sources[0]);
  if (mapped !== source || realpathSync(mapped) !== source)
    fail('native map points to another source');
  if (
    map.sourcesContent !== undefined &&
    (!Array.isArray(map.sourcesContent) ||
      map.sourcesContent.length !== 1 ||
      map.sourcesContent[0] !== readFileSync(source, 'utf8'))
  ) {
    fail('native map source content differs');
  }
  return map;
}

/** Opt-in execution representations; the caller supplies the unchanged source population. */
export function createNativeCoverage({ packageDir, modules, includes, excludes }) {
  if (!Array.isArray(modules) || modules.length === 0) fail('bindings must be a nonempty array');
  for (const array of [modules, includes, excludes]) {
    if (!Array.isArray(array) || Object.getPrototypeOf(array) !== Array.prototype)
      fail('declarations must be ordinary arrays');
    const descriptors = Object.getOwnPropertyDescriptors(array);
    if (
      Reflect.ownKeys(descriptors).length !== array.length + 1 ||
      Array.from({ length: array.length }, (_, index) => descriptors[index]).some(
        (entry) => !entry || !('value' in entry) || !entry.enumerable,
      )
    )
      fail('declarations cannot contain accessors, holes or extra properties');
  }
  const root = realpathSync(resolve(packageDir));
  const readCandidate = () =>
    execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const candidate = readCandidate();
  const snapshots = new Map();
  const observations = new Map();
  const directoryReads = new Map();
  const diagnostics = [];
  const sourceTransforms = [];
  const sourceResults = new Map();
  const prototypeIdentities = new WeakMap();
  let sourceFailure;
  const remember = (path) => {
    const absolute = resolve(path);
    const bytes = readFileSync(absolute);
    const entry = { physical: realpathSync(absolute), sha256: hash(bytes) };
    const prior = snapshots.get(absolute);
    if (prior && (prior.physical !== entry.physical || prior.sha256 !== entry.sha256))
      fail(`input changed: ${absolute}`);
    snapshots.set(absolute, entry);
    return bytes;
  };
  const observe = (kind, path, value) => {
    const key = `${kind}:${resolve(path)}`;
    const serialized = JSON.stringify(value);
    if (observations.has(key) && observations.get(key).serialized !== serialized)
      fail(`resolution changed: ${path}`);
    observations.set(key, { kind, path: resolve(path), serialized });
    return value;
  };
  const bindings = modules.map((entry) => {
    if (
      !entry ||
      Object.getPrototypeOf(entry) !== Object.prototype ||
      Object.keys(entry).sort().join(',') !== 'output,source' ||
      Reflect.ownKeys(entry).length !== 2 ||
      Object.values(Object.getOwnPropertyDescriptors(entry)).some(
        (descriptor) => !('value' in descriptor) || !descriptor.enumerable,
      ) ||
      typeof entry.source !== 'string' ||
      typeof entry.output !== 'string' ||
      !entry.source.endsWith('.ts') ||
      entry.source.endsWith('.d.ts') ||
      !entry.output.endsWith('.js')
    )
      fail('binding requires exactly source.ts and output.js');
    const source = regularPath(root, entry.source);
    const output = regularPath(root, entry.output);
    const map = regularPath(root, `${entry.output}.map`);
    const sourceBytes = remember(source),
      outputBytes = remember(output),
      mapBytes = remember(map);
    parseNativeMap(mapBytes, source, output);
    return { source, output, map, sourceBytes, outputBytes, mapBytes };
  });
  const identities = bindings.flatMap(({ source, output, map }) => [source, output, map]);
  if (new Set(identities.map((name) => name.toLocaleLowerCase('en-US'))).size !== identities.length)
    fail('duplicate or ambiguous bindings');
  const sources = bindings.map((entry) => entry.source).sort();
  const census = sourceCensus(root, includes, excludes);
  if (JSON.stringify(sources) !== JSON.stringify(census))
    fail('bindings do not equal the original eligible source census');
  const toolingRequire = createRequire(import.meta.url);
  for (const path of [
    fileURLToPath(import.meta.url),
    fileURLToPath(new URL('./native-source-map.mjs', import.meta.url)),
    fileURLToPath(new URL('../../package.json', import.meta.url)),
    fileURLToPath(new URL('../../pnpm-lock.yaml', import.meta.url)),
    toolingRequire.resolve('@jridgewell/sourcemap-codec'),
    toolingRequire.resolve('@jridgewell/sourcemap-codec/package.json'),
  ])
    remember(path);
  const compiler = toolingRequire.resolve('typescript');
  remember(compiler);
  remember(resolve(dirname(compiler), '../package.json'));
  const configPath = regularPath(root, 'tsconfig.json');
  const system = {
    ...ts.sys,
    readDirectory(...args) {
      const key = JSON.stringify(args);
      const result = ts.sys.readDirectory(...args);
      const prior = directoryReads.get(key);
      if (prior && JSON.stringify(prior.result) !== JSON.stringify(result))
        fail('compiler directory population changed');
      directoryReads.set(key, { args: structuredClone(args), result: [...result] });
      return result;
    },
    readFile(path) {
      try {
        return remember(path).toString('utf8');
      } catch (error) {
        if (error.code === 'ENOENT') {
          observe('fileExists', path, false);
          return undefined;
        }
        throw error;
      }
    },
    fileExists(path) {
      return observe('fileExists', path, ts.sys.fileExists(path));
    },
    directoryExists(path) {
      return observe('directoryExists', path, ts.sys.directoryExists(path));
    },
  };
  const raw = ts.readConfigFile(configPath, system.readFile);
  acceptDiagnostics(raw.error ? [raw.error] : [], diagnostics);
  const parsed = ts.parseJsonConfigFileContent(raw.config, system, root, undefined, configPath);
  acceptDiagnostics(parsed.errors, diagnostics);
  if (
    parsed.options.outFile ||
    parsed.options.noEmit ||
    parsed.options.emitDeclarationOnly ||
    parsed.options.inlineSourceMap ||
    !parsed.options.sourceMap
  )
    fail('production compiler must emit separate JS and source maps');
  const makeProgram = (options) => {
    const host = ts.createCompilerHost(options);
    host.readFile = system.readFile;
    host.readDirectory = system.readDirectory;
    host.fileExists = system.fileExists;
    host.directoryExists = system.directoryExists;
    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options,
      projectReferences: parsed.projectReferences,
      host,
    });
    acceptDiagnostics(ts.getPreEmitDiagnostics(program), diagnostics);
    for (const source of program.getSourceFiles()) {
      if (remember(source.fileName).toString('utf8') !== source.getFullText())
        fail('Program input differs from physical source');
    }
    return program;
  };
  const emit = (program, source, expected) => {
    const file = program.getSourceFile(source);
    if (!file || file.getFullText() !== remember(source).toString('utf8'))
      fail('requested source is absent from the actual Program');
    const outputs = new Map();
    const result = program.emit(file, (path, bytes) => {
      const normalized = resolve(path);
      if (!expected.includes(normalized) || outputs.has(normalized))
        fail(`unexpected or duplicate emitted output: ${path}`);
      outputs.set(normalized, bytes);
    });
    acceptDiagnostics(result.diagnostics, diagnostics);
    if (result.emitSkipped || outputs.size !== expected.length)
      fail('incomplete requested Program emission');
    return outputs;
  };
  const production = makeProgram(parsed.options);
  for (const binding of bindings) {
    const expected = [binding.output, binding.map];
    if (parsed.options.declaration) {
      const declarationRoot = parsed.options.declarationDir ?? parsed.options.outDir;
      const declaration = resolve(
        declarationRoot ?? root,
        relative(parsed.options.outDir ?? root, binding.output).replace(/\.js$/u, '.d.ts'),
      );
      expected.push(declaration);
      if (parsed.options.declarationMap) expected.push(`${declaration}.map`);
    }
    const outputs = emit(production, binding.source, expected);
    for (const [path, bytes] of outputs) {
      if (!remember(path).equals(Buffer.from(bytes)))
        fail(`native build is stale or differs from exact production emission: ${path}`);
    }
  }
  const coverageOptions = {
    ...parsed.options,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    sourceMap: true,
    inlineSourceMap: false,
    inlineSources: true,
    declaration: false,
    declarationMap: false,
    noEmit: false,
    emitDeclarationOnly: false,
  };
  const coverage = makeProgram(coverageOptions);
  const conversionMap = (binding) => {
    const map = parseNativeMap(readFileSync(binding.map), binding.source, binding.output);
    if (!Object.hasOwn(map, 'sourcesContent')) {
      const bytes = readFileSync(binding.source);
      const content = bytes.toString('utf8');
      if (!bytes.equals(binding.sourceBytes) || !Buffer.from(content, 'utf8').equals(bytes))
        fail('native conversion source content changed after admission');
      map.sourcesContent = [content];
    }
    return map;
  };
  const transformed = new Map();
  for (const binding of bindings) {
    const outputs = emit(coverage, binding.source, [binding.output, binding.map]);
    const code = outputs.get(binding.output);
    const originalMapText = outputs.get(binding.map);
    const originalMap = JSON.parse(originalMapText);
    if (
      originalMap.version !== 3 ||
      originalMap.sources?.length !== 1 ||
      originalMap.sourcesContent?.length !== 1 ||
      originalMap.sourcesContent[0] !== binding.sourceBytes.toString('utf8')
    )
      fail('coverage map is not bound to exact original source');
    parseNativeMap(Buffer.from(originalMapText), binding.source, binding.output);
    const map = { ...originalMap, sourceRoot: '', sources: [binding.source] };
    transformed.set(binding.source, { code, map, originalMapText });
    binding.coverage = {
      codeSha256: hash(code),
      originalMapSha256: hash(originalMapText),
      rebasedMapSha256: hash(JSON.stringify(map)),
    };
  }
  const verify = () => {
    if (sourceFailure) throw sourceFailure;
    for (const [path, entry] of snapshots) {
      if (realpathSync(path) !== entry.physical || hash(readFileSync(path)) !== entry.sha256)
        fail(`input changed after admission: ${path}`);
    }
    for (const entry of directoryReads.values()) {
      if (JSON.stringify(ts.sys.readDirectory(...entry.args)) !== JSON.stringify(entry.result))
        fail('compiler directory population changed after admission');
    }
    for (const entry of observations.values()) {
      if (JSON.stringify(ts.sys[entry.kind](entry.path)) !== entry.serialized)
        fail(`resolution changed after admission: ${entry.path}`);
    }
    if (JSON.stringify(sourceCensus(root, includes, excludes)) !== JSON.stringify(census))
      fail('source population changed after admission');
    if (readCandidate() !== candidate) fail('candidate changed after admission');
  };
  const owned = new Set(bindings.flatMap(({ source, output }) => [source, output]));
  const classify = (id) => {
    if (owned.has(id)) return true;
    let possible = id;
    try {
      if (id.startsWith('file:')) possible = fileURLToPath(new URL(id));
      else possible = decodeURIComponent(id.replace(/^\/@fs/u, '').split(/[?#]/u)[0]);
      if (isAbsolute(possible)) {
        const normalized = resolve(possible);
        let physical;
        try {
          physical = realpathSync(normalized);
        } catch {
          physical = normalized;
        }
        if (owned.has(normalized) || owned.has(physical))
          fail(`unsupported owned module ID: ${id}`);
      }
    } catch (error) {
      if (error.message.startsWith('Native coverage:')) throw error;
    }
    return false;
  };
  const plugin = {
    name: 'stynx:finite-native-coverage',
    enforce: 'pre',
    buildStart() {
      verify();
    },
    transform(code, id) {
      if (!classify(id)) return null;
      verify();
      const binding = bindings.find((entry) => entry.source === id);
      if (!binding) return null;
      if (code !== binding.sourceBytes.toString('utf8'))
        fail('received source differs from admitted Program source');
      const result = transformed.get(id);
      return { code: result.code, map: structuredClone(result.map) };
    },
  };
  const wrapSwc = (swc) => {
    const hook = swc.transform;
    const handler = typeof hook === 'function' ? hook : hook?.handler;
    if (typeof handler !== 'function') fail('installed SWC transform hook is unsupported');
    const wrapped = function (code, id, ...args) {
      if (classify(id)) {
        verify();
        return null;
      }
      return handler.call(this, code, id, ...args);
    };
    return {
      ...swc,
      transform: typeof hook === 'function' ? wrapped : { ...hook, handler: wrapped },
    };
  };
  const evidence = {
    candidate,
    compiler: { version: ts.version, path: compiler, sha256: snapshots.get(compiler).sha256 },
    directoryReads: [...directoryReads.values()],
    config: configPath,
    productionOptions: parsed.options,
    coverageOptions,
    diagnostics,
    sourceTransforms,
    inputs: [...snapshots].map(([path, entry]) => ({ path, ...entry })),
    bindings: bindings.map((binding) => {
      const { source, output, map, sourceBytes, outputBytes, mapBytes, coverage: proof } = binding;
      const original = JSON.parse(mapBytes.toString('utf8'));
      const derived = conversionMap(binding);
      const materialized = !Object.hasOwn(original, 'sourcesContent');
      const projection = structuredClone(derived);
      if (materialized) delete projection.sourcesContent;
      if (JSON.stringify(projection) !== JSON.stringify(original))
        fail('native conversion map changed an existing map field');
      return {
        source,
        output,
        map,
        sourceSha256: hash(sourceBytes),
        nativeCodeSha256: hash(outputBytes),
        nativeMapSha256: hash(mapBytes),
        nativeOriginalMapText: mapBytes.toString('utf8'),
        nativeConversionMapText: JSON.stringify(derived),
        nativeConversionMapSha256: hash(JSON.stringify(derived)),
        nativeSourceContentMaterialized: materialized,
        nativeCodeUnits: outputBytes.toString('utf8').length,
        ...proof,
      };
    }),
  };
  verify();
  const nativeTransform = (id) => {
    if (!classify(id)) return null;
    const binding = bindings.find((entry) => entry.output === id);
    if (!binding) return null;
    verify();
    const code = readFileSync(binding.output, 'utf8');
    const map = conversionMap(binding);
    return { code, map: structuredClone(map) };
  };
  const isSourceTransform = (id) => classify(id) && transformed.has(id);
  const snapshot = (value, seen = new Map(), depth = 0) => {
    if (value === undefined) return { type: 'undefined' };
    if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0)))
      return { type: 'number', value: Object.is(value, -0) ? '-0' : String(value) };
    if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value;
    if (typeof value !== 'object') return { type: typeof value };
    if (types.isProxy(value)) return { type: 'refused-proxy' };
    if (seen.has(value)) return { reference: seen.get(value) };
    if (depth > 16) return { type: 'refused-depth' };
    const reference = seen.size;
    seen.set(value, reference);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return {
      reference,
      array: Array.isArray(value),
      fields: Reflect.ownKeys(descriptors).map((key) => {
        const descriptor = descriptors[key];
        return {
          key: typeof key === 'string' ? key : { type: 'symbol' },
          enumerable: descriptor.enumerable,
          configurable: descriptor.configurable,
          ...('value' in descriptor
            ? { writable: descriptor.writable, value: snapshot(descriptor.value, seen, depth + 1) }
            : { accessor: true, get: typeof descriptor.get, set: typeof descriptor.set }),
        };
      }),
    };
  };
  const repairSourceTransform = (id, actual) => {
    if (sourceFailure) throw sourceFailure;
    const observation = { id, status: 'PENDING' };
    sourceTransforms.push(observation);
    try {
      observation.capture = { status: 'PENDING' };
      observation.actual = snapshot(actual);
      observation.capture.status = 'COMPLETE';
      if (!isSourceTransform(id)) fail('source transform is outside the admitted census');
      verify();
      const binding = bindings.find((entry) => entry.source === id);
      const compiler = transformed.get(id);
      observation.source = binding.sourceBytes.toString('utf8');
      observation.compiler = snapshot(compiler);
      if (types.isProxy(actual) || !actual || Object.getPrototypeOf(actual) !== Object.prototype)
        fail('public source transform must be an ordinary result');
      const descriptors = Object.getOwnPropertyDescriptors(actual);
      const allowed = ['code', 'map', 'ssr', 'deps', 'dynamicDeps', '_vitest_tmp'];
      if (
        Reflect.ownKeys(actual).some((key) => typeof key !== 'string' || !allowed.includes(key)) ||
        !Object.hasOwn(descriptors, 'code') ||
        !Object.hasOwn(descriptors, 'map') ||
        Object.values(descriptors).some((entry) => !('value' in entry) || !entry.enumerable)
      )
        fail('unsupported public source transform fields or descriptors');
      if (Object.hasOwn(actual, 'ssr') && actual.ssr !== true)
        fail('public source transform is not SSR');
      if (
        Object.hasOwn(actual, '_vitest_tmp') &&
        actual._vitest_tmp !== undefined &&
        typeof actual._vitest_tmp !== 'string'
      )
        fail('unsupported public source transform cache metadata');
      for (const key of ['deps', 'dynamicDeps']) {
        if (!Object.hasOwn(actual, key)) continue;
        const values = actual[key];
        if (
          types.isProxy(values) ||
          !Array.isArray(values) ||
          Object.getPrototypeOf(values) !== Array.prototype
        )
          fail('public source dependency metadata must be a dense array');
        const entries = Object.getOwnPropertyDescriptors(values);
        if (
          Reflect.ownKeys(entries).length !== values.length + 1 ||
          Array.from({ length: values.length }, (_, index) => entries[index]).some(
            (entry) =>
              !entry || !('value' in entry) || !entry.enumerable || typeof entry.value !== 'string',
          )
        )
          fail('unsupported public source dependency metadata');
      }
      const originalMap = descriptors.map.value;
      if (types.isProxy(originalMap) || !originalMap || typeof originalMap !== 'object')
        fail('public source map must be a retained map record');
      const originalPrototype = Object.getPrototypeOf(originalMap);
      if (originalPrototype !== null && !prototypeIdentities.has(originalPrototype))
        prototypeIdentities.set(originalPrototype, sourceTransforms.length);
      observation.prototypeTreatment = 'IGNORED_OWN_DATA_ONLY';
      observation.incomingPrototype = {
        category:
          originalPrototype === null
            ? 'NULL'
            : originalPrototype === Object.prototype
              ? 'ORDINARY'
              : 'OPAQUE',
        identity: originalPrototype === null ? null : prototypeIdentities.get(originalPrototype),
      };
      const mapDescriptors = Object.getOwnPropertyDescriptors(originalMap);
      const plainMap = Object.defineProperties({}, mapDescriptors);
      const result = repairSourceMap({
        sourceName: id,
        source: observation.source,
        compiler: { code: compiler.code, map: compiler.map },
        actual: { code: actual.code, map: plainMap },
      });
      const source = plainMap.sources[0],
        sourceRoot = Object.hasOwn(plainMap, 'sourceRoot') ? (plainMap.sourceRoot ?? '') : '';
      if (
        /[?#\u0000]/u.test(source) ||
        /[?#\u0000]/u.test(sourceRoot) ||
        /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(source) ||
        /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(sourceRoot) ||
        resolve(dirname(id), sourceRoot, source) !== id ||
        realpathSync(resolve(dirname(id), sourceRoot, source)) !== id
      )
        fail('public source map does not resolve to the admitted source');
      const prior = sourceResults.get(id);
      if (prior && !isDeepStrictEqual(prior, observation.actual))
        fail('public source transform changed within the admitted collection');
      sourceResults.set(id, observation.actual);
      const derivedMap = result.map;
      if (
        Object.getPrototypeOf(originalMap) !== originalPrototype ||
        !isDeepStrictEqual(Object.getOwnPropertyDescriptors(originalMap), mapDescriptors)
      )
        fail('public source map changed during repair');
      observation.derived = snapshot(derivedMap);
      observation.ledger = result.ledger;
      observation.oldSegmentCount = result.oldSegmentCount;
      observation.newSegmentCount = result.newSegmentCount;
      observation.originalMap = snapshot(actual.map);
      observation.actualResultSha256 = hash(JSON.stringify(observation.actual));
      observation.originalMapSha256 = hash(JSON.stringify(observation.originalMap));
      observation.sourceSha256 = hash(binding.sourceBytes);
      observation.compilerCodeSha256 = hash(compiler.code);
      observation.derivedMapSha256 = hash(JSON.stringify(observation.derived));
      observation.status = 'ACCEPTED';
      verify();
      return Object.defineProperties(
        {},
        { ...descriptors, map: { ...descriptors.map, value: derivedMap } },
      );
    } catch (error) {
      sourceFailure ??= error;
      observation.status = 'REFUSED';
      if (observation.capture?.status !== 'COMPLETE')
        observation.capture = {
          status: 'REFUSED',
          name: sourceFailure.name,
          message: sourceFailure.message,
        };
      observation.refusal = { name: sourceFailure.name, message: sourceFailure.message };
      throw sourceFailure;
    }
  };
  return {
    plugin,
    wrapSwc,
    verify,
    nativeTransform,
    isSourceTransform,
    repairSourceTransform,
    evidence,
    include: bindings.flatMap(({ source, output }) => [source, output]),
  };
}
