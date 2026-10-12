import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function refuse(message) {
  const error = new Error(message);
  error.code = 'HTTP_COMPILER_CUSTODY_INVALID';
  throw error;
}

function within(root, path) {
  const value = relative(root, path);
  return value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}

function localName(root, path) {
  if (!within(root, path)) refuse('Compiler member escapes the owned checkout');
  return relative(root, path).split(sep).join('/');
}

function fileRow(root, path) {
  const canonical = realpathSync(path);
  if (!within(root, canonical) || !lstatSync(path).isFile())
    refuse('Compiler member is not an owned regular file');
  const bytes = readFileSync(path);
  return { path: localName(root, canonical), sha256: sha256(bytes), byteLength: bytes.length };
}

function diagnosticRows(ts, diagnostics, root) {
  return diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    category: ts.DiagnosticCategory[diagnostic.category],
    file: diagnostic.file ? localName(root, realpathSync(diagnostic.file.fileName)) : null,
    start: diagnostic.start ?? null,
    length: diagnostic.length ?? null,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }));
}

function portableOptions(value, root) {
  if (Array.isArray(value)) return value.map((entry) => portableOptions(entry, root));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'configFile')
        .map(([key, entry]) => [key, portableOptions(entry, root)]),
    );
  if (typeof value === 'string' && isAbsolute(value)) return localName(root, value);
  return value;
}

function plainSnapshot(value, ancestors = new Set()) {
  if (value === null || value === undefined || ['string', 'boolean'].includes(typeof value))
    return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (
    typeof value !== 'object' ||
    ancestors.has(value) ||
    (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
  )
    refuse('Compiler plan must contain only plain acyclic data');
  ancestors.add(value);
  const result = Array.isArray(value) ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor))
      refuse('Compiler plan cannot contain accessors or hidden data');
    Object.defineProperty(result, key, {
      value: plainSnapshot(descriptor.value, ancestors),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  ancestors.delete(value);
  return result;
}

/**
 * Inspect the installed compiler's actual Program after the real build. This
 * helper never emits, supplies transforms, substitutes a config, or declares a
 * build successful. The supervisor must independently establish a fresh output
 * directory and bind tracked inputs before running the real manifest script.
 */
export function deriveHttpCompilerPlan({ checkoutRoot, packageRoot, configPath }) {
  const root = realpathSync(checkoutRoot);
  const project = realpathSync(resolve(root, packageRoot));
  const configuration = realpathSync(resolve(project, configPath));
  if (!within(root, project) || !within(project, configuration))
    refuse('Compiler project or entry config escapes its owned root');
  const requireFromCheckout = createRequire(resolve(root, 'package.json'));
  const compilerPath = realpathSync(requireFromCheckout.resolve('typescript'));
  if (!within(resolve(root, 'node_modules'), compilerPath))
    refuse('TypeScript resolves outside the private installation');
  const ts = requireFromCheckout('typescript');
  if (ts.version !== '6.0.3') refuse('HTTP builds require the pinned TypeScript 6.0.3');

  const configReads = new Map();
  const configDiagnostics = [];
  const host = {
    ...ts.sys,
    readFile(path, encoding) {
      const bytes = ts.sys.readFile(path, encoding);
      if (bytes !== undefined) {
        const row = fileRow(root, path);
        configReads.set(row.path, row);
      }
      return bytes;
    },
    onUnRecoverableConfigFileDiagnostic(diagnostic) {
      configDiagnostics.push(diagnostic);
    },
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(configuration, {}, host);
  if (!parsed || parsed.errors.length || configDiagnostics.length)
    refuse(
      `Invalid compiler config: ${JSON.stringify(diagnosticRows(ts, [...configDiagnostics, ...(parsed?.errors ?? [])], root))}`,
    );
  const options = parsed.options;
  if (
    options.incremental ||
    options.composite ||
    options.tsBuildInfoFile ||
    options.noEmit ||
    options.noCheck ||
    options.emitDeclarationOnly ||
    options.outFile ||
    options.inlineSourceMap ||
    options.inlineSources ||
    options.allowJs ||
    options.plugins?.length ||
    parsed.projectReferences?.length ||
    options.sourceMap !== true ||
    options.declaration !== true ||
    options.declarationMap !== true ||
    !options.outDir ||
    !options.rootDir ||
    options.module !== ts.ModuleKind.NodeNext ||
    options.moduleResolution !== ts.ModuleResolutionKind.NodeNext
  )
    refuse('Unsupported HTTP compiler emission configuration');
  const outputRoot = resolve(options.outDir);
  if (outputRoot !== resolve(project, 'dist'))
    refuse('HTTP build output must be the selected project dist directory');
  if (!within(root, resolve(options.rootDir))) refuse('Compiler rootDir escapes the checkout');

  const program = ts.createProgram({ rootNames: parsed.fileNames, options });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length)
    refuse(
      `Compiler Program diagnostics: ${JSON.stringify(diagnosticRows(ts, diagnostics, root))}`,
    );
  const sources = program.getSourceFiles().map((source) => ({
    ...fileRow(root, source.fileName),
    declarationInput: source.isDeclarationFile,
    externalLibrary: program.isSourceFileFromExternalLibrary(source),
  }));
  const sourceNames = new Map();
  for (const source of sources) {
    const folded = source.path.toLowerCase();
    if (sourceNames.has(folded) && sourceNames.get(folded) !== source.path)
      refuse('Case-colliding compiler source graph');
    sourceNames.set(folded, source.path);
  }
  const emitSources = program.getSourceFiles().filter((source) => {
    if (source.isDeclarationFile || program.isSourceFileFromExternalLibrary(source)) return false;
    if (!/\.(?:ts|mts|cts)$/u.test(source.fileName)) refuse('Unsupported compiler source kind');
    if (!within(root, realpathSync(source.fileName))) refuse('Unowned compiler source');
    return true;
  });
  // getOutputFileNames uses the command line's membership as a guard. The real
  // Program, rather than only include roots, defines transitive mirrored emit.
  const fullGraph = { ...parsed, fileNames: emitSources.map((source) => source.fileName) };
  const expectedOutputs = [];
  const outputNames = new Set();
  for (const source of emitSources) {
    for (const path of ts.getOutputFileNames(fullGraph, source.fileName, false)) {
      if (!within(outputRoot, path)) refuse('Compiler output escapes project dist');
      const output = localName(root, path);
      if (outputNames.has(output.toLowerCase())) refuse('Compiler output collision');
      outputNames.add(output.toLowerCase());
      expectedOutputs.push({
        path: output,
        source: localName(root, realpathSync(source.fileName)),
      });
    }
  }
  if (expectedOutputs.length === 0) refuse('Empty HTTP compiler emission plan');
  return {
    schemaVersion: 1,
    packageRoot: localName(root, project),
    configPath: localName(root, configuration),
    compiler: { version: ts.version, ...fileRow(root, compilerPath) },
    configs: [...configReads.values()].sort((a, b) => a.path.localeCompare(b.path)),
    options: portableOptions(options, root),
    sources: sources.sort((a, b) => a.path.localeCompare(b.path)),
    expectedOutputs: expectedOutputs.sort((a, b) => a.path.localeCompare(b.path)),
    diagnostics: [],
    outputRoot: localName(root, outputRoot),
    readinessPromoting: false,
  };
}

function walkFiles(root, directory) {
  const files = [];
  const folded = new Set();
  const visit = (path) => {
    if (!within(root, realpathSync(path)) || lstatSync(path).isSymbolicLink())
      refuse('Output directory contains a link or escape');
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const member = resolve(path, entry.name);
      const name = localName(root, member);
      if (folded.has(name.toLowerCase())) refuse('Case-colliding output roster');
      folded.add(name.toLowerCase());
      if (entry.isSymbolicLink()) refuse('Linked compiler output');
      if (entry.isDirectory()) visit(member);
      else if (entry.isFile()) files.push(fileRow(root, member));
      else refuse('Non-regular compiler output');
    }
  };
  visit(directory);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Verify a derived plan against every actual output, without mutating either. */
export function reconcileHttpCompilerOutputs({ checkoutRoot, plan }) {
  const root = realpathSync(checkoutRoot);
  const submitted = plainSnapshot(plan);
  if (!submitted || submitted.schemaVersion !== 1 || submitted.readinessPromoting !== false)
    refuse('Invalid compiler plan');
  // A plan is diagnostic data, not an authority handle: recompute it from the
  // installed compiler and configs before admitting any output relations.
  const actualPlan = deriveHttpCompilerPlan({
    checkoutRoot: root,
    packageRoot: submitted.packageRoot,
    configPath: relative(resolve(root, submitted.packageRoot), resolve(root, submitted.configPath)),
  });
  if (JSON.stringify(actualPlan) !== JSON.stringify(submitted)) refuse('Compiler inputs changed');
  const expected = new Map(actualPlan.expectedOutputs.map((row) => [row.path, row]));
  let generator;
  if (actualPlan.packageRoot === 'packages/core') {
    const input = fileRow(root, resolve(root, 'docs/framework/api/openapi.json'));
    const document = JSON.parse(readFileSync(resolve(root, input.path), 'utf8'));
    if (!document || typeof document !== 'object' || typeof document.openapi !== 'string')
      refuse('Invalid actual core OpenAPI generator input');
    const body = JSON.stringify(document, null, 2);
    generator = {
      path: 'packages/core/dist/openapi/openapi.json',
      source: input.path,
      generatedFromSha256: input.sha256,
      expectedSha256: sha256(`${body}\n`),
    };
    if ([...expected.keys()].some((path) => path.toLowerCase() === generator.path.toLowerCase()))
      refuse('Core OpenAPI generator collides with a compiler output');
    expected.set(generator.path, generator);
  }
  const outputs = walkFiles(root, resolve(root, actualPlan.outputRoot));
  if (outputs.length !== expected.size || outputs.some((row) => !expected.has(row.path)))
    refuse('Missing or unexpected compiler output');
  if (
    generator &&
    outputs.find((row) => row.path === generator.path)?.sha256 !== generator.expectedSha256
  )
    refuse('Core OpenAPI output differs from its actual generator input');
  const inputs = new Map(actualPlan.sources.map((row) => [row.path, row]));
  const maps = [];
  for (const output of outputs) {
    const relation = expected.get(output.path);
    const path = resolve(root, output.path);
    if (output.path.endsWith('.map')) {
      let map;
      try {
        map = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        refuse('Invalid emitted source map JSON');
      }
      const target = output.path.slice(0, -4);
      if (
        map.version !== 3 ||
        map.file !== target.split('/').at(-1) ||
        (map.sourceRoot !== undefined && map.sourceRoot !== '') ||
        !Array.isArray(map.sources) ||
        map.sources.length !== 1 ||
        !Array.isArray(map.names) ||
        typeof map.mappings !== 'string' ||
        !/^[A-Za-z0-9+/;,]*$/u.test(map.mappings) ||
        map.sections !== undefined ||
        !expected.has(target)
      )
        refuse('Unsupported or unbound emitted source map');
      const source = map.sources[0];
      if (
        typeof source !== 'string' ||
        source.length === 0 ||
        isAbsolute(source) ||
        source.includes('\\') ||
        /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(source) ||
        source.includes('?') ||
        source.includes('#')
      )
        refuse('Source map link is not a relative file path');
      const sourcePath = resolve(dirname(path), source);
      const sourceRow = fileRow(root, sourcePath);
      const boundSource = inputs.get(sourceRow.path);
      if (
        !boundSource ||
        sourceRow.path !== relation.source ||
        sourceRow.sha256 !== boundSource.sha256 ||
        expected.get(target).source !== sourceRow.path
      )
        refuse('Source map does not bind its planned source');
      if (
        map.sourcesContent !== undefined &&
        (!Array.isArray(map.sourcesContent) ||
          map.sourcesContent.length !== 1 ||
          typeof map.sourcesContent[0] !== 'string' ||
          sha256(map.sourcesContent[0]) !== sourceRow.sha256)
      )
        refuse('Source map embedded source bytes differ');
      maps.push({
        path: output.path,
        sha256: output.sha256,
        emittedPath: target,
        sources: [sourceRow],
        sourcesContentVerified: map.sourcesContent === undefined ? 'absent' : 'verified',
      });
    } else if (['.js', '.mjs', '.cjs'].includes(extname(path)) || /\.d\.[cm]?ts$/u.test(path)) {
      const text = readFileSync(path, 'utf8');
      const directives = [...text.matchAll(/^\/\/# sourceMappingURL=(.+)$/gmu)];
      const mapName = `${path.split(sep).at(-1)}.map`;
      if (
        directives.length !== 1 ||
        directives[0][1] !== mapName ||
        !expected.has(`${output.path}.map`)
      )
        refuse('Emitted module or declaration lacks its exact external map');
    }
  }
  return { outputs, mapLinks: maps, readinessPromoting: false };
}
