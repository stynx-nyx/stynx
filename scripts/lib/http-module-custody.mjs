import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import { Module, createRequire, isBuiltin, registerHooks } from 'node:module';
import * as moduleNamespace from 'node:module';
import { basename, dirname, extname, isAbsolute, join, normalize, parse, resolve } from 'node:path';
import { isDeepStrictEqual, types } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const copyBytes = Buffer.from.bind(Buffer);
const kinds = new Set(['module', 'commonjs', 'json']);

/**
 * Observe a closed, freshly built worker's module closure before owned imports.
 * The supervisor supplies its independently checked build roster. This layer
 * proves evaluated byte membership; it does not prove that build or HTTP reachability.
 */
export function installHttpModuleCustody(receipt) {
  const fail = (message) => {
    const error = new Error(message);
    error.code = 'HTTP_MODULE_CUSTODY_INVALID';
    throw error;
  };
  if (
    !receipt ||
    receipt.schemaVersion !== 1 ||
    receipt.nodeVersion !== process.versions.node ||
    process.versions.node !== '24.20.0' ||
    !/^[a-f0-9]{64}$/u.test(receipt.nodeSha256 ?? '') ||
    digest(readFileSync(realpathSync(process.execPath))) !== receipt.nodeSha256
  )
    fail('Unbound HTTP worker Node executable');
  if (
    process.execArgv.length !== 0 ||
    process.env.NODE_OPTIONS ||
    process.env.NODE_PATH ||
    process.env.NODE_COMPILE_CACHE ||
    process.env.NODE_DISABLE_COMPILE_CACHE !== '1' ||
    Object.keys(require.cache).length !== 0
  )
    fail('HTTP custody requires a fresh worker without ambient loading or compile cache');
  if (!Array.isArray(receipt.files) || receipt.files.length === 0)
    fail('Missing HTTP build module roster');
  const nodeVersion = receipt.nodeVersion;
  const nodeSha256 = receipt.nodeSha256;

  const roster = new Map();
  for (const member of receipt.files) {
    if (
      !member ||
      typeof member.url !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(member.sha256 ?? '') ||
      !kinds.has(member.moduleKind)
    )
      fail('Malformed HTTP build module member');
    const url = new URL(member.url);
    if (url.protocol !== 'file:' || url.search || url.hash)
      fail('HTTP build member must be a plain file URL');
    const path = fileURLToPath(url);
    const canonical = pathToFileURL(realpathSync(path)).href;
    if (url.href !== canonical || roster.has(canonical))
      fail('HTTP build member is duplicated or not a canonical real path');
    const extension = extname(path);
    if (
      !['.js', '.mjs', '.cjs', '.json'].includes(extension) ||
      (extension === '.json' && member.moduleKind !== 'json') ||
      (extension === '.mjs' && member.moduleKind !== 'module') ||
      (extension === '.cjs' && member.moduleKind !== 'commonjs') ||
      (extension !== '.json' && member.moduleKind === 'json')
    )
      fail('Unsupported HTTP build module kind');
    if (digest(readFileSync(path)) !== member.sha256)
      fail('HTTP build member changed before worker loading');
    roster.set(canonical, Object.freeze({ ...member }));
  }

  let refusal;
  let closed = false;
  const resolutions = [];
  const evaluations = [];
  const evaluated = new Map();
  const refuse = (message) => {
    refusal ??= message;
    fail(message);
  };
  const lookup = (value) => {
    let url;
    try {
      url = new URL(value);
    } catch {
      return refuse('HTTP worker resolved a non-URL module');
    }
    if (url.protocol !== 'file:' || url.search || url.hash)
      return refuse('HTTP worker resolved an unsupported module URL');
    const canonical = pathToFileURL(realpathSync(fileURLToPath(url))).href;
    const member = roster.get(canonical);
    if (!member) return refuse('HTTP worker resolved a module outside the build roster');
    return { canonical, member };
  };
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        const result = nextResolve(specifier, context);
        if (isBuiltin(result.url)) {
          resolutions.push({
            specifier,
            parentURL: context.parentURL ?? null,
            conditions: [...context.conditions],
            url: result.url,
            builtin: true,
          });
        } else {
          const { canonical } = lookup(result.url);
          resolutions.push({
            specifier,
            parentURL: context.parentURL ?? null,
            conditions: [...context.conditions],
            url: result.url,
            canonicalURL: canonical,
            builtin: false,
          });
        }
        return result;
      } catch (error) {
        refusal ??= 'HTTP worker module resolution failed';
        throw error;
      }
    },
    load(url, context, nextLoad) {
      try {
        const result = nextLoad(url, context);
        if (isBuiltin(url)) return result;
        const { canonical, member } = lookup(url);
        const source = result.source;
        if (typeof source !== 'string' && !(source instanceof Uint8Array))
          refuse('HTTP worker module has no evaluated source bytes');
        const bytes = copyBytes(source);
        const sha256 = digest(bytes);
        if (sha256 !== member.sha256)
          refuse('HTTP worker evaluated bytes differ from the build roster');
        // Node can report undefined for a CJS child. Retain that raw observation;
        // the reviewed build roster supplies its independently derived kind.
        if (result.format !== undefined && result.format !== member.moduleKind)
          refuse('HTTP worker evaluated an unexpected module format');
        if (result.format === undefined && member.moduleKind !== 'commonjs')
          refuse('HTTP worker omitted a non-CJS module format');
        const previous = evaluated.get(canonical);
        if (previous && previous !== sha256)
          refuse('HTTP worker module changed during measurement');
        evaluated.set(canonical, sha256);
        evaluations.push({
          url,
          canonicalURL: canonical,
          sha256,
          byteLength: bytes.length,
          observedFormat: result.format ?? null,
          moduleKind: member.moduleKind,
        });
        return result;
      } catch (error) {
        refusal ??= 'HTTP worker module evaluation failed';
        throw error;
      }
    },
  });

  const assertValid = () => {
    if (closed) fail('HTTP module observation ended before measurement completion');
    if (refusal) fail(refusal);
    if (evaluated.size === 0) fail('HTTP worker evaluated no bound modules');
  };
  return Object.freeze({
    assertValid,
    snapshot() {
      assertValid();
      return {
        schemaVersion: 1,
        complete: false,
        readinessPromoting: false,
        nodeVersion,
        nodeSha256,
        resolutions: resolutions.map((entry) => ({ ...entry, conditions: [...entry.conditions] })),
        evaluations: evaluations.map((entry) => ({ ...entry })),
      };
    },
    close() {
      closed = true;
      hooks.deregister();
    },
  });
}

let fixedWorkerStarted = false;

/**
 * Fixed no-argument worker entry. Local observations require independent parent
 * corroboration; direct invocation or a matching JSON descriptor cannot qualify
 * a process. There is no exported optional-enabled installer or returned handle.
 */
export async function runHttpRuntimeWorker() {
  if (arguments.length !== 0 || fixedWorkerStarted)
    throw new Error('HTTP runtime worker entry is once-only and takes no arguments');
  fixedWorkerStarted = true;
  const fail = (message) => {
    throw new Error(message);
  };
  let custody;
  let job;
  let terminalSent = false;

  function send(kind, result) {
    if (!process.send || terminalSent) fail('Worker has no private channel or already terminated');
    const frame = {
      schemaVersion: 1,
      kind,
      nonce: job.nonce,
      candidateCommit: job.candidateCommit,
      pid: process.pid,
      result,
    };
    if (Buffer.byteLength(JSON.stringify(frame)) > 32 * 1024 * 1024)
      fail('Worker result exceeds supported bound');
    if (kind === 'terminal') terminalSent = true;
    return new Promise((accept, reject) =>
      process.send(frame, (error) => (error ? reject(error) : accept())),
    );
  }

  try {
    if (process.argv.length !== 3 || process.execArgv.length || !process.send)
      fail('Worker requires exact private startup');
    const descriptor = realpathSync(process.argv[2]);
    const stat = lstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.size > 64 * 1024 * 1024)
      fail('Invalid private worker descriptor');
    const bytes = readFileSync(descriptor);
    if (digest(bytes) !== process.env.STYNX_HTTP_JOB_SHA256)
      fail('Private worker descriptor changed');
    job = JSON.parse(bytes.toString('utf8'));
    if (
      job.schemaVersion !== 1 ||
      job.mode !== 'bootstrap-module-only' ||
      job.compositionId !== 'reference' ||
      !/^[a-f0-9]{40}$/u.test(job.candidateCommit) ||
      !/^[a-f0-9]{40}$/u.test(job.tree) ||
      !/^[a-f0-9-]{36}$/u.test(job.nonce) ||
      job.parentPid !== process.ppid ||
      job.descriptorPath !== descriptor ||
      process.cwd() !== job.checkoutRoot ||
      realpathSync(process.cwd()) !== job.checkoutRoot ||
      realpathSync(process.execPath) !== job.nodePath ||
      digest(readFileSync(process.execPath)) !== job.nodeSha256 ||
      process.versions.node !== '24.20.0' ||
      process.platform !== job.platform ||
      process.arch !== job.arch ||
      process.argv[1] !== fileURLToPath(new URL('./http-runtime-worker.mjs', import.meta.url)) ||
      fileURLToPath(import.meta.url) !==
        resolve(job.checkoutRoot, 'scripts/lib/http-module-custody.mjs') ||
      JSON.stringify(
        Object.keys(process.env)
          .filter((name) => name !== 'STYNX_HTTP_JOB_SHA256')
          .sort(),
      ) !== JSON.stringify(Object.keys(job.environment).sort())
    )
      fail('Private worker process context differs');
    for (const [name, sha256] of Object.entries(job.environment))
      if (digest(process.env[name] ?? '') !== sha256) fail('Private worker environment changed');
    const controlPaths = [
      'scripts/lib/http-module-custody.mjs',
      'scripts/lib/http-runtime-bindings.mjs',
      'scripts/lib/http-runtime-census.mjs',
      'scripts/lib/http-runtime-worker.mjs',
    ];
    if (
      !Array.isArray(job.controls) ||
      !isDeepStrictEqual(job.controls.map((row) => row.path).sort(), controlPaths)
    )
      fail('Private worker control population differs');
    for (const row of job.controls) {
      const path = resolve(job.checkoutRoot, row.path);
      const actual = lstatSync(path);
      const contents = readFileSync(path);
      if (
        !actual.isFile() ||
        realpathSync(path) !== path ||
        (actual.mode & 0o7777) !== row.permissions ||
        contents.length !== row.byteLength ||
        digest(contents) !== row.sha256
      )
        fail('Private worker control bytes changed');
    }

    function installSupervisedCustody() {
      const receipt = job.receipt;
      const startupObservation = {
        candidateCommit: job.candidateCommit,
        tree: job.tree,
        nonce: job.nonce,
        parentPid: process.ppid,
        descriptorSha256: digest(bytes),
      };
      const fail = (message) => {
        const error = new Error(message);
        error.code = 'HTTP_MODULE_CUSTODY_INVALID';
        throw error;
      };
      if (
        !receipt ||
        receipt.schemaVersion !== 1 ||
        receipt.nodeVersion !== process.versions.node ||
        process.versions.node !== '24.20.0' ||
        !/^[a-f0-9]{64}$/u.test(receipt.nodeSha256 ?? '') ||
        digest(readFileSync(realpathSync(process.execPath))) !== receipt.nodeSha256
      )
        fail('Unbound HTTP worker Node executable');
      if (
        process.execArgv.length !== 0 ||
        process.env.NODE_OPTIONS ||
        process.env.NODE_PATH ||
        process.env.NODE_COMPILE_CACHE ||
        process.env.NODE_DISABLE_COMPILE_CACHE !== '1' ||
        Object.keys(require.cache).length !== 0
      )
        fail('HTTP custody requires a fresh worker without ambient loading or compile cache');
      if (!Array.isArray(receipt.files) || receipt.files.length === 0)
        fail('Missing HTTP build module roster');
      const nodeVersion = receipt.nodeVersion;
      const nodeSha256 = receipt.nodeSha256;

      const roster = new Map();
      for (const member of receipt.files) {
        if (
          !member ||
          typeof member.url !== 'string' ||
          !/^[a-f0-9]{64}$/u.test(member.sha256 ?? '') ||
          !kinds.has(member.moduleKind)
        )
          fail('Malformed HTTP build module member');
        const url = new URL(member.url);
        if (url.protocol !== 'file:' || url.search || url.hash)
          fail('HTTP build member must be a plain file URL');
        const path = fileURLToPath(url);
        const canonical = pathToFileURL(realpathSync(path)).href;
        if (url.href !== canonical || roster.has(canonical))
          fail('HTTP build member is duplicated or not a canonical real path');
        const extension = extname(path);
        if (
          !['.js', '.mjs', '.cjs', '.json'].includes(extension) ||
          (extension === '.json' && member.moduleKind !== 'json') ||
          (extension === '.mjs' && member.moduleKind !== 'module') ||
          (extension === '.cjs' && member.moduleKind !== 'commonjs') ||
          (extension !== '.json' && member.moduleKind === 'json')
        )
          fail('Unsupported HTTP build module kind');
        if (digest(readFileSync(path)) !== member.sha256)
          fail('HTTP build member changed before worker loading');
        roster.set(canonical, Object.freeze({ ...member }));
      }

      let refusal;
      let closed = false;
      const resolutions = [];
      const evaluations = [];
      const evaluated = new Map();
      const refuse = (message) => {
        refusal ??= message;
        fail(message);
      };
      const lookup = (value) => {
        let url;
        try {
          url = new URL(value);
        } catch {
          return refuse('HTTP worker resolved a non-URL module');
        }
        if (url.protocol !== 'file:' || url.search || url.hash)
          return refuse('HTTP worker resolved an unsupported module URL');
        const canonical = pathToFileURL(realpathSync(fileURLToPath(url))).href;
        const member = roster.get(canonical);
        if (!member) return refuse('HTTP worker resolved a module outside the build roster');
        return { canonical, member };
      };
      const optionalResolutionProbes = [];
      let eventSequence = 0;
      const own = (object, key) => {
        if (!object || types.isProxy(object)) refuse('Optional probe has unsupported object state');
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value'))
          refuse('Optional probe requires an own data property');
        return descriptor.value;
      };
      const stringArray = (value) => {
        if (
          !Array.isArray(value) ||
          types.isProxy(value) ||
          Reflect.ownKeys(value).length !== value.length + 1
        )
          refuse('Optional probe has unsupported path or condition array');
        const result = [];
        for (let i = 0; i < value.length; i++) {
          const entry = own(value, String(i));
          if (typeof entry !== 'string') refuse('Optional probe array is not a string population');
          result.push(entry);
        }
        return result;
      };

      // These are local observations of genuine builtin views under the exact
      // parent-reviewed startup graph, not a retrospective inventory of hooks.
      const publicModule = require('node:module');
      const bareModule = require('module');
      const builtinViewDescriptor = Object.getOwnPropertyDescriptor(process, 'getBuiltinModule');
      if (
        !builtinViewDescriptor ||
        !Object.hasOwn(builtinViewDescriptor, 'value') ||
        typeof builtinViewDescriptor.value !== 'function' ||
        types.isProxy(builtinViewDescriptor.value)
      )
        refuse('Supervised worker builtin view is unsupported');
      const getBuiltinModule = builtinViewDescriptor.value;
      const publicNames = ['registerHooks', 'register', 'syncBuiltinESMExports', 'Module'];
      const publicDescriptors = Object.fromEntries(
        publicNames.map((name) => {
          const descriptor = Object.getOwnPropertyDescriptor(publicModule, name);
          if (
            !descriptor ||
            !Object.hasOwn(descriptor, 'value') ||
            typeof descriptor.value !== 'function' ||
            types.isProxy(descriptor.value)
          )
            refuse('Supervised worker module surface is unsupported');
          return [name, descriptor];
        }),
      );
      const esmNames = [...publicNames, 'default'];
      const esmDescriptors = Object.fromEntries(
        esmNames.map((name) => [name, Object.getOwnPropertyDescriptor(moduleNamespace, name)]),
      );
      if (
        publicModule !== Module ||
        bareModule !== Module ||
        publicModule.Module !== Module ||
        moduleNamespace.default !== Module ||
        moduleNamespace.Module !== Module ||
        getBuiltinModule('module') !== Module ||
        getBuiltinModule('node:module') !== Module ||
        moduleNamespace.registerHooks !== publicDescriptors.registerHooks.value ||
        moduleNamespace.register !== publicDescriptors.register.value ||
        moduleNamespace.syncBuiltinESMExports !== publicDescriptors.syncBuiltinESMExports.value
      )
        refuse('Supervised worker builtin aliases differ');
      const originalRegisterHooks = publicDescriptors.registerHooks.value;
      const originalSync = publicDescriptors.syncBuiltinESMExports.value;
      const wrappers = Object.freeze({
        registerHooks() {
          refuse('Supervised worker forbids further module registration');
        },
        register() {
          refuse('Supervised worker forbids further module registration');
        },
      });
      const guardedDescriptors = Object.fromEntries(
        publicNames.map((name) => [
          name,
          { ...publicDescriptors[name], value: wrappers[name] ?? publicDescriptors[name].value },
        ]),
      );
      const guardedEsmDescriptors = Object.fromEntries(
        esmNames.map((name) => [
          name,
          { ...esmDescriptors[name], value: wrappers[name] ?? esmDescriptors[name].value },
        ]),
      );
      let guardInstalled = false;
      const verifySurfaces = (guarded) => {
        const expectedPublic = guarded ? guardedDescriptors : publicDescriptors;
        const expectedEsm = guarded ? guardedEsmDescriptors : esmDescriptors;
        if (
          !isDeepStrictEqual(
            Object.getOwnPropertyDescriptor(process, 'getBuiltinModule'),
            builtinViewDescriptor,
          ) ||
          publicModule !== bareModule ||
          publicModule !== Module ||
          getBuiltinModule('module') !== publicModule ||
          getBuiltinModule('node:module') !== publicModule
        )
          refuse('Supervised worker builtin view changed');
        for (const name of publicNames)
          if (
            !isDeepStrictEqual(
              Object.getOwnPropertyDescriptor(publicModule, name),
              expectedPublic[name],
            )
          )
            refuse('Supervised worker registration surface changed');
        for (const name of esmNames)
          if (
            !isDeepStrictEqual(
              Object.getOwnPropertyDescriptor(moduleNamespace, name),
              expectedEsm[name],
            )
          )
            refuse('Supervised worker synchronized module surface changed');
      };
      const assertGuard = () => {
        if (closed || !guardInstalled) refuse('Supervised worker registration guard is not active');
        verifySurfaces(true);
      };
      const restoreGuard = () => {
        let failed = false;
        for (const name of publicNames) {
          try {
            Object.defineProperty(publicModule, name, publicDescriptors[name]);
          } catch {
            failed = true;
          }
        }
        try {
          originalSync();
          verifySurfaces(false);
        } catch {
          failed = true;
        }
        guardInstalled = false;
        if (failed) refuse('Supervised worker registration restoration failed');
      };

      const environment = () =>
        Object.fromEntries(
          Object.keys(process.env)
            .sort()
            .map((key) => [key, digest(process.env[key] ?? '')]),
        );
      const provenance = (path, sha256, moduleKind) => {
        const url = pathToFileURL(path).href,
          member = roster.get(url);
        const stat = lstatSync(path),
          bytes = readFileSync(path);
        if (
          !member ||
          member.moduleKind !== moduleKind ||
          member.sha256 !== sha256 ||
          !stat.isFile() ||
          realpathSync(path) !== path ||
          digest(bytes) !== sha256
        )
          refuse('Optional probe provenance differs from the owned build');
        return {
          path,
          url,
          sha256,
          permissions: stat.mode & 0o7777,
          byteLength: bytes.length,
          device: stat.dev,
          inode: stat.ino,
        };
      };
      const ancestorSearchPaths = (directory) => {
        const result = [];
        for (let cursor = directory; ; cursor = dirname(cursor)) {
          if (basename(cursor) !== 'node_modules') result.push(join(cursor, 'node_modules'));
          if (dirname(cursor) === cursor) return result;
        }
      };
      const absentPackage = (scope, packageName) => {
        if (!isAbsolute(scope) || normalize(scope) !== scope)
          refuse('Optional probe search scope is not an exact native absolute path');
        const packageRoot = join(scope, packageName),
          root = parse(packageRoot).root;
        const components = packageRoot.slice(root.length).split('/');
        const chain = [];
        let path = root;
        for (let i = -1; i < components.length; i++) {
          if (i >= 0) path = join(path, components[i]);
          let stat;
          try {
            stat = lstatSync(path);
          } catch (error) {
            if (error.code !== 'ENOENT' || chain.length === 0)
              refuse('Optional probe absence is not a genuine ENOENT');
            return {
              scope,
              packageRoot,
              outcome: 'ENOENT',
              firstMissingPath: path,
              missingComponentChain: components.slice(i),
              nearestExistingAncestor: chain.at(-1),
              chain,
            };
          }
          if (path === packageRoot)
            return {
              scope,
              packageRoot,
              outcome: 'PRESENT',
              kind: stat.isSymbolicLink()
                ? 'symbolic-link'
                : stat.isDirectory()
                  ? 'directory'
                  : 'other',
              permissions: stat.mode & 0o7777,
              device: stat.dev,
              inode: stat.ino,
              linkTarget: stat.isSymbolicLink() ? readlinkSync(path) : null,
              chain,
            };
          const link = stat.isSymbolicLink();
          if (!link && !stat.isDirectory()) refuse('Optional probe ancestor is not a directory');
          let canonicalPath,
            linkTarget = null;
          try {
            canonicalPath = realpathSync(path);
            if (link) {
              linkTarget = readlinkSync(path);
              if (!statSync(path).isDirectory())
                refuse('Optional probe link target is not a directory');
            }
          } catch {
            refuse('Optional probe ancestor link or access is unresolved');
          }
          chain.push({
            path,
            canonicalPath,
            kind: link ? 'symbolic-link' : 'directory',
            permissions: stat.mode & 0o7777,
            device: stat.dev,
            inode: stat.ino,
            linkTarget,
          });
        }
        return refuse('Optional probe absence was not established');
      };
      const parentHash = '86968141beeaa93daea62a4ec4e1f36bd31f88eb5f0b3a0d2b2d28aefe5406c2';
      const helperHash = 'c8a109dab1b2461e866fe04b8be5988ccc199a2239c730abc05fc28c0f85d7f2';
      const manifestHash = '8335e997f7dbe8e797298caa94291dead8503bbf34e546d591581109284ca429';
      const ruleConstants = [
        {
          ruleId: 'NEST1123_OPTIONAL_WEBSOCKETS',
          specifier: '@nestjs/websockets/socket-module',
          packageName: '@nestjs/websockets',
          start: 1159,
          end: 1208,
          binding: 'SocketModule',
        },
        {
          ruleId: 'NEST1123_OPTIONAL_MICROSERVICES',
          specifier: '@nestjs/microservices/microservices-module',
          packageName: '@nestjs/microservices',
          start: 1329,
          end: 1388,
          binding: 'MicroservicesModule',
        },
      ];
      let optionalPlan, cachedParent, cachedHelper;
      // Only the private fixed runner reaches this lexical installer. Startup
      // observations are descriptive; the actual parent must corroborate its launch
      // and reviewed pre-custody graph before admitting this result.
      const matches = [...roster.values()].filter((member) => member.sha256 === parentHash);
      if (matches.length > 0) {
        if (matches.length !== 1) refuse('Optional probe parent build origin is ambiguous');
        const parentPath = fileURLToPath(matches[0].url),
          packageRoot = dirname(parentPath);
        const originRequire = createRequire(
          new URL('../../packages/flow/package.json', import.meta.url),
        );
        if (
          realpathSync(originRequire.resolve('@nestjs/core/nest-application.js')) !== parentPath ||
          basename(parentPath) !== 'nest-application.js' ||
          basename(packageRoot) !== 'core' ||
          basename(dirname(packageRoot)) !== '@nestjs'
        )
          refuse('Optional probe is not the actual installed Nest origin');
        const parent = provenance(parentPath, parentHash, 'commonjs');
        const helper = provenance(
          join(packageRoot, 'helpers/optional-require.js'),
          helperHash,
          'commonjs',
        );
        const manifest = provenance(join(packageRoot, 'package.json'), manifestHash, 'json');
        const pkg = JSON.parse(readFileSync(manifest.path, 'utf8'));
        if (pkg.name !== '@nestjs/core' || pkg.version !== '11.2.3')
          refuse('Optional probe package declaration differs');
        const identityKeys = ['candidateCommit', 'descriptorSha256', 'nonce', 'parentPid', 'tree'];
        if (
          !startupObservation ||
          types.isProxy(startupObservation) ||
          !isDeepStrictEqual(Reflect.ownKeys(startupObservation).sort(), identityKeys) ||
          !/^[a-f0-9]{40}$/u.test(own(startupObservation, 'candidateCommit')) ||
          !/^[a-f0-9]{40}$/u.test(own(startupObservation, 'tree')) ||
          !/^[a-f0-9-]{36}$/u.test(own(startupObservation, 'nonce')) ||
          !/^[a-f0-9]{64}$/u.test(own(startupObservation, 'descriptorSha256')) ||
          own(startupObservation, 'parentPid') !== process.ppid
        )
          refuse('Optional probe is not bound to the actual worker job');
        const identity = {
          ...startupObservation,
          pid: process.pid,
          cwd: process.cwd(),
          nodePath: realpathSync(process.execPath),
          nodeSha256,
          environment: environment(),
          parentCorroborationRequired: true,
        };
        const parentText = readFileSync(parent.path, 'utf8'),
          parentRequire = createRequire(parent.url);
        const localPaths = ancestorSearchPaths(packageRoot);
        const rules = ruleConstants.map((rule) => {
          const callback = `() => require('${rule.specifier}')`;
          const statement = `const { ${rule.binding} } = (0, optional_require_1.optionalRequire)('${rule.specifier}', ${callback});`;
          if (
            parentText.slice(rule.start, rule.end) !== callback ||
            parentText.split(callback).length !== 2 ||
            parentText.split(statement).length !== 2 ||
            pkg.peerDependenciesMeta?.[rule.packageName]?.optional !== true ||
            pkg.peerDependencies?.[rule.packageName] !== '^11.0.0'
          )
            refuse('Optional probe declared unique literal callback differs');
          const scopes = stringArray(parentRequire.resolve.paths(rule.specifier));
          if (
            new Set(scopes).size !== scopes.length ||
            scopes.length < localPaths.length ||
            !isDeepStrictEqual(scopes.slice(0, localPaths.length), localPaths)
          )
            refuse('Optional probe public search scope has no exact local baseline');
          const absence = scopes.map((scope) => absentPackage(scope, rule.packageName));
          return {
            ...rule,
            declarationKind: 'DECLARED_UNIQUE_LITERAL_CALLBACK',
            callback,
            callbackSha256: digest(callback),
            statementSha256: digest(statement),
            scopes,
            localPaths,
            globalFallbackPaths: scopes.slice(localPaths.length),
            absence,
            wholePackageAbsenceEligible: absence.every((entry) => entry.outcome === 'ENOENT'),
            absenceId: digest(JSON.stringify(absence)),
            occurrences: 0,
          };
        });
        const binding = {
          identity,
          parent,
          helper,
          manifest,
          rules: rules.map((rule) =>
            Object.fromEntries(Object.entries(rule).filter(([key]) => key !== 'occurrences')),
          ),
        };
        optionalPlan = {
          identity,
          parent,
          helper,
          manifest,
          parentRequire,
          rules,
          planId: digest(JSON.stringify(binding)),
        };
      }
      const cachedModule = (file, previous, loaded) => {
        const module = own(require.cache, file.path);
        if (
          !module ||
          types.isProxy(module) ||
          Object.getPrototypeOf(module) !== Module.prototype ||
          (previous && previous !== module) ||
          own(module, 'id') !== file.path ||
          own(module, 'filename') !== file.path ||
          own(module, 'path') !== dirname(file.path) ||
          (loaded && own(module, 'loaded') !== true) ||
          evaluated.get(file.url) !== file.sha256
        )
          refuse('Optional probe actual cached module identity is unbound');
        return module;
      };
      const checkOptionalPlan = (rule, final) => {
        assertGuard();
        const plan = optionalPlan;
        if (
          !plan ||
          process.cwd() !== plan.identity.cwd ||
          process.execArgv.length ||
          realpathSync(process.execPath) !== plan.identity.nodePath ||
          digest(readFileSync(process.execPath)) !== plan.identity.nodeSha256 ||
          !isDeepStrictEqual(environment(), plan.identity.environment)
        )
          refuse('Optional probe actual worker context changed');
        for (const file of [plan.parent, plan.helper, plan.manifest]) {
          const current = provenance(file.path, file.sha256, roster.get(file.url).moduleKind);
          if (!isDeepStrictEqual(current, file))
            refuse('Optional probe provenance identity changed');
        }
        cachedParent = cachedModule(plan.parent, cachedParent, final);
        cachedHelper = cachedModule(plan.helper, cachedHelper, true);
        if (!isDeepStrictEqual(stringArray(own(cachedParent, 'paths')), rule.localPaths))
          refuse('Optional probe actual cached parent search paths changed');
        // Public path derivation is repeated outside the active resolver only.
        if (
          final &&
          !isDeepStrictEqual(
            stringArray(plan.parentRequire.resolve.paths(rule.specifier)),
            rule.scopes,
          )
        )
          refuse('Optional probe public global or local search scope changed');
        const absence = rule.scopes.map((scope) => absentPackage(scope, rule.packageName));
        if (!isDeepStrictEqual(absence, rule.absence))
          refuse('Optional probe absence chain changed');
        return absence;
      };
      const admitOptionalProbe = (specifier, context, error, sequence) => {
        const plan = optionalPlan;
        const rule = plan?.rules.find((entry) => entry.specifier === specifier);
        if (
          !rule ||
          !rule.wholePackageAbsenceEligible ||
          types.isProxy(context) ||
          !isDeepStrictEqual(Reflect.ownKeys(context).sort(), [
            'conditions',
            'importAttributes',
            'parentURL',
          ]) ||
          own(context, 'parentURL') !== plan.parent.url ||
          own(error, 'code') !== 'MODULE_NOT_FOUND' ||
          !isDeepStrictEqual(stringArray(own(context, 'conditions')), [
            'require',
            'node',
            'node-addons',
            'module-sync',
          ])
        )
          refuse('HTTP worker module resolution failed');
        const attributes = own(context, 'importAttributes');
        if (
          attributes !== undefined &&
          (!attributes ||
            types.isProxy(attributes) ||
            Object.getPrototypeOf(attributes) !== Object.prototype ||
            Reflect.ownKeys(attributes).length)
        )
          refuse('Optional probe import attributes are unsupported');
        if (rule.occurrences !== 0) refuse('Optional probe occurrence exceeds its finite bound');
        checkOptionalPlan(rule, false);
        rule.occurrences++;
        optionalResolutionProbes.push({
          schemaVersion: 1,
          ruleId: rule.ruleId,
          outcome: 'OPTIONAL_PACKAGE_ABSENT_NOT_EVALUATED',
          planId: plan.planId,
          identity: plan.identity,
          sequence,
          occurrence: 1,
          specifier,
          parentURL: plan.parent.url,
          conditions: [...context.conditions],
          nativeCode: 'MODULE_NOT_FOUND',
          declaredCallsite: {
            kind: rule.declarationKind,
            start: rule.start,
            end: rule.end,
            callbackSha256: rule.callbackSha256,
            statementSha256: rule.statementSha256,
          },
          provenance: { parent: plan.parent, helper: plan.helper, manifest: plan.manifest },
          search: {
            scopes: rule.scopes,
            localPaths: rule.localPaths,
            globalFallbackPaths: rule.globalFallbackPaths,
          },
          absence: rule.absence,
          beforeAndEdgeAbsenceId: rule.absenceId,
          pointInTimeOnly: true,
          parentCorroborationRequired: true,
          runtimeCustodyComplete: false,
          readinessPromoting: false,
        });
      };
      const hooks = originalRegisterHooks({
        resolve(specifier, context, nextResolve) {
          const sequence = ++eventSequence;
          let result;
          try {
            result = nextResolve(specifier, context);
          } catch (error) {
            try {
              admitOptionalProbe(specifier, context, error, sequence);
            } catch {
              refusal ??= 'HTTP worker module resolution failed';
            }
            // Preserve the original raw resolver exception, including object identity.
            throw error;
          }
          try {
            if (isBuiltin(result.url)) {
              resolutions.push({
                sequence,
                specifier,
                parentURL: context.parentURL ?? null,
                conditions: [...context.conditions],
                url: result.url,
                builtin: true,
              });
            } else {
              const { canonical } = lookup(result.url);
              resolutions.push({
                sequence,
                specifier,
                parentURL: context.parentURL ?? null,
                conditions: [...context.conditions],
                url: result.url,
                canonicalURL: canonical,
                builtin: false,
              });
            }
            return result;
          } catch (error) {
            refusal ??= 'HTTP worker module resolution failed';
            throw error;
          }
        },
        load(url, context, nextLoad) {
          const sequence = ++eventSequence;
          try {
            const result = nextLoad(url, context);
            if (isBuiltin(url)) return result;
            const { canonical, member } = lookup(url);
            const source = result.source;
            if (typeof source !== 'string' && !(source instanceof Uint8Array))
              refuse('HTTP worker module has no evaluated source bytes');
            const bytes = copyBytes(source);
            const sha256 = digest(bytes);
            if (sha256 !== member.sha256)
              refuse('HTTP worker evaluated bytes differ from the build roster');
            // Node can report undefined for a CJS child. Retain that raw observation;
            // the reviewed build roster supplies its independently derived kind.
            if (result.format !== undefined && result.format !== member.moduleKind)
              refuse('HTTP worker evaluated an unexpected module format');
            if (result.format === undefined && member.moduleKind !== 'commonjs')
              refuse('HTTP worker omitted a non-CJS module format');
            const previous = evaluated.get(canonical);
            if (previous && previous !== sha256)
              refuse('HTTP worker module changed during measurement');
            evaluated.set(canonical, sha256);
            evaluations.push({
              sequence,
              url,
              canonicalURL: canonical,
              sha256,
              byteLength: bytes.length,
              observedFormat: result.format ?? null,
              moduleKind: member.moduleKind,
            });
            return result;
          } catch (error) {
            refusal ??= 'HTTP worker module evaluation failed';
            throw error;
          }
        },
      });

      // There is exactly one own hook. No dependency or await runs between the
      // private capture above, registration, interposition and synchronization.
      try {
        for (const name of ['registerHooks', 'register'])
          Object.defineProperty(publicModule, name, guardedDescriptors[name]);
        originalSync();
        guardInstalled = true;
        assertGuard();
      } catch {
        refusal ??= 'Supervised worker registration guard installation failed';
        closed = true;
        try {
          hooks.deregister();
        } finally {
          restoreGuard();
        }
        fail('Supervised worker registration guard installation failed');
      }

      const assertValid = () => {
        if (closed) fail('HTTP module observation ended before measurement completion');
        if (refusal) fail(refusal);
        assertGuard();
        if (evaluated.size === 0) fail('HTTP worker evaluated no bound modules');
        if (optionalPlan) {
          try {
            for (const rule of optionalPlan.rules) {
              if (rule.occurrences > 1)
                refuse('Optional probe occurrence exceeds its finite bound');
              // No row is manufactured for an unobserved probe. The plan still stays bound.
              if (evaluated.has(optionalPlan.parent.url)) checkOptionalPlan(rule, true);
              else {
                for (const file of [
                  optionalPlan.parent,
                  optionalPlan.helper,
                  optionalPlan.manifest,
                ])
                  if (
                    !isDeepStrictEqual(
                      provenance(file.path, file.sha256, roster.get(file.url).moduleKind),
                      file,
                    )
                  )
                    refuse('Optional probe provenance identity changed');
                if (
                  !isDeepStrictEqual(
                    stringArray(optionalPlan.parentRequire.resolve.paths(rule.specifier)),
                    rule.scopes,
                  ) ||
                  !isDeepStrictEqual(
                    rule.scopes.map((scope) => absentPackage(scope, rule.packageName)),
                    rule.absence,
                  )
                )
                  refuse('Optional probe unobserved plan changed');
              }
            }
          } catch {
            refuse('Optional probe final verification failed');
          }
        }
      };
      return Object.freeze({
        assertValid,
        snapshot() {
          assertValid();
          return {
            schemaVersion: 1,
            complete: false,
            readinessPromoting: false,
            nodeVersion,
            nodeSha256,
            resolutions: resolutions.map((entry) => ({
              ...entry,
              conditions: [...entry.conditions],
            })),
            evaluations: evaluations.map((entry) => ({ ...entry })),
            optionalResolutionProbes: structuredClone(optionalResolutionProbes),
            supervisedStartup: {
              ...startupObservation,
              parentCorroborationRequired: true,
              publicRegistrationGuard: 'CLOSED_SUPERVISED_PUBLIC_SURFACES',
              ownHookRegistrations: 1,
              processSandbox: false,
            },
          };
        },
        close() {
          if (closed) return;
          try {
            if (!refusal && evaluated.size > 0) assertValid();
          } finally {
            // Irreversible before either hook removal or descriptor restoration.
            closed = true;
            try {
              hooks.deregister();
            } catch {
              refusal ??= 'Supervised worker hook cleanup failed';
            } finally {
              restoreGuard();
            }
            if (refusal) fail(refusal);
          }
        },
      });
    }

    custody = installSupervisedCustody();
    await send('start', { mode: job.mode });
    // These local startup checks cannot establish freshness alone. Only the
    // supervisor's live handle, exact spawn/ChildProcess and pinned pre-custody
    // graph can corroborate this fixed worker. No caller receives a capability.
    // No application/dependency static import precedes custody installation.
    createRequire(new URL('../../reference/api/package.json', import.meta.url))('reflect-metadata');
    await import('./http-runtime-census.mjs');
    const { observeReferenceBootstrapModule } = await import('./http-runtime-bindings.mjs');
    const observation = await observeReferenceBootstrapModule(job);
    custody.assertValid();
    const modules = custody.snapshot();
    for (const path of [
      'scripts/lib/http-runtime-census.mjs',
      'scripts/lib/http-runtime-bindings.mjs',
      job.bootstrap.emitted.path,
    ]) {
      const url = pathToFileURL(resolve(job.checkoutRoot, path)).href;
      if (!modules.evaluations.some((row) => row.canonicalURL === url))
        fail('Required runtime module evaluation missing');
    }
    await send('terminal', {
      observation,
      modules,
      trustedBootstrap: job.controls.filter((row) =>
        ['scripts/lib/http-runtime-worker.mjs', 'scripts/lib/http-module-custody.mjs'].includes(
          row.path,
        ),
      ),
      readinessPromoting: false,
      runtimeCustodyComplete: false,
    });
    custody.assertValid();
    if (!isDeepStrictEqual(custody.snapshot(), modules))
      fail('Runtime module population changed during terminal delivery');
    custody.close();
    custody = undefined;
    process.disconnect();
  } catch {
    // Candidate/runtime exception messages can contain private configuration.
    // The parent receives only a fixed diagnostic, never arbitrary raw errors.
    process.stderr.write('HTTP runtime bootstrap worker refused\n');
    process.exitCode = 1;
    try {
      custody?.close();
    } catch {
      /* Cleanup remains a refused child with the same fixed diagnostic. */
    }
    if (process.connected) process.disconnect();
  }
}
