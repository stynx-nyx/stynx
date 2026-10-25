import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { globSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, matchesGlob, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { isDeepStrictEqual, types } from 'node:util';
import { repairSourceMap } from './native-source-map.mjs';

/**
 * @typedef {{physical:string, sha256:string}} InputSnapshot
 * @typedef {{kind:'fileExists'|'directoryExists',path:string,serialized:string}} ResolutionObservation
 * @typedef {{args:Parameters<typeof ts.sys.readDirectory>,result:string[]}} DirectoryObservation
 * @typedef {{source:string,output:string,map:string,sourceBytes:Buffer,outputBytes:Buffer,mapBytes:Buffer,coverage?:{codeSha256:string,originalMapSha256:string,rebasedMapSha256:string}}} NativeBinding
 * @typedef {{key:string|{type:string},enumerable:boolean|undefined,configurable:boolean|undefined,writable?:boolean|undefined,value?:Snapshot,accessor?:boolean,get?:string,set?:string}} SnapshotField
 * @typedef {null|string|number|boolean|{type:string,value?:string}|{reference:number|undefined}|{reference:number,array:boolean,fields:SnapshotField[]}} Snapshot
 * @typedef {{id:string,status:'PENDING'|'ACCEPTED'|'REFUSED',capture?:{status:'PENDING'|'COMPLETE'|'REFUSED',name?:unknown,message?:unknown},actual?:Snapshot,source?:string,compiler?:Snapshot,prototypeTreatment?:string,incomingPrototype?:{category:string,identity:number|null|undefined},derived?:Snapshot,ledger?:ReturnType<typeof repairSourceMap>['ledger'],oldSegmentCount?:number,newSegmentCount?:number,originalMap?:Snapshot,actualResultSha256?:string,originalMapSha256?:string,sourceSha256?:string,compilerCodeSha256?:string,derivedMapSha256?:string,refusal?:{name:unknown,message:unknown}}} TransformObservation
 * @typedef {ReturnType<typeof import('unplugin-swc').default.vite>} SwcPlugin
 */

/** @param {import("node:crypto").BinaryLike} bytes */
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** @param {string} message @returns {never} */
const fail = (message) => {
  throw new Error(`Native coverage: ${message}`);
};
/** @param {unknown} value */
const portable = (value) =>
  typeof value === 'string' &&
  value !== '' &&
  !isAbsolute(value) &&
  !/[:\\?#]/u.test(value) &&
  !value.includes('\0') &&
  value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

/** @param {unknown} value @returns {value is Record<PropertyKey,unknown>} */
function opaqueRecord(value) {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

/** @param {unknown} value @returns {value is unknown[]} */
function unknownArray(value) {
  return Array.isArray(value);
}

/** @param {unknown} value @returns {Record<PropertyKey,TypedPropertyDescriptor<unknown>>} */
function ownDescriptors(value) {
  return Object.getOwnPropertyDescriptors(value);
}

/** @template T @param {T|undefined} value @returns {T} */
function constructedValue(value) {
  if (value === undefined) fail('constructed coverage entry is missing');
  return value;
}

/** @param {unknown} value @param {string} key @returns {unknown} */
function nativeProperty(value, key) {
  if (value === null || value === undefined)
    throw new TypeError(`Cannot read properties of ${value} (reading '${key}')`);
  /** @type {unknown} */
  const receiver = Object(value);
  if (!opaqueRecord(receiver)) fail('native property boxing did not create an object');
  return Reflect.get(receiver, key, value);
}

/** @param {unknown} value @param {string} key @returns {unknown} */
function nativeOptionalProperty(value, key) {
  return value == null ? undefined : nativeProperty(value, key);
}

/** @param {unknown} message @returns {unknown} */
function nativeCoveragePrefix(message) {
  const method = nativeProperty(message, 'startsWith');
  if (typeof method !== 'function')
    throw new TypeError('error.message.startsWith is not a function');
  return Reflect.apply(method, message, ['Native coverage:']);
}

/** @param {string} root @param {string} name */
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

/** @param {string} root @param {string[]} includes @param {string[]} excludes */
function sourceCensus(root, includes, excludes) {
  const files = new Set(
    globSync(includes, { cwd: root }).filter(
      (name) => !excludes.some((pattern) => matchesGlob(name.split(sep).join('/'), pattern)),
    ),
  );
  return [...files].map((name) => regularPath(root, name.split(sep).join('/'))).sort();
}

/** @param {ts.Diagnostic} diagnostic */
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

/** @param {readonly ts.Diagnostic[]} diagnostics @param {ReturnType<typeof diagnosticRecord>[]} records */
function acceptDiagnostics(diagnostics, records) {
  records.push(...diagnostics.map(diagnosticRecord));
  if (diagnostics.some((entry) => entry.category === ts.DiagnosticCategory.Error)) {
    fail(records.map((entry) => `${entry.code}: ${entry.message}`).join('\n'));
  }
}

/** @param {Buffer} mapBytes @param {string} source @param {string} output */
function parseNativeMap(mapBytes, source, output) {
  /** @type {unknown} */
  let map;
  try {
    map = JSON.parse(mapBytes.toString('utf8'));
  } catch {
    fail('malformed native source map');
  }
  if (
    !map ||
    !opaqueRecord(map) ||
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
    !unknownArray(map.names) ||
    !map.names.every((name) => typeof name === 'string') ||
    !unknownArray(map.sources) ||
    map.sources.length !== 1 ||
    typeof map.sources[0] !== 'string' ||
    typeof map.sourceRoot !== 'string' ||
    map.sections !== undefined ||
    /[?#]/u.test(map.sources[0]) ||
    map.sources[0].includes('\0') ||
    /[?#]/u.test(map.sourceRoot) ||
    map.sourceRoot.includes('\0') ||
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
    (!unknownArray(map.sourcesContent) ||
      map.sourcesContent.length !== 1 ||
      map.sourcesContent[0] !== readFileSync(source, 'utf8'))
  ) {
    fail('native map source content differs');
  }
  return map;
}

/** Opt-in execution representations; the caller supplies the unchanged source population.
 * @param {{packageDir:string,modules:{source:string,output:string}[],includes:string[],excludes:string[]}} options
 */
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
  /** @type {Map<string,InputSnapshot>} */
  const snapshots = new Map();
  /** @type {Map<string,ResolutionObservation>} */
  const observations = new Map();
  /** @type {Map<string,DirectoryObservation>} */
  const directoryReads = new Map();
  /** @type {ReturnType<typeof diagnosticRecord>[]} */
  const diagnostics = [];
  /** @type {TransformObservation[]} */
  const sourceTransforms = [];
  /** @type {Map<string,Snapshot|undefined>} */
  const sourceResults = new Map();
  /** @type {WeakMap<object,number>} */
  const prototypeIdentities = new WeakMap();
  /** @type {unknown} */
  let sourceFailure;
  /** @param {string} path */
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
  /** @param {ResolutionObservation["kind"]} kind @param {string} path @param {boolean} value */
  const observe = (kind, path, value) => {
    const key = `${kind}:${resolve(path)}`;
    const serialized = JSON.stringify(value);
    if (observations.has(key) && constructedValue(observations.get(key)).serialized !== serialized)
      fail(`resolution changed: ${path}`);
    observations.set(key, { kind, path: resolve(path), serialized });
    return value;
  };
  /** @type {NativeBinding[]} */
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
  for (const path of [
    fileURLToPath(import.meta.url),
    fileURLToPath(new URL('./native-source-map.mjs', import.meta.url)),
    fileURLToPath(new URL('../../package.json', import.meta.url)),
    fileURLToPath(new URL('../../pnpm-lock.yaml', import.meta.url)),
    fileURLToPath(
      import.meta.resolve(
        new URL(
          './dist/sourcemap-codec.umd.js',
          import.meta.resolve('@jridgewell/sourcemap-codec/package.json'),
        ).href,
      ),
    ),
    fileURLToPath(import.meta.resolve('@jridgewell/sourcemap-codec/package.json')),
    fileURLToPath(import.meta.resolve('@jridgewell/sourcemap-codec')),
  ])
    remember(path);
  const compiler = fileURLToPath(import.meta.resolve('typescript'));
  remember(compiler);
  remember(resolve(dirname(compiler), '../package.json'));
  const configPath = regularPath(root, 'tsconfig.json');
  /** @type {ts.System} */
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
        if (nativeProperty(error, 'code') === 'ENOENT') {
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
  /** @param {ts.CompilerOptions} options */
  const makeProgram = (options) => {
    const host = ts.createCompilerHost(options);
    host.readFile = system.readFile;
    host.readDirectory = system.readDirectory;
    host.fileExists = system.fileExists;
    host.directoryExists = system.directoryExists;
    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options,
      ...(parsed.projectReferences === undefined
        ? {}
        : { projectReferences: parsed.projectReferences }),
      host,
    });
    acceptDiagnostics(ts.getPreEmitDiagnostics(program), diagnostics);
    for (const source of program.getSourceFiles()) {
      if (remember(source.fileName).toString('utf8') !== source.getFullText())
        fail('Program input differs from physical source');
    }
    return program;
  };
  /** @param {ts.Program} program @param {string} source @param {string[]} expected */
  const emit = (program, source, expected) => {
    const file = program.getSourceFile(source);
    if (!file || file.getFullText() !== remember(source).toString('utf8'))
      fail('requested source is absent from the actual Program');
    /** @type {Map<string,string>} */
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
  /** @param {NativeBinding} binding */
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
  /** @type {Map<string,{code:string,map:Record<string,unknown>,originalMapText:string}>} */
  const transformed = new Map();
  for (const binding of bindings) {
    const outputs = emit(coverage, binding.source, [binding.output, binding.map]);
    const code = constructedValue(outputs.get(binding.output));
    const originalMapText = constructedValue(outputs.get(binding.map));
    /** @type {unknown} */
    const originalMap = JSON.parse(originalMapText);
    if (
      nativeProperty(originalMap, 'version') !== 3 ||
      nativeOptionalProperty(nativeProperty(originalMap, 'sources'), 'length') !== 1 ||
      nativeOptionalProperty(nativeProperty(originalMap, 'sourcesContent'), 'length') !== 1 ||
      nativeProperty(nativeProperty(originalMap, 'sourcesContent'), '0') !==
        binding.sourceBytes.toString('utf8')
    )
      fail('coverage map is not bound to exact original source');
    parseNativeMap(Buffer.from(originalMapText), binding.source, binding.output);
    if (!opaqueRecord(originalMap)) fail('native compiler map is not an object');
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
  /** @param {string} id */
  const classify = (id) => {
    if (owned.has(id)) return true;
    /** @type {string} */
    let possible;
    try {
      if (id.startsWith('file:')) possible = fileURLToPath(new URL(id));
      else
        possible = decodeURIComponent(
          constructedValue(id.replace(/^\/@fs/u, '').split(/[?#]/u)[0]),
        );
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
      if (nativeCoveragePrefix(nativeProperty(error, 'message'))) throw error;
    }
    return false;
  };
  const plugin = {
    name: 'stynx:finite-native-coverage',
    enforce: 'pre',
    buildStart() {
      verify();
    },
    /** @param {string} code @param {string} id */
    transform(code, id) {
      if (!classify(id)) return null;
      verify();
      const binding = bindings.find((entry) => entry.source === id);
      if (!binding) return null;
      if (code !== binding.sourceBytes.toString('utf8'))
        fail('received source differs from admitted Program source');
      const result = constructedValue(transformed.get(id));
      return { code: result.code, map: structuredClone(result.map) };
    },
  };
  /** @param {SwcPlugin} swc */
  const wrapSwc = (swc) => {
    const hook = swc.transform;
    const handler = typeof hook === 'function' ? hook : hook?.handler;
    if (typeof handler !== 'function') fail('installed SWC transform hook is unsupported');
    /** @type {typeof handler} */
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
    compiler: {
      version: ts.version,
      path: compiler,
      sha256: constructedValue(snapshots.get(compiler)).sha256,
    },
    directoryReads: [...directoryReads.values()],
    config: configPath,
    productionOptions: parsed.options,
    coverageOptions,
    diagnostics,
    sourceTransforms,
    inputs: [...snapshots].map(([path, entry]) => ({ path, ...entry })),
    bindings: bindings.map((binding) => {
      const { source, output, map, sourceBytes, outputBytes, mapBytes, coverage: proof } = binding;
      /** @type {unknown} */
      const original = JSON.parse(mapBytes.toString('utf8'));
      const derived = conversionMap(binding);
      if (!opaqueRecord(original)) fail('admitted native map is not an object');
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
  /** @param {string} id */
  const nativeTransform = (id) => {
    if (!classify(id)) return null;
    const binding = bindings.find((entry) => entry.output === id);
    if (!binding) return null;
    verify();
    const code = readFileSync(binding.output, 'utf8');
    const map = conversionMap(binding);
    return { code, map: structuredClone(map) };
  };
  /** @param {string} id */
  const isSourceTransform = (id) => classify(id) && transformed.has(id);
  /** @param {unknown} value @param {Map<object,number>} [seen] @param {number} [depth] @returns {Snapshot} */
  const snapshot = (value, seen = new Map(), depth = 0) => {
    if (value === undefined) return { type: 'undefined' };
    if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0)))
      return { type: 'number', value: Object.is(value, -0) ? '-0' : String(value) };
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      typeof value === 'number'
    )
      return value;
    if (typeof value !== 'object') return { type: typeof value };
    if (types.isProxy(value)) return { type: 'refused-proxy' };
    if (seen.has(value)) return { reference: seen.get(value) };
    if (depth > 16) return { type: 'refused-depth' };
    const reference = seen.size;
    seen.set(value, reference);
    const descriptors = ownDescriptors(value);
    return {
      reference,
      array: Array.isArray(value),
      fields: Reflect.ownKeys(descriptors).map((key) => {
        const descriptor = constructedValue(descriptors[key]);
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
  /** @param {string} id @param {unknown} actual */
  const repairSourceTransform = (id, actual) => {
    if (sourceFailure) throw sourceFailure;
    /** @type {TransformObservation} */
    const observation = { id, status: 'PENDING' };
    sourceTransforms.push(observation);
    try {
      observation.capture = { status: 'PENDING' };
      observation.actual = snapshot(actual);
      observation.capture.status = 'COMPLETE';
      if (!isSourceTransform(id)) fail('source transform is outside the admitted census');
      verify();
      const binding = constructedValue(bindings.find((entry) => entry.source === id));
      const compiler = constructedValue(transformed.get(id));
      observation.source = binding.sourceBytes.toString('utf8');
      observation.compiler = snapshot(compiler);
      if (
        types.isProxy(actual) ||
        !actual ||
        Object.getPrototypeOf(actual) !== Object.prototype ||
        !opaqueRecord(actual)
      )
        fail('public source transform must be an ordinary result');
      const descriptors = ownDescriptors(actual);
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
          !unknownArray(values) ||
          Object.getPrototypeOf(values) !== Array.prototype
        )
          fail('public source dependency metadata must be a dense array');
        const entries = ownDescriptors(values);
        if (
          Reflect.ownKeys(entries).length !== values.length + 1 ||
          Array.from({ length: values.length }, (_, index) => entries[index]).some(
            (entry) =>
              !entry || !('value' in entry) || !entry.enumerable || typeof entry.value !== 'string',
          )
        )
          fail('unsupported public source dependency metadata');
      }
      const originalMap = constructedValue(descriptors.map).value;
      if (types.isProxy(originalMap) || !originalMap || typeof originalMap !== 'object')
        fail('public source map must be a retained map record');
      /** @type {unknown} */
      const originalPrototype = Object.getPrototypeOf(originalMap);
      if (originalPrototype !== null && !opaqueRecord(originalPrototype))
        fail('native prototype is not an object');
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
      const mapDescriptors = ownDescriptors(originalMap);
      /** @type {Record<PropertyKey,unknown>} */
      const plainMap = {};
      Object.defineProperties(plainMap, mapDescriptors);
      const result = repairSourceMap({
        sourceName: id,
        source: observation.source,
        compiler: { code: compiler.code, map: compiler.map },
        actual: { code: actual.code, map: plainMap },
      });
      const retainedSources = plainMap.sources;
      if (!unknownArray(retainedSources) || typeof retainedSources[0] !== 'string')
        fail('validated source-map source is missing');
      const source = retainedSources[0],
        sourceRoot = Object.hasOwn(plainMap, 'sourceRoot') ? (plainMap.sourceRoot ?? '') : '';
      if (typeof sourceRoot !== 'string') fail('validated source-map root is not a string');
      if (
        /[?#]/u.test(source) ||
        source.includes('\0') ||
        /[?#]/u.test(sourceRoot) ||
        sourceRoot.includes('\0') ||
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
      /** @type {Record<PropertyKey,unknown>} */
      const repaired = {};
      Object.defineProperties(repaired, {
        ...descriptors,
        map: { ...descriptors.map, value: derivedMap },
      });
      return repaired;
    } catch (error) {
      sourceFailure ??= error;
      observation.status = 'REFUSED';
      if (observation.capture?.status !== 'COMPLETE')
        observation.capture = {
          status: 'REFUSED',
          name: nativeProperty(sourceFailure, 'name'),
          message: nativeProperty(sourceFailure, 'message'),
        };
      observation.refusal = {
        name: nativeProperty(sourceFailure, 'name'),
        message: nativeProperty(sourceFailure, 'message'),
      };
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
