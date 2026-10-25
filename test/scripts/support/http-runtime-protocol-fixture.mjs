import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, parse, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { historicalDiagnosticFlowManifest } from './http-runtime-historical-flow-manifest.mjs';
import { historicalDiagnosticReferenceManifest } from './http-runtime-historical-reference-manifest.mjs';

// Pure parser fixture facts. These files/bytes are test-owned copies, never a
// private live build handle, producing build, native worker or custody proof.
export function createProtocolFixture(repository, root) {
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const blob = (bytes) =>
    createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const put = (relative, bytes) => {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    return file;
  };
  const byteRow = (relative, source = false) => {
    const file = join(root, relative),
      bytes = readFileSync(file),
      stat = lstatSync(file);
    return source
      ? {
          path: relative,
          mode: '100644',
          blob: blob(bytes),
          permissions: stat.mode & 0o7777,
          sha256: hash(bytes),
          byteLength: bytes.length,
        }
      : {
          path: relative,
          sha256: hash(bytes),
          byteLength: bytes.length,
          permissions: stat.mode & 0o7777,
        };
  };
  const provenance = (file) => {
    const bytes = readFileSync(file),
      stat = lstatSync(file);
    return {
      path: file,
      url: pathToFileURL(file).href,
      sha256: hash(bytes),
      permissions: stat.mode & 0o7777,
      byteLength: bytes.length,
      device: stat.dev,
      inode: stat.ino,
    };
  };
  const bootstrapSource = 'reference/api/src/bootstrap.ts',
    bootstrapEmitted = 'reference/api/dist/reference/api/src/bootstrap.js';
  const source = readFileSync(join(repository, bootstrapSource));
  assert.equal(hash(source), 'ae8bb32ba4e6598b72488ee65a64046db2535db486588b775deb69deac7c7553');
  put(bootstrapSource, source);
  // An explicit nonexecuted emitted-fixture byte row. No compiler relation is
  // asserted by this pure parser fixture or by the component's false flags.
  const emitted = Buffer.from(
    '"use strict";\nexports.createReferenceApplication = createReferenceApplication;\nasync function createReferenceApplication() { throw new Error("parser fixture never invokes application"); }\n',
  );
  put(bootstrapEmitted, emitted);
  put(
    `${bootstrapEmitted}.map`,
    Buffer.from(
      '{"version":3,"file":"bootstrap.js","sources":["../../../src/bootstrap.ts"],"mappings":"AAAA"}',
    ),
  );
  const controls = [
    'scripts/lib/http-composition-roster.mjs',
    'scripts/lib/http-runtime-worker.mjs',
    'scripts/lib/http-module-custody.mjs',
  ];
  const required = [
    'scripts/lib/http-runtime-census.mjs',
    'scripts/lib/http-runtime-bindings.mjs',
    bootstrapEmitted,
  ];
  for (const file of [...controls, ...required.filter((f) => f !== bootstrapEmitted)])
    put(file, readFileSync(join(repository, file)));
  put('reference/api/package.json', historicalDiagnosticReferenceManifest());
  put('packages/flow/package.json', historicalDiagnosticFlowManifest());
  const anchorFacts = [
    [
      'reference/api/package.json',
      'scripts/lib/http-module-custody.mjs',
      "createRequire(new URL('../../reference/api/package.json', import.meta.url))('reflect-metadata')",
      ['reflect-metadata'],
    ],
    [
      'packages/flow/package.json',
      'scripts/lib/http-runtime-census.mjs',
      "createRequire(new URL('../../packages/flow/package.json', import.meta.url))",
      [
        '@nestjs/core',
        '@nestjs/core/router/router-explorer',
        '@nestjs/core/adapters/http-adapter',
        '@nestjs/common',
        '@nestjs/common/constants',
        '@stynx-nyx/auth',
        '@nestjs/platform-express',
      ],
    ],
  ].map(([manifestPath, callerPath, literal, requests]) => {
    const physical = (relative) => {
      const file = join(root, relative),
        stat = lstatSync(file);
      return {
        ...byteRow(relative, true),
        url: pathToFileURL(file).href,
        device: stat.dev,
        inode: stat.ino,
      };
    };
    const callerText = readFileSync(join(root, callerPath), 'utf8');
    assert.equal(callerText.split(literal).length, 2);
    const start = callerText.indexOf(literal);
    return {
      classification: 'NON_EVALUATED_RESOLUTION_ANCHOR',
      manifest: physical(manifestPath),
      caller: {
        ...physical(callerPath),
        callsite: {
          kind: 'DECLARED_REVIEWED_CALLSITE',
          start,
          end: start + literal.length,
          literal,
        },
      },
      requests,
      conditions: ['require', 'node', 'node-addons', 'module-sync'],
    };
  });
  const installed = createRequire(join(repository, 'packages/flow/package.json')).resolve(
    '@nestjs/core/nest-application.js',
  );
  const nestRoot = join(root, 'node_modules/@nestjs/core');
  for (const relative of ['nest-application.js', 'helpers/optional-require.js', 'package.json'])
    put(`node_modules/@nestjs/core/${relative}`, readFileSync(join(dirname(installed), relative)));
  const parent = provenance(join(nestRoot, 'nest-application.js')),
    helper = provenance(join(nestRoot, 'helpers/optional-require.js')),
    manifest = provenance(join(nestRoot, 'package.json'));
  const parentText = readFileSync(parent.path, 'utf8');
  const scopes = createRequire(parent.path).resolve.paths('@nestjs/websockets/socket-module');
  const localPaths = [];
  for (let dir = nestRoot; ; dir = dirname(dir)) {
    if (basename(dir) !== 'node_modules') localPaths.push(join(dir, 'node_modules'));
    if (dirname(dir) === dir) break;
  }
  assert.deepEqual(scopes.slice(0, localPaths.length), localPaths);
  const globalFallbackPaths = scopes.slice(localPaths.length);
  const absence = (scope, packageName) => {
    const packageRoot = join(scope, packageName),
      base = parse(packageRoot).root,
      parts = packageRoot.slice(base.length).split(sep),
      chain = [];
    let file = base;
    for (let i = -1; i < parts.length; i++) {
      if (i >= 0) file = join(file, parts[i]);
      let stat;
      try {
        stat = lstatSync(file);
      } catch (error) {
        assert.equal(error.code, 'ENOENT');
        assert(chain.length);
        return {
          scope,
          packageRoot,
          outcome: 'ENOENT',
          firstMissingPath: file,
          missingComponentChain: parts.slice(i),
          nearestExistingAncestor: chain.at(-1),
          chain,
        };
      }
      assert.notEqual(
        file,
        packageRoot,
        'Fixture must observe complete package absence, not a present/partial root',
      );
      const link = stat.isSymbolicLink();
      assert(link ? statSync(file).isDirectory() : stat.isDirectory());
      chain.push({
        path: file,
        canonicalPath: realpathSync(file),
        kind: link ? 'symbolic-link' : 'directory',
        permissions: stat.mode & 0o7777,
        device: stat.dev,
        inode: stat.ino,
        linkTarget: link ? readlinkSync(file) : null,
      });
    }
    throw new Error('Fixture package absence was not observed');
  };
  const rules = [
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
  const optionalProbes = rules.map((rule) => {
    const callback = `() => require('${rule.specifier}')`,
      statement = `const { ${rule.binding} } = (0, optional_require_1.optionalRequire)('${rule.specifier}', ${callback});`;
    assert.equal(parentText.slice(rule.start, rule.end), callback);
    assert.equal(parentText.split(statement).length, 2);
    return {
      ruleId: rule.ruleId,
      declaredCallsite: {
        kind: 'DECLARED_UNIQUE_LITERAL_CALLBACK',
        start: rule.start,
        end: rule.end,
        callbackSha256: hash(callback),
        statementSha256: hash(statement),
      },
      provenance: { parent, helper, manifest },
      search: { scopes, localPaths, globalFallbackPaths },
      absence: scopes.map((scope) => absence(scope, rule.packageName)),
    };
  });
  const sourceStart = source.toString().indexOf('export async function createReferenceApplication');
  const emittedStart = emitted.toString().indexOf('async function createReferenceApplication');
  const observation = {
    schemaVersion: 1,
    scope: 'bootstrap-module-only',
    compositionId: 'reference',
    bootstrap: {
      source: byteRow(bootstrapSource, true),
      emitted: byteRow(bootstrapEmitted),
      map: byteRow(`${bootstrapEmitted}.map`),
    },
    namedExport: 'createReferenceApplication',
    evaluatedModuleURL: pathToFileURL(join(root, bootstrapEmitted)).href,
    actualNamedExportObserved: true,
    sourceDeclaration: { start: sourceStart, end: source.toString().lastIndexOf('}') + 1 },
    emittedDeclaration: { start: emittedStart, end: emitted.toString().lastIndexOf('}') + 1 },
    factoryInvoked: false,
    constructorProvenance: 'UNVERIFIED',
    sourceMapFunctionCorrespondence: 'UNVERIFIED',
    applicationRoot: 'UNVERIFIED',
    middleware: 'UNVERIFIED',
    reachability: 'UNVERIFIED',
    blockedOn: [
      'privately-owned-admitted-runtime-fixture',
      'complete-constructor-registry',
      'complete-middleware-observation',
    ],
    runtimeCustodyComplete: false,
    readinessPromoting: false,
  };
  const roster = [...controls, ...required].map((file) => {
    const row = byteRow(file);
    return {
      url: pathToFileURL(join(root, file)).href,
      sha256: row.sha256,
      moduleKind: file.endsWith('.mjs') ? 'module' : 'commonjs',
      byteLength: row.byteLength,
    };
  });
  for (const [name, row] of Object.entries({ parent, helper, manifest }))
    roster.push({
      url: row.url,
      sha256: row.sha256,
      moduleKind: name === 'manifest' ? 'json' : 'commonjs',
      byteLength: row.byteLength,
    });
  const nodePath = realpathSync(process.execPath),
    nodeSha256 = hash(readFileSync(nodePath)),
    descriptorSha256 = hash('explicit pure protocol fixture descriptor');
  const template = {
    tree: 'b'.repeat(40),
    parentPid: process.pid,
    descriptorSha256,
    nodePath,
    nodeSha256,
    cwd: root,
    environment: {
      PATH: hash(`${dirname(nodePath)}:/usr/bin:/bin`),
      NODE_DISABLE_COMPILE_CACHE: hash('1'),
      STYNX_HTTP_JOB_SHA256: hash(descriptorSha256),
    },
    roster,
    observation,
    trustedBootstrap: controls.map((file) => {
      const row = byteRow(file);
      return {
        ...row,
        blob: blob(readFileSync(join(root, file))),
        classification: 'observer-source',
      };
    }),
    optionalProbes,
    requiredEvaluationURLs: required.map((file) => pathToFileURL(join(root, file)).href),
  };
  const context = () => {
    const nonce = randomUUID(),
      candidateCommit = 'a'.repeat(40),
      bindings = structuredClone(template);
    bindings.resolutionAnchors = structuredClone(anchorFacts).map((entry) => ({
      ...entry,
      candidateCommit,
      tree: bindings.tree,
      nonce,
    }));
    return { nonce, candidateCommit, pid: process.pid, mode: 'bootstrap-module-only', bindings };
  };
  return { context, rules, template, hash };
}

export function moduleFacts(expected, phase = false) {
  const binding = expected.bindings;
  const urls = [...binding.requiredEvaluationURLs];
  if (phase)
    for (const row of Object.values(binding.optionalProbes[0].provenance).slice(0, 2))
      urls.push(row.url);
  const evaluations = urls.map((url, index) => {
    const row = binding.roster.find((entry) => entry.url === url);
    return {
      sequence: index + 1,
      url,
      canonicalURL: url,
      sha256: row.sha256,
      byteLength: row.byteLength,
      observedFormat: row.moduleKind,
      moduleKind: row.moduleKind,
    };
  });
  const optionalResolutionProbes = phase
    ? binding.optionalProbes.map((rule, index) => ({
        schemaVersion: 1,
        ruleId: rule.ruleId,
        outcome: 'OPTIONAL_PACKAGE_ABSENT_NOT_EVALUATED',
        planId: 'c'.repeat(64),
        identity: {
          candidateCommit: expected.candidateCommit,
          tree: binding.tree,
          nonce: expected.nonce,
          parentPid: binding.parentPid,
          descriptorSha256: binding.descriptorSha256,
          pid: expected.pid,
          cwd: binding.cwd,
          nodePath: binding.nodePath,
          nodeSha256: binding.nodeSha256,
          environment: structuredClone(binding.environment),
          parentCorroborationRequired: true,
        },
        sequence: evaluations.length + index + 1,
        occurrence: 1,
        specifier: rule.ruleId.endsWith('WEBSOCKETS')
          ? '@nestjs/websockets/socket-module'
          : '@nestjs/microservices/microservices-module',
        parentURL: rule.provenance.parent.url,
        conditions: ['require', 'node', 'node-addons', 'module-sync'],
        nativeCode: 'MODULE_NOT_FOUND',
        declaredCallsite: structuredClone(rule.declaredCallsite),
        provenance: structuredClone(rule.provenance),
        search: structuredClone(rule.search),
        absence: structuredClone(rule.absence),
        beforeAndEdgeAbsenceId: createHash('sha256')
          .update(JSON.stringify(rule.absence))
          .digest('hex'),
        pointInTimeOnly: true,
        parentCorroborationRequired: true,
        runtimeCustodyComplete: false,
        readinessPromoting: false,
      }))
    : [];
  return {
    schemaVersion: 1,
    complete: false,
    readinessPromoting: false,
    nodeVersion: '24.20.0',
    nodeSha256: binding.nodeSha256,
    resolutions: [],
    evaluations,
    resolutionAnchors: structuredClone(binding.resolutionAnchors),
    optionalResolutionProbes,
    supervisedStartup: {
      candidateCommit: expected.candidateCommit,
      tree: binding.tree,
      nonce: expected.nonce,
      parentPid: binding.parentPid,
      descriptorSha256: binding.descriptorSha256,
      parentCorroborationRequired: true,
      publicRegistrationGuard: 'CLOSED_SUPERVISED_PUBLIC_SURFACES',
      ownHookRegistrations: 1,
      processSandbox: false,
    },
  };
}
