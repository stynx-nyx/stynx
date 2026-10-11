import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { globSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, matchesGlob, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

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
  const compiler = createRequire(import.meta.url).resolve('typescript');
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
    transformed.set(binding.source, { code, map });
    binding.coverage = {
      codeSha256: hash(code),
      originalMapSha256: hash(originalMapText),
      rebasedMapSha256: hash(JSON.stringify(map)),
    };
  }
  const verify = () => {
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
    inputs: [...snapshots].map(([path, entry]) => ({ path, ...entry })),
    bindings: bindings.map(
      ({ source, output, map, sourceBytes, outputBytes, mapBytes, coverage: proof }) => ({
        source,
        output,
        map,
        sourceSha256: hash(sourceBytes),
        nativeCodeSha256: hash(outputBytes),
        nativeMapSha256: hash(mapBytes),
        nativeCodeUnits: outputBytes.toString('utf8').length,
        ...proof,
      }),
    ),
  };
  verify();
  const nativeTransform = (id) => {
    if (!classify(id)) return null;
    const binding = bindings.find((entry) => entry.output === id);
    if (!binding) return null;
    verify();
    const code = readFileSync(binding.output, 'utf8');
    const map = parseNativeMap(readFileSync(binding.map), binding.source, binding.output);
    return { code, map: structuredClone(map) };
  };
  return {
    plugin,
    wrapSwc,
    verify,
    nativeTransform,
    evidence,
    include: bindings.flatMap(({ source, output }) => [source, output]),
  };
}
