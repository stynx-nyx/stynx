import { httpComposition, isHttpComposition } from './http-composition-roster.mjs';
import { Buffer } from 'node:buffer';
import { isDeepStrictEqual, types } from 'node:util';
import { createHash } from 'node:crypto';
import { isBuiltin } from 'node:module';
import { basename, dirname, isAbsolute, join, normalize, parse, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frameLimit = 32 * 1024 * 1024;
const captureLimit = 64 * 1024 * 1024;

function plainJson(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || types.isProxy(value) || seen.has(value)) return false;
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) return false;
  seen.add(value);
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (array && key === 'length') continue;
    if (
      array &&
      (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length)
    )
      return false;
    if (
      typeof key !== 'string' ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, 'value') ||
      !plainJson(descriptor.value, seen)
    )
      return false;
  }
  if (array && keys.length !== value.length + 1) return false;
  seen.delete(value);
  return true;
}

function invalid() {
  const error = new Error('Runtime worker did not complete its closed diagnostic protocol');
  error.code = 'HTTP_RUNTIME_PROTOCOL_INVALID';
  throw error;
}

function safePlainJson(value) {
  try {
    return plainJson(value);
  } catch {
    return false;
  }
}

// JSON.stringify consults inherited toJSON hooks before its replacer. Build a
// descriptor-only data copy with no object OR array prototype first. Callers
// below have already validated the complete input as plain JSON data.
function stringifyPlainJson(value) {
  const copy = (item) => {
    if (item === null || typeof item !== 'object') return item;
    const result = Array.isArray(item) ? [] : Object.create(null);
    if (Array.isArray(item)) Object.setPrototypeOf(result, null);
    for (const key of Object.keys(item))
      result[key] = copy(Object.getOwnPropertyDescriptor(item, key).value);
    return result;
  };
  return JSON.stringify(copy(value));
}

/**
 * Script-internal serializer seam. Validate without invoking accessors, proxies
 * or inherited toJSON hooks before using the actual protocol serializer.
 * This data operation supplies no process custody or protocol admission.
 */
export function serializeHttpRuntimePlainJson(value) {
  if (arguments.length !== 1 || !safePlainJson(value)) invalid();
  return stringifyPlainJson(value);
}

function ownFields(value, names) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    names.every((name) => Object.hasOwn(value, name))
  );
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hashValue = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const commitValue = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const natural = (value) => Number.isSafeInteger(value) && value >= 0;
const positive = (value) => natural(value) && value > 0;
const exact = (value, keys) =>
  ownFields(value, keys) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const strings = (value, nonempty = false) =>
  Array.isArray(value) &&
  (!nonempty || value.length > 0) &&
  value.every((entry) => typeof entry === 'string');
const uniqueStrings = (value, nonempty = false) =>
  strings(value, nonempty) && new Set(value).size === value.length;
const absolute = (value) =>
  typeof value === 'string' && isAbsolute(value) && normalize(value) === value;
const fileURL = (value) => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'file:' &&
      !url.search &&
      !url.hash &&
      pathToFileURL(fileURLToPath(url)).href === value
    );
  } catch {
    return false;
  }
};
const permissions = (value) => natural(value) && value <= 0o7777;
const moduleKinds = new Set(['module', 'commonjs', 'json']);
const ruleTable = [
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
const parentHash = '86968141beeaa93daea62a4ec4e1f36bd31f88eb5f0b3a0d2b2d28aefe5406c2';
const helperHash = 'c8a109dab1b2461e866fe04b8be5988ccc199a2239c730abc05fc28c0f85d7f2';
const manifestHash = '8335e997f7dbe8e797298caa94291dead8503bbf34e546d591581109284ca429';
const chainKeys = ['path', 'canonicalPath', 'kind', 'permissions', 'device', 'inode', 'linkTarget'];
const absenceKeys = [
  'scope',
  'packageRoot',
  'outcome',
  'firstMissingPath',
  'missingComponentChain',
  'nearestExistingAncestor',
  'chain',
];
const provenanceKeys = ['path', 'url', 'sha256', 'permissions', 'byteLength', 'device', 'inode'];
const callsiteKeys = ['kind', 'start', 'end', 'callbackSha256', 'statementSha256'];
const startupKeys = [
  'candidateCommit',
  'tree',
  'nonce',
  'parentPid',
  'descriptorSha256',
  'parentCorroborationRequired',
  'publicRegistrationGuard',
  'ownHookRegistrations',
  'processSandbox',
];
const identityKeys = [
  'candidateCommit',
  'tree',
  'nonce',
  'parentPid',
  'descriptorSha256',
  'pid',
  'cwd',
  'nodePath',
  'nodeSha256',
  'environment',
  'parentCorroborationRequired',
];
const probeKeys = [
  'schemaVersion',
  'ruleId',
  'outcome',
  'planId',
  'identity',
  'sequence',
  'occurrence',
  'specifier',
  'parentURL',
  'conditions',
  'nativeCode',
  'declaredCallsite',
  'provenance',
  'search',
  'absence',
  'beforeAndEdgeAbsenceId',
  'pointInTimeOnly',
  'parentCorroborationRequired',
  'runtimeCustodyComplete',
  'readinessPromoting',
];

function localSearchPaths(directory) {
  const paths = [];
  for (let path = directory; ; path = dirname(path)) {
    if (basename(path) !== 'node_modules') paths.push(join(path, 'node_modules'));
    if (dirname(path) === path) return paths;
  }
}

function validChainEntry(value) {
  return (
    exact(value, chainKeys) &&
    absolute(value.path) &&
    absolute(value.canonicalPath) &&
    permissions(value.permissions) &&
    natural(value.device) &&
    natural(value.inode) &&
    ((value.kind === 'directory' && value.linkTarget === null) ||
      (value.kind === 'symbolic-link' &&
        typeof value.linkTarget === 'string' &&
        value.linkTarget.length > 0))
  );
}

function validAbsence(value, scope, packageName) {
  if (
    !exact(value, absenceKeys) ||
    value.scope !== scope ||
    value.packageRoot !== join(scope, packageName) ||
    value.outcome !== 'ENOENT' ||
    !absolute(value.firstMissingPath) ||
    !strings(value.missingComponentChain, true) ||
    !Array.isArray(value.chain) ||
    value.chain.length === 0 ||
    !value.chain.every(validChainEntry) ||
    !validChainEntry(value.nearestExistingAncestor) ||
    !isDeepStrictEqual(value.nearestExistingAncestor, value.chain.at(-1))
  )
    return false;
  const root = parse(value.packageRoot).root;
  const parts = value.packageRoot.slice(root.length).split(sep);
  if (
    value.chain[0].path !== root ||
    value.chain.length > parts.length ||
    !isDeepStrictEqual(value.missingComponentChain, parts.slice(value.chain.length - 1))
  )
    return false;
  for (let i = 1; i < value.chain.length; i++)
    if (value.chain[i].path !== join(value.chain[i - 1].path, parts[i - 1])) return false;
  return (
    value.firstMissingPath === join(value.chain.at(-1).path, value.missingComponentChain[0]) &&
    join(value.firstMissingPath, ...value.missingComponentChain.slice(1)) === value.packageRoot
  );
}

function orderedAbsence(value) {
  const chainEntry = (entry) => Object.fromEntries(chainKeys.map((key) => [key, entry[key]]));
  return value.map((entry) => ({
    scope: entry.scope,
    packageRoot: entry.packageRoot,
    outcome: entry.outcome,
    firstMissingPath: entry.firstMissingPath,
    missingComponentChain: entry.missingComponentChain,
    nearestExistingAncestor: chainEntry(entry.nearestExistingAncestor),
    chain: entry.chain.map(chainEntry),
  }));
}

function validCallsite(value, rule) {
  const callback = `() => require('${rule.specifier}')`;
  const statement = `const { ${rule.binding} } = (0, optional_require_1.optionalRequire)('${rule.specifier}', ${callback});`;
  return (
    exact(value, callsiteKeys) &&
    value.kind === 'DECLARED_UNIQUE_LITERAL_CALLBACK' &&
    value.start === rule.start &&
    value.end === rule.end &&
    value.callbackSha256 === sha256(callback) &&
    value.statementSha256 === sha256(statement)
  );
}

function validProvenance(value, members) {
  if (!exact(value, ['parent', 'helper', 'manifest'])) return false;
  const expected = {
    parent: [parentHash, 'commonjs'],
    helper: [helperHash, 'commonjs'],
    manifest: [manifestHash, 'json'],
  };
  for (const name of ['parent', 'helper', 'manifest']) {
    const file = value[name],
      member = members.get(file?.url);
    if (
      !exact(file, provenanceKeys) ||
      !absolute(file.path) ||
      !fileURL(file.url) ||
      file.url !== pathToFileURL(file.path).href ||
      file.sha256 !== expected[name][0] ||
      !permissions(file.permissions) ||
      !natural(file.byteLength) ||
      !natural(file.device) ||
      !natural(file.inode) ||
      !member ||
      member.sha256 !== file.sha256 ||
      member.byteLength !== file.byteLength ||
      member.moduleKind !== expected[name][1]
    )
      return false;
  }
  return (
    basename(value.parent.path) === 'nest-application.js' &&
    value.helper.path === join(dirname(value.parent.path), 'helpers/optional-require.js') &&
    value.manifest.path === join(dirname(value.parent.path), 'package.json')
  );
}

function validProbeExpectation(value, members) {
  if (!exact(value, ['ruleId', 'declaredCallsite', 'provenance', 'search', 'absence']))
    return false;
  const rule = ruleTable.find((entry) => entry.ruleId === value.ruleId);
  if (
    !rule ||
    !validCallsite(value.declaredCallsite, rule) ||
    !validProvenance(value.provenance, members) ||
    !exact(value.search, ['scopes', 'localPaths', 'globalFallbackPaths']) ||
    !uniqueStrings(value.search.scopes, true) ||
    !value.search.scopes.every(absolute) ||
    !uniqueStrings(value.search.localPaths, true) ||
    !uniqueStrings(value.search.globalFallbackPaths) ||
    !isDeepStrictEqual(
      value.search.localPaths,
      localSearchPaths(dirname(value.provenance.parent.path)),
    ) ||
    !isDeepStrictEqual(value.search.scopes, [
      ...value.search.localPaths,
      ...value.search.globalFallbackPaths,
    ]) ||
    !Array.isArray(value.absence) ||
    value.absence.length !== value.search.scopes.length
  )
    return false;
  return value.absence.every((entry, i) =>
    validAbsence(entry, value.search.scopes[i], rule.packageName),
  );
}

function validByteRow(value, source = false) {
  const keys = source
    ? ['path', 'mode', 'blob', 'permissions', 'sha256', 'byteLength']
    : ['path', 'sha256', 'byteLength', 'permissions'];
  return (
    exact(value, keys) &&
    typeof value.path === 'string' &&
    hashValue(value.sha256) &&
    natural(value.byteLength) &&
    permissions(value.permissions) &&
    (!source || (value.mode === '100644' && commitValue(value.blob)))
  );
}

function validObservation(value, cwd) {
  const keys = [
    'schemaVersion',
    'scope',
    'compositionId',
    'bootstrap',
    'namedExport',
    'evaluatedModuleURL',
    'actualNamedExportObserved',
    'sourceDeclaration',
    'emittedDeclaration',
    'factoryInvoked',
    'constructorProvenance',
    'sourceMapFunctionCorrespondence',
    'applicationRoot',
    'middleware',
    'reachability',
    'blockedOn',
    'runtimeCustodyComplete',
    'readinessPromoting',
  ];
  if (
    !exact(value, keys) ||
    value.schemaVersion !== 1 ||
    value.scope !== 'bootstrap-module-only' ||
    !isHttpComposition(value.compositionId) ||
    value.namedExport !== 'createReferenceApplication' ||
    value.actualNamedExportObserved !== true ||
    value.factoryInvoked !== false ||
    value.runtimeCustodyComplete !== false ||
    value.readinessPromoting !== false ||
    !exact(value.bootstrap, ['source', 'emitted', 'map']) ||
    !validByteRow(value.bootstrap.source, true) ||
    !validByteRow(value.bootstrap.emitted) ||
    !validByteRow(value.bootstrap.map) ||
    value.bootstrap.source.path !== httpComposition(value.compositionId).source ||
    (value.compositionId === 'reference' &&
      value.bootstrap.source.sha256 !==
        'ae8bb32ba4e6598b72488ee65a64046db2535db486588b775deb69deac7c7553') ||
    value.bootstrap.emitted.path !== httpComposition(value.compositionId).emitted ||
    value.bootstrap.map.path !== `${value.bootstrap.emitted.path}.map` ||
    value.evaluatedModuleURL !== pathToFileURL(join(cwd, value.bootstrap.emitted.path)).href ||
    !isDeepStrictEqual(value.blockedOn, [
      'privately-owned-admitted-runtime-fixture',
      'complete-constructor-registry',
      'complete-middleware-observation',
    ])
  )
    return false;
  for (const field of [
    'constructorProvenance',
    'sourceMapFunctionCorrespondence',
    'applicationRoot',
    'middleware',
    'reachability',
  ])
    if (value[field] !== 'UNVERIFIED') return false;
  for (const field of ['sourceDeclaration', 'emittedDeclaration'])
    if (
      !exact(value[field], ['start', 'end']) ||
      !natural(value[field].start) ||
      !positive(value[field].end) ||
      value[field].end <= value[field].start
    )
      return false;
  return true;
}

function validResolutionAnchors(anchors, binding, context, members) {
  const rules = [
    [
      'reference/api/package.json',
      'd2e25e51077b2a2dd598eabafbf1899708bad21287ded71ab8c7bcaee7c9f601',
      'be70d59c463cb56e9f08c3f549c874015a5a58f3',
      1899,
      'scripts/lib/http-module-custody.mjs',
      "createRequire(new URL('../../reference/api/package.json', import.meta.url))('reflect-metadata')",
      ['reflect-metadata'],
    ],
    [
      'packages/flow/package.json',
      '7a9bc69161ab7e2a2c2f1a61e6dd94ee558f1c76b25c3aa48fd564f0e633bbb1',
      'db4b602b7b72ecc2c1ac4ba549b2f28793c74da5',
      1827,
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
  ];
  if (context.mode === 'reference-owned-loopback')
    rules.push([
      'packages/flow/package.json',
      '7a9bc69161ab7e2a2c2f1a61e6dd94ee558f1c76b25c3aa48fd564f0e633bbb1',
      'db4b602b7b72ecc2c1ac4ba549b2f28793c74da5',
      1827,
      'scripts/lib/http-reference-nest-guard.mjs',
      "createRequire(new URL('../../packages/flow/package.json', import.meta.url))",
      [
        '@nestjs/core/nest-factory',
        '@nestjs/core/nest-application',
        '@nestjs/platform-express/adapters/express-adapter',
        '@nestjs/core/package.json',
        '@nestjs/platform-express/package.json',
      ],
    ]);
  const physicalKeys = [
    'path',
    'url',
    'sha256',
    'byteLength',
    'permissions',
    'device',
    'inode',
    'blob',
    'mode',
  ];
  if (!Array.isArray(anchors) || anchors.length !== rules.length) return false;
  if (
    context.mode === 'reference-owned-loopback' &&
    !isDeepStrictEqual(anchors[1].manifest, anchors[2].manifest)
  )
    return false;
  for (const [
    index,
    [path, sha256, blob, byteLength, callerPath, literal, requests],
  ] of rules.entries()) {
    const anchor = anchors[index];
    if (
      !exact(anchor, [
        'classification',
        'candidateCommit',
        'tree',
        'nonce',
        'manifest',
        'caller',
        'requests',
        'conditions',
      ]) ||
      anchor.classification !== 'NON_EVALUATED_RESOLUTION_ANCHOR' ||
      anchor.candidateCommit !== context.candidateCommit ||
      anchor.tree !== binding.tree ||
      anchor.nonce !== context.nonce ||
      !isDeepStrictEqual(anchor.requests, requests) ||
      !isDeepStrictEqual(anchor.conditions, ['require', 'node', 'node-addons', 'module-sync']) ||
      !exact(anchor.manifest, physicalKeys) ||
      !exact(anchor.caller, [...physicalKeys, 'callsite']) ||
      anchor.manifest.path !== path ||
      anchor.manifest.sha256 !== sha256 ||
      anchor.manifest.blob !== blob ||
      anchor.manifest.byteLength !== byteLength ||
      anchor.manifest.permissions !== 0o644 ||
      anchor.caller.path !== callerPath
    )
      return false;
    for (const row of [anchor.manifest, anchor.caller])
      if (
        row.url !== pathToFileURL(join(binding.cwd, row.path)).href ||
        !fileURL(row.url) ||
        !hashValue(row.sha256) ||
        !natural(row.byteLength) ||
        !permissions(row.permissions) ||
        !natural(row.device) ||
        !natural(row.inode) ||
        !commitValue(row.blob) ||
        row.mode !== '100644'
      )
        return false;
    const member = members.get(anchor.caller.url);
    const callsite = anchor.caller.callsite;
    if (
      members.has(anchor.manifest.url) ||
      !member ||
      member.moduleKind !== 'module' ||
      member.sha256 !== anchor.caller.sha256 ||
      member.byteLength !== anchor.caller.byteLength ||
      !exact(callsite, ['kind', 'start', 'end', 'literal']) ||
      callsite.kind !== 'DECLARED_REVIEWED_CALLSITE' ||
      callsite.literal !== literal ||
      !natural(callsite.start) ||
      callsite.end !== callsite.start + literal.length ||
      callsite.end > anchor.caller.byteLength
    )
      return false;
    if (callerPath === 'scripts/lib/http-module-custody.mjs') {
      const control = binding.trustedBootstrap.find((row) => row.path === callerPath);
      if (
        !control ||
        control.sha256 !== anchor.caller.sha256 ||
        control.blob !== anchor.caller.blob ||
        control.byteLength !== anchor.caller.byteLength ||
        control.permissions !== anchor.caller.permissions
      )
        return false;
    }
  }
  return true;
}

function validBindings(value, context) {
  if (
    !exact(value, [
      'tree',
      'parentPid',
      'descriptorSha256',
      'nodePath',
      'nodeSha256',
      'cwd',
      'environment',
      'roster',
      'resolutionAnchors',
      'observation',
      'trustedBootstrap',
      'optionalProbes',
      'requiredEvaluationURLs',
    ]) ||
    !commitValue(value.tree) ||
    !positive(value.parentPid) ||
    !hashValue(value.descriptorSha256) ||
    !absolute(value.nodePath) ||
    !hashValue(value.nodeSha256) ||
    !absolute(value.cwd) ||
    !ownFields(value.environment, []) ||
    Array.isArray(value.environment) ||
    !Object.values(value.environment).every(hashValue) ||
    value.environment.STYNX_HTTP_JOB_SHA256 !== sha256(value.descriptorSha256) ||
    !Array.isArray(value.roster) ||
    value.roster.length === 0 ||
    !validObservation(value.observation, value.cwd) ||
    !Array.isArray(value.trustedBootstrap) ||
    value.trustedBootstrap.length !== 3 ||
    !Array.isArray(value.optionalProbes) ||
    value.optionalProbes.length > 2
  )
    return false;
  const members = new Map();
  for (const row of value.roster) {
    if (
      !exact(row, ['url', 'sha256', 'moduleKind', 'byteLength']) ||
      !fileURL(row.url) ||
      !hashValue(row.sha256) ||
      !moduleKinds.has(row.moduleKind) ||
      !natural(row.byteLength) ||
      members.has(row.url)
    )
      return false;
    members.set(row.url, row);
  }
  const controlPaths = [
    'scripts/lib/http-composition-roster.mjs',
    'scripts/lib/http-runtime-worker.mjs',
    'scripts/lib/http-module-custody.mjs',
  ];
  for (let i = 0; i < value.trustedBootstrap.length; i++) {
    const row = value.trustedBootstrap[i];
    if (
      !exact(row, ['path', 'sha256', 'byteLength', 'permissions', 'blob', 'classification']) ||
      row.path !== controlPaths[i] ||
      !hashValue(row.sha256) ||
      !natural(row.byteLength) ||
      !permissions(row.permissions) ||
      !commitValue(row.blob) ||
      row.classification !== 'observer-source'
    )
      return false;
    const member = members.get(pathToFileURL(join(value.cwd, row.path)).href);
    if (
      !member ||
      member.moduleKind !== 'module' ||
      member.sha256 !== row.sha256 ||
      member.byteLength !== row.byteLength
    )
      return false;
  }
  if (!validResolutionAnchors(value.resolutionAnchors, value, context, members)) return false;
  const required = [
    'scripts/lib/http-runtime-census.mjs',
    'scripts/lib/http-runtime-bindings.mjs',
    value.observation.bootstrap.emitted.path,
  ].map((path) => pathToFileURL(join(value.cwd, path)).href);
  if (
    !isDeepStrictEqual(value.requiredEvaluationURLs, required) ||
    !required.every((url) => members.has(url))
  )
    return false;
  const seen = new Set();
  let optionalOrigin;
  for (const probe of value.optionalProbes) {
    if (
      !validProbeExpectation(probe, members) ||
      seen.has(probe.ruleId) ||
      (optionalOrigin && !isDeepStrictEqual(probe.provenance, optionalOrigin))
    )
      return false;
    optionalOrigin ??= probe.provenance;
    seen.add(probe.ruleId);
  }
  return true;
}

function validModules(value, expected) {
  const binding = expected.bindings;
  if (
    !exact(value, [
      'schemaVersion',
      'complete',
      'readinessPromoting',
      'nodeVersion',
      'nodeSha256',
      'resolutions',
      'evaluations',
      'resolutionAnchors',
      'optionalResolutionProbes',
      'supervisedStartup',
    ]) ||
    value.schemaVersion !== 1 ||
    value.complete !== false ||
    value.readinessPromoting !== false ||
    value.nodeVersion !== '24.20.0' ||
    value.nodeSha256 !== binding.nodeSha256 ||
    !Array.isArray(value.resolutions) ||
    !Array.isArray(value.evaluations) ||
    !isDeepStrictEqual(value.resolutionAnchors, binding.resolutionAnchors) ||
    !Array.isArray(value.optionalResolutionProbes) ||
    value.optionalResolutionProbes.length > 2 ||
    !exact(value.supervisedStartup, startupKeys) ||
    !isDeepStrictEqual(value.supervisedStartup, {
      candidateCommit: expected.candidateCommit,
      tree: binding.tree,
      nonce: expected.nonce,
      parentPid: binding.parentPid,
      descriptorSha256: binding.descriptorSha256,
      parentCorroborationRequired: true,
      publicRegistrationGuard: 'CLOSED_SUPERVISED_PUBLIC_SURFACES',
      ownHookRegistrations: 1,
      processSandbox: false,
    })
  )
    return false;
  const members = new Map(binding.roster.map((row) => [row.url, row]));
  const sequences = new Set();
  const sequencePopulation = (rows, validate) => {
    let previous = 0;
    for (const row of rows) {
      if (
        !row ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        !positive(row.sequence) ||
        row.sequence <= previous ||
        sequences.has(row.sequence) ||
        !validate(row)
      )
        return false;
      previous = row.sequence;
      sequences.add(row.sequence);
    }
    return true;
  };
  const parent = (row) => {
    const url = row.parentURL;
    if (
      url === null ||
      (fileURL(url) && members.has(url)) ||
      (typeof url === 'string' && url.startsWith('node:') && isBuiltin(url))
    )
      return true;
    const eligible = binding.resolutionAnchors.filter(
      (anchor) =>
        anchor.manifest.url === url &&
        anchor.requests.includes(row.specifier) &&
        isDeepStrictEqual(row.conditions, anchor.conditions) &&
        (anchor.manifest.path === 'reference/api/package.json' ||
          value.evaluations.some(
            (entry) =>
              entry !== null &&
              typeof entry === 'object' &&
              !Array.isArray(entry) &&
              entry.canonicalURL === anchor.caller.url &&
              entry.sha256 === anchor.caller.sha256 &&
              entry.byteLength === anchor.caller.byteLength &&
              entry.moduleKind === 'module' &&
              positive(entry.sequence) &&
              entry.sequence < row.sequence,
          )),
    );
    return eligible.length === 1;
  };
  if (
    !sequencePopulation(value.resolutions, (row) => {
      const keys = ['sequence', 'specifier', 'parentURL', 'conditions', 'url', 'builtin'];
      if (row.builtin === false) keys.push('canonicalURL');
      if (
        !exact(row, keys) ||
        typeof row.specifier !== 'string' ||
        !parent(row) ||
        !uniqueStrings(row.conditions, true)
      )
        return false;
      if (row.builtin === true)
        return typeof row.url === 'string' && row.url.startsWith('node:') && isBuiltin(row.url);
      return (
        row.builtin === false &&
        fileURL(row.url) &&
        fileURL(row.canonicalURL) &&
        members.has(row.canonicalURL)
      );
    })
  )
    return false;
  if (
    !sequencePopulation(value.evaluations, (row) => {
      const member = members.get(row.canonicalURL);
      return (
        exact(row, [
          'sequence',
          'url',
          'canonicalURL',
          'sha256',
          'byteLength',
          'observedFormat',
          'moduleKind',
        ]) &&
        fileURL(row.url) &&
        fileURL(row.canonicalURL) &&
        member &&
        row.sha256 === member.sha256 &&
        row.byteLength === member.byteLength &&
        row.moduleKind === member.moduleKind &&
        (row.observedFormat === member.moduleKind ||
          (row.observedFormat === null && member.moduleKind === 'commonjs'))
      );
    })
  )
    return false;
  if (
    !binding.requiredEvaluationURLs.every((url) =>
      value.evaluations.some((row) => row.canonicalURL === url),
    )
  )
    return false;
  const seenRules = new Set();
  let planId;
  if (
    !sequencePopulation(value.optionalResolutionProbes, (row) => {
      const rule = ruleTable.find((entry) => entry.ruleId === row.ruleId);
      const admitted = binding.optionalProbes.find((entry) => entry.ruleId === row.ruleId);
      if (
        !exact(row, probeKeys) ||
        !rule ||
        !admitted ||
        seenRules.has(row.ruleId) ||
        row.schemaVersion !== 1 ||
        row.outcome !== 'OPTIONAL_PACKAGE_ABSENT_NOT_EVALUATED' ||
        !hashValue(row.planId) ||
        (planId && planId !== row.planId) ||
        row.occurrence !== 1 ||
        row.specifier !== rule.specifier ||
        row.parentURL !== admitted.provenance.parent.url ||
        ![admitted.provenance.parent.url, admitted.provenance.helper.url].every((url) =>
          value.evaluations.some(
            (entry) => entry.canonicalURL === url && entry.sequence < row.sequence,
          ),
        ) ||
        !isDeepStrictEqual(row.conditions, ['require', 'node', 'node-addons', 'module-sync']) ||
        row.nativeCode !== 'MODULE_NOT_FOUND' ||
        row.pointInTimeOnly !== true ||
        row.parentCorroborationRequired !== true ||
        row.runtimeCustodyComplete !== false ||
        row.readinessPromoting !== false ||
        !exact(row.identity, identityKeys) ||
        !isDeepStrictEqual(row.identity, {
          candidateCommit: expected.candidateCommit,
          tree: binding.tree,
          nonce: expected.nonce,
          parentPid: binding.parentPid,
          descriptorSha256: binding.descriptorSha256,
          pid: expected.pid,
          cwd: binding.cwd,
          nodePath: binding.nodePath,
          nodeSha256: binding.nodeSha256,
          environment: binding.environment,
          parentCorroborationRequired: true,
        }) ||
        !isDeepStrictEqual(row.declaredCallsite, admitted.declaredCallsite) ||
        !isDeepStrictEqual(row.provenance, admitted.provenance) ||
        !isDeepStrictEqual(row.search, admitted.search) ||
        !isDeepStrictEqual(row.absence, admitted.absence) ||
        row.beforeAndEdgeAbsenceId !==
          sha256(serializeHttpRuntimePlainJson(orderedAbsence(row.absence))) ||
        value.resolutions.some(
          (entry) => entry.specifier === row.specifier && entry.parentURL === row.parentURL,
        )
      )
        return false;
      // A full plan includes both rules, including unobserved ones. Format and
      // shared identity are checked; reconstruction from a lone row is not claimed.
      planId = row.planId;
      seenRules.add(row.ruleId);
      return true;
    })
  )
    return false;
  // This fixed worker sends a terminal only after assertValid checks the actual
  // observed cached parent is loaded:true. Its bound source invokes both exact
  // callbacks unconditionally at top level. This is not a generic claim that a
  // load-hook row alone means module execution completed.
  return binding.optionalProbes.every(
    (admitted) =>
      !value.evaluations.some((entry) => entry.canonicalURL === admitted.provenance.parent.url) ||
      seenRules.has(admitted.ruleId),
  );
}

/**
 * Shared strict module-snapshot validator. It grants no mode/startup authority;
 * the supervisor must derive these facts from its actual private child handle.
 */
export function createHttpModuleSnapshotValidator(context) {
  if (
    arguments.length !== 1 ||
    !safePlainJson(context) ||
    !exact(context, ['bindings', 'candidateCommit', 'mode', 'nonce', 'pid']) ||
    context.mode !== 'reference-owned-loopback' ||
    !commitValue(context.candidateCommit) ||
    typeof context.nonce !== 'string' ||
    !/^[a-f0-9-]{36}$/u.test(context.nonce) ||
    !positive(context.pid) ||
    !validBindings(context.bindings, context)
  )
    invalid();
  const expected = JSON.parse(serializeHttpRuntimePlainJson(context));
  return Object.freeze({
    accepts(value) {
      return arguments.length === 1 && safePlainJson(value) && validModules(value, expected);
    },
  });
}

/**
 * The actual supervisor uses this component for parsed IPC frame admission.
 * Context supplied to this lower-level component never proves process custody.
 */
export function createHttpRuntimeProtocol(context) {
  if (
    arguments.length !== 1 ||
    !context ||
    !safePlainJson(context) ||
    Array.isArray(context) ||
    Object.keys(context).sort().join(',') !== 'bindings,candidateCommit,mode,nonce,pid' ||
    typeof context.candidateCommit !== 'string' ||
    typeof context.nonce !== 'string' ||
    !/^[a-f0-9]{40}$/u.test(context.candidateCommit) ||
    !/^[a-f0-9-]{36}$/u.test(context.nonce) ||
    !Number.isSafeInteger(context.pid) ||
    context.pid <= 0 ||
    context.mode !== 'bootstrap-module-only' ||
    !validBindings(context.bindings, context)
  )
    invalid();
  // Plain comparison expectations do not prove custody. Only the actual private
  // supervisor can derive/corroborate them; no legacy context enables this path.
  const expected = JSON.parse(serializeHttpRuntimePlainJson(context));
  let started = false;
  let terminalSeen = false;
  let terminal;
  let refused = false;
  let finished = false;
  let observedFrames = 0;
  let observedBytes = 0;
  let captureComplete = true;
  const frames = [];
  const reject = () => {
    refused = true;
    return false;
  };

  function receive(value) {
    observedFrames++;
    let serialized;
    try {
      if (!safePlainJson(value)) {
        captureComplete = false;
        return reject();
      }
      serialized = serializeHttpRuntimePlainJson(value);
      if (typeof serialized !== 'string') {
        captureComplete = false;
        return reject();
      }
    } catch {
      captureComplete = false;
      return reject();
    }
    const bytes = Buffer.byteLength(serialized);
    observedBytes += bytes;
    if (bytes > frameLimit || observedBytes > captureLimit || observedFrames > 1024) {
      captureComplete = false;
      return reject();
    }
    // Preserve the actual parsed message, before validation. This is an exact
    // JSON reserialization, not Node's already-consumed transport wire bytes.
    frames.push(serialized);
    if (refused || finished) return reject();
    const frame = JSON.parse(serialized);
    if (
      !frame ||
      typeof frame !== 'object' ||
      Array.isArray(frame) ||
      Object.keys(frame).sort().join(',') !==
        'candidateCommit,kind,nonce,pid,result,schemaVersion' ||
      frame.schemaVersion !== 1 ||
      frame.nonce !== expected.nonce ||
      frame.candidateCommit !== expected.candidateCommit ||
      frame.pid !== expected.pid
    )
      return reject();
    if (frame.kind === 'start') {
      if (
        started ||
        terminalSeen ||
        !frame.result ||
        typeof frame.result !== 'object' ||
        Array.isArray(frame.result) ||
        !exact(frame.result, ['mode', 'resolutionAnchors']) ||
        frame.result.mode !== expected.mode ||
        !isDeepStrictEqual(frame.result.resolutionAnchors, expected.bindings.resolutionAnchors)
      )
        return reject();
      started = true;
      return true;
    }
    if (frame.kind !== 'terminal' || terminalSeen) return reject();
    // A malformed/falsy first terminal is still a terminal attempt. Refusal is
    // sticky; a later plausible terminal cannot repair its history.
    terminalSeen = true;
    if (
      !started ||
      !frame.result ||
      typeof frame.result !== 'object' ||
      Array.isArray(frame.result) ||
      Object.keys(frame.result).sort().join(',') !==
        'modules,observation,readinessPromoting,runtimeCustodyComplete,trustedBootstrap' ||
      frame.result.runtimeCustodyComplete !== false ||
      frame.result.readinessPromoting !== false ||
      !isDeepStrictEqual(frame.result.observation, expected.bindings.observation) ||
      !isDeepStrictEqual(frame.result.trustedBootstrap, expected.bindings.trustedBootstrap) ||
      !validModules(frame.result.modules, expected)
    )
      return reject();
    terminal = frame.result;
    return true;
  }

  function finish(exit) {
    if (finished) {
      reject();
      invalid();
    }
    finished = true;
    if (
      refused ||
      !captureComplete ||
      !started ||
      !terminalSeen ||
      !terminal ||
      !exit ||
      !safePlainJson(exit) ||
      Array.isArray(exit) ||
      Object.keys(exit).sort().join(',') !== 'code,signal' ||
      exit.code !== 0 ||
      exit.signal !== null
    ) {
      reject();
      invalid();
    }
    return structuredClone(terminal);
  }

  function snapshot() {
    return {
      schemaVersion: 1,
      expected: structuredClone(expected),
      representation: 'Node IPC parsed JSON reserialization; not transport wire bytes',
      observedFrames,
      observedBytes,
      captureComplete,
      frames: frames.map((serialized) => JSON.parse(serialized)),
      started,
      terminalSeen,
      refused,
      finished,
      processCustodyQualified: false,
      readinessPromoting: false,
    };
  }

  function captureArtifact(supervisorFailure) {
    if (
      arguments.length !== 1 ||
      ![null, 'HTTP_RUNTIME_WORKER_INVALID', 'HTTP_RUNTIME_CAPTURE_INVALID'].includes(
        supervisorFailure,
      )
    )
      invalid();
    const capture = { ...snapshot(), supervisorFailure };
    let body = serializeHttpRuntimePlainJson(capture);
    let overflowed = false;
    if (Buffer.byteLength(body) > captureLimit) {
      overflowed = true;
      refused = true;
      captureComplete = false;
      body = serializeHttpRuntimePlainJson({
        schemaVersion: 1,
        expected: {
          nonce: expected.nonce,
          candidateCommit: expected.candidateCommit,
          pid: expected.pid,
          mode: expected.mode,
          bindingsSha256: sha256(serializeHttpRuntimePlainJson(expected.bindings)),
        },
        expectedBindingsOmittedReason: 'ARTIFACT_BYTE_LIMIT',
        representation: capture.representation,
        observedFrames,
        observedBytes,
        captureComplete: false,
        captureOmittedReason: 'ARTIFACT_BYTE_LIMIT',
        supervisorFailure: 'HTTP_RUNTIME_CAPTURE_INVALID',
        refused: true,
        processCustodyQualified: false,
        readinessPromoting: false,
      });
    }
    return { body, byteLength: Buffer.byteLength(body), overflowed };
  }
  return Object.freeze({ receive, finish, snapshot, captureArtifact });
}
