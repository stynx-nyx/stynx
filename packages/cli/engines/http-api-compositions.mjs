import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseNestControllerDeclarations } from './nest-route-declarations.mjs';
import { pascalCase, operationMethodName } from './sdk-operation-identities.mjs';

/** @typedef {import('./api-coverage.mjs').Operation} Operation */
/** @typedef {{id: string, controller: {source: string, className: string}, artifactPath: string}} Composition */
/** @typedef {{method: string, path: string, primaryCompositionId: string, compositionIds: string[]}} Alternative */
/** @typedef {{source: string, className: string, handler: string, method: string, path: string,
 * operationId: string, baselineSourceSha256: string}} Compatibility */

const verbs = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
/** @param {import("node:crypto").BinaryLike} bytes */
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** @param {Operation} operation */
const key = (operation) => `${operation.method.toUpperCase()} ${operation.path}`;
/** @param {Operation} operation */
const identity = (operation) =>
  `${operation.source}:${operation.controller}.${operation.handler}:${key(operation)}`;

/** Read the Architect registry; source discovery remains the population authority. */
/**
 * @param {string} repoRoot
 * @param {Operation[]} operations
 */
export function bindHttpApiCompositions(repoRoot, operations) {
  const policyPath = resolve(repoRoot, 'law/policy/http-api-compositions.json');
  /** @type {unknown} */
  const policy = existsSync(policyPath) ? JSON.parse(readFileSync(policyPath, 'utf8')) : null;
  if (!policy) {
    if (
      existsSync(resolve(repoRoot, 'law/constitution.md')) ||
      existsSync(resolve(repoRoot, 'law/schemas/http-api-compositions.schema.json'))
    )
      throw new Error('Governed API composition policy is missing');
    return project(operations, [], [], []);
  }
  /** @type {unknown} */
  const schema = JSON.parse(
    readFileSync(resolve(repoRoot, 'law/schemas/http-api-compositions.schema.json'), 'utf8'),
  );
  validate(policy, schema, schema, 'http-api-compositions');
  provePolicyFields(policy);
  const baseline = policy.compatibilityBaseline;
  /** @param {string} path */
  const historical = (path) =>
    execFileSync('git', ['show', `${baseline.commit}:${path}`], {
      cwd: repoRoot,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  safeSource(baseline.path);
  const baselineBytes = historical(baseline.path);
  if (digest(baselineBytes) !== baseline.sha256)
    throw new Error('API compatibility baseline digest mismatch');
  /** @type {unknown} */
  const baselineContract = JSON.parse(baselineBytes.toString('utf8'));
  /** @type {Map<string, string>} */
  const sources = new Map();
  /** @type {Map<string, ReturnType<typeof parseNestControllerDeclarations>>} */
  const historicalDeclarations = new Map();
  /** @type {Set<string>} */
  const mappings = new Set();
  /** @type {Set<string>} */
  const ids = new Set();
  for (const entry of policy.operationIdCompatibility) {
    safeSource(entry.source);
    safeRoute(entry.path);
    if (!sources.has(entry.source)) {
      const bytes = historical(entry.source);
      sources.set(entry.source, digest(bytes));
      historicalDeclarations.set(
        entry.source,
        parseNestControllerDeclarations(bytes.toString('utf8'), {
          file: resolve(repoRoot, entry.source),
        }),
      );
    }
    if (sources.get(entry.source) !== entry.baselineSourceSha256)
      throw new Error(`API compatibility source digest mismatch: ${entry.source}`);
    const declarations = historicalDeclarations.get(entry.source);
    if (!declarations) throw new Error(`API compatibility binding lacks historical handler identity: ${entry.operationId}`);
    const original = declarations
      .flatMap((controller) =>
        controller.methods.flatMap((member) =>
          member.registrations.flatMap((registration) =>
            controller.paths.map((base) => ({
              className: controller.name,
              handler: member.name,
              method: registration.method,
              path:
                `/${base}/${registration.path}`
                  .replace(/\/+/gu, '/')
                  .replace(/\/$/u, '')
                  .replace(/:([^/{}:]+)/gu, '{$1}') || '/',
            })),
          ),
        ),
      )
      .filter(
        (declaration) =>
          declaration.className === entry.className &&
          declaration.handler === entry.handler &&
          declaration.method === entry.method &&
          declaration.path === entry.path,
      );
    if (original.length !== 1)
      throw new Error(
        `API compatibility binding lacks historical handler identity: ${entry.operationId}`,
      );
    const previous = optionalField(optionalField(optionalField(baselineContract, 'paths'), entry.path), entry.method.toLowerCase());
    if (
      optionalField(previous, 'operationId') !== entry.operationId ||
      optionalField(previous, 'x-stynx-source') !== entry.source
    )
      throw new Error(
        `API compatibility ID lacks immutable publication evidence: ${entry.operationId}`,
      );
    const match = operations.filter(
      (operation) =>
        operation.source === entry.source &&
        operation.controller === entry.className &&
        operation.handler === entry.handler &&
        key(operation) === `${entry.method} ${entry.path}`,
    );
    const matched = match[0];
    if (match.length !== 1 || !matched)
      throw new Error(`API compatibility declaration missing or ambiguous: ${entry.operationId}`);
    const declaration = identity(matched);
    if (mappings.has(declaration) || ids.has(entry.operationId))
      throw new Error(`Duplicate API compatibility binding: ${entry.operationId}`);
    mappings.add(declaration);
    ids.add(entry.operationId);
  }
  const result = project(
    operations,
    policy.compositions,
    policy.alternatives,
    policy.operationIdCompatibility,
  );
  for (const [path, item] of dataEntries(field(baselineContract, 'paths') ?? {})) {
    for (const [method, published] of dataEntries(item)) {
      if (!verbs.has(method)) continue;
      const current = result.primary.filter(
        (operation) => operation.path === path && operation.method === method,
      );
      if (
        current.length !== 1 ||
        !current[0] || current[0].source !== field(published, 'x-stynx-source') ||
        operationId(current[0]) !== field(published, 'operationId')
      )
        throw new Error(`Published API operation identity lost: ${method.toUpperCase()} ${path}`);
    }
  }
  return result;
}

/**
 * @param {Operation} operation
 */
export function operationId(operation) {
  if (operation.compatibleOperationId) return operation.compatibleOperationId;
  const pathId = operation.path
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      const parameter = segment.match(/^(?::([^/{}:]+)|\{([^/{}:]+)\})$/u);
      return parameter
        ? `by-${parameter[1] ?? parameter[2]}`
        : segment.replace(/[^A-Za-z0-9]+/gu, '-');
    })
    .join('-');
  return [operation.tag, operation.method, pathId, operation.handler]
    .filter(Boolean)
    .join('-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '');
}

/**
 * @param {Operation[]} operations
 * @param {Composition[]} compositions
 * @param {Alternative[]} alternatives
 * @param {Compatibility[]} compatibility
 */
function project(operations, compositions, alternatives, compatibility) {
  /** @type {Set<string>} */
  const compositionIds = new Set();
  /** @type {Set<string>} */
  const controllers = new Set();
  /** @type {Set<string>} */
  const artifactPaths = new Set();
  for (const composition of compositions) {
    safeSource(composition.controller.source);
    safeSource(composition.artifactPath);
    const controller = `${composition.controller.source}:${composition.controller.className}`;
    if (
      compositionIds.has(composition.id) ||
      controllers.has(controller) ||
      artifactPaths.has(composition.artifactPath)
    )
      throw new Error(`Duplicate API composition identity: ${composition.id}`);
    if (
      !operations.some((operation) => `${operation.source}:${operation.controller}` === controller)
    )
      throw new Error(`API composition controller absent: ${controller}`);
    compositionIds.add(composition.id);
    controllers.add(controller);
    artifactPaths.add(composition.artifactPath);
  }
  const bound = operations.map((operation) => ({
    ...operation,
    compositionId:
      compositions.find(
        (composition) =>
          composition.controller.source === operation.source &&
          composition.controller.className === operation.controller,
      )?.id ?? null,
    compatibleOperationId:
      compatibility.find(
        (entry) =>
          entry.source === operation.source &&
          entry.className === operation.controller &&
          entry.handler === operation.handler &&
          `${entry.method} ${entry.path}` === key(operation),
      )?.operationId ?? null,
  }));
  /** @type {Map<string, Operation[]>} */
  const groups = new Map();
  /** @type {Set<string>} */
  const declarations = new Set();
  /** @type {Set<string>} */
  const operationIds = new Set();
  /** @type {Set<string>} */
  const sdkIds = new Set();
  for (const operation of bound) {
    if (!verbs.has(operation.method))
      throw new Error(`Unsupported OpenAPI method: ${operation.method}`);
    if (declarations.has(identity(operation)))
      throw new Error(`Duplicate API declaration: ${identity(operation)}`);
    declarations.add(identity(operation));
    const id = operationId(operation);
    if (operationIds.has(id)) throw new Error(`Duplicate API operation ID: ${id}`);
    operationIds.add(id);
    const sdkId = `${pascalCase(operation.tag)}Service.${operationMethodName(id)}`;
    if (sdkIds.has(sdkId)) throw new Error(`Duplicate generated SDK method identity: ${sdkId}`);
    sdkIds.add(sdkId);
    const group = groups.get(key(operation)) ?? [];
    group.push(operation);
    groups.set(key(operation), group);
  }
  /** @type {Map<string, Alternative>} */
  const policyGroups = new Map();
  for (const alternative of alternatives) {
    safeRoute(alternative.path);
    const groupKey = `${alternative.method} ${alternative.path}`;
    if (policyGroups.has(groupKey)) throw new Error(`Duplicate API alternative group: ${groupKey}`);
    if (
      !alternative.compositionIds.includes(alternative.primaryCompositionId) ||
      alternative.compositionIds.some((id) => !compositionIds.has(id))
    )
      throw new Error(`Unbound API alternative composition: ${groupKey}`);
    policyGroups.set(groupKey, alternative);
  }
  /** @type {Operation[]} */
  const primary = [];
  for (const [groupKey, group] of groups) {
    const alternative = policyGroups.get(groupKey);
    const sole = group[0];
    if (group.length === 1 && sole !== undefined && !alternative) {
      primary.push(sole);
      continue;
    }
    const actual = group.map((operation) => operation.compositionId).sort();
    const expected = alternative?.compositionIds.slice().sort();
    if (!alternative || JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`Unregistered or incomplete API operation collision: ${groupKey}`);
    const selected = group.find((operation) => operation.compositionId === alternative.primaryCompositionId);
    if (!selected) throw new Error(`Unregistered or incomplete API operation collision: ${groupKey}`);
    primary.push(selected);
    policyGroups.delete(groupKey);
  }
  if (policyGroups.size)
    throw new Error(`API alternative declarations absent: ${[...policyGroups.keys()].join(', ')}`);
  return { operations: bound, primary, groups, compositions };
}

/**
 * @param {unknown} path
 */
function safeSource(path) {
  if (
    typeof path !== 'string' ||
    !/^[A-Za-z0-9_./-]+$/u.test(path) ||
    path.startsWith('/') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error(`Unsafe API registry source/artifact path: ${path}`);
}

/**
 * @param {unknown} path
 */
function safeRoute(path) {
  if (
    typeof path !== 'string' ||
    !/^\/[^?#\s]*$/u.test(path) ||
    (path !== '/' && path.endsWith('/')) ||
    path.includes('//') ||
    path.split('/').some((part) => part === '.' || part === '..') ||
    path.replace(/\{[A-Za-z_$][A-Za-z0-9_$]*\}/gu, '').match(/[{}]/u)
  )
    throw new Error(`Invalid API registry route: ${path}`);
}

// This authority schema uses only these JSON Schema assertions. Unknown assertions refuse
// rather than silently accepting a future schema the installed reader cannot enforce.
/**
 * @param {unknown} value
 * @param {unknown} schema
 * @param {unknown} root
 * @param {string} at
 */
function validate(value, schema, root, at) {
  const reference = field(schema, '$ref');
  if (reference) {
    if (
      typeof reference !== 'string' || !/^#\/\$defs\/[A-Za-z][A-Za-z0-9]*$/u.test(reference) ||
      !Object.hasOwn(dataObject(field(root, '$defs') ?? {}), reference.replace('#/$defs/', '')) ||
      Object.keys(dataObject(schema)).some((key) => !['$ref', 'title', 'description'].includes(key))
    )
      throw new Error(`Unsupported API registry schema reference at ${at}`);
    return validate(value, field(field(root, '$defs'), reference.replace('#/$defs/', '')), root, at);
  }
  const supported = new Set([
    '$schema',
    '$id',
    'title',
    'description',
    '$defs',
    '$ref',
    'type',
    'const',
    'enum',
    'required',
    'properties',
    'additionalProperties',
    'items',
    'minItems',
    'uniqueItems',
    'pattern',
    'minLength',
  ]);
  for (const assertion of Object.keys(dataObject(schema)))
    if (!supported.has(assertion))
      throw new Error(`Unsupported API registry schema assertion ${assertion}`);
  /** @returns {never} */
  const refuse = () => {
    throw new Error(`Invalid API registry value at ${at}`);
  };
  const constant = field(schema, 'const');
  if (constant !== undefined && value !== constant) refuse();
  const enumeration = field(schema, 'enum');
  if (enumeration) {
    if (!Array.isArray(enumeration)) throw new Error(`Unsupported API registry schema enum at ${at}`);
    if (!enumeration.includes(value)) refuse();
  }
  const type = field(schema, 'type');
  if (type === 'object') {
    if (!isRecord(value) || Array.isArray(value)) refuse();
    const required = field(schema, 'required') ?? [];
    if (!isStrings(required)) throw new Error(`Unsupported API registry required fields at ${at}`);
    for (const name of required) if (!Object.hasOwn(value, name)) refuse();
    for (const [name, item] of Object.entries(value)) {
      const properties = field(schema, 'properties') ?? {};
      if (!Object.hasOwn(dataObject(properties), name)) {
        if (field(schema, 'additionalProperties') === false) refuse();
      } else validate(item, field(properties, name), root, `${at}.${name}`);
    }
  } else if (type === 'array') {
    if (!Array.isArray(value)) refuse();
    const minimum = field(schema, 'minItems') ?? 0;
    if (typeof minimum !== 'number') throw new Error(`Unsupported API registry minimum at ${at}`);
    if (value.length < minimum) refuse();
    if (field(schema, 'uniqueItems') && new Set(value.map((item) => JSON.stringify(item))).size !== value.length)
      refuse();
    for (const [index, item] of value.entries())
      validate(item, field(schema, 'items'), root, `${at}[${index}]`);
  } else if (type === 'string') {
    if (typeof value !== 'string') refuse();
    const minimum = field(schema, 'minLength') ?? 0;
    if (typeof minimum !== 'number') throw new Error(`Unsupported API registry minimum at ${at}`);
    if (value.length < minimum) refuse();
    const pattern = field(schema, 'pattern');
    if (pattern) {
      if (typeof pattern !== 'string') throw new Error(`Unsupported API registry pattern at ${at}`);
      if (!new RegExp(pattern, 'u').test(value)) refuse();
    }
  } else if (type) throw new Error(`Unsupported API registry schema type ${type}`);
}

// Reads from fresh native JSON snapshots; no recursive output normalization.
/** @param {unknown} value @returns {object} */
function dataObject(value) {
  if (value === null || value === undefined) throw new TypeError('Cannot convert undefined or null to object');
  /** @type {unknown} */
  const boxed = Object(value);
  if ((typeof boxed !== 'object' || boxed === null) && typeof boxed !== 'function')
    throw new TypeError('Invalid native Object result');
  return boxed;
}
/** @param {unknown} value @param {string} name @returns {unknown} */
function field(value, name) {
  if (value === null || value === undefined) throw new TypeError(`Cannot read properties of ${value} (reading '${name}')`);
  return Reflect.get(dataObject(value), name, value);
}
/** @param {unknown} value @param {string} name @returns {unknown} */
function optionalField(value, name) { return value == null ? undefined : field(value, name); }
/** @param {unknown} value @returns {[string, unknown][]} */
function dataEntries(value) { return Object.entries(dataObject(value)); }
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return typeof value === 'object' && value !== null; }
/** @param {unknown} value @returns {value is string[]} */
function isStrings(value) { return Array.isArray(value) && value.every((item) => typeof item === 'string'); }
/** @param {unknown} value @returns {value is Composition} */
function isComposition(value) {
  return isRecord(value) && typeof value.id === 'string' && typeof value.artifactPath === 'string' &&
    isRecord(value.controller) && typeof value.controller.source === 'string' && typeof value.controller.className === 'string';
}
/** @param {unknown} value @returns {value is Alternative} */
function isAlternative(value) {
  return isRecord(value) && typeof value.method === 'string' && typeof value.path === 'string' &&
    typeof value.primaryCompositionId === 'string' && isStrings(value.compositionIds);
}
/** @param {unknown} value @returns {value is Compatibility} */
function isCompatibility(value) {
  return isRecord(value) && typeof value.source === 'string' && typeof value.className === 'string' &&
    typeof value.handler === 'string' && typeof value.method === 'string' && typeof value.path === 'string' &&
    typeof value.operationId === 'string' && typeof value.baselineSourceSha256 === 'string';
}
/** @typedef {{compatibilityBaseline: {commit: string, path: string, sha256: string},
 * compositions: Composition[], alternatives: Alternative[], operationIdCompatibility: Compatibility[]}} ConsumedPolicy */
/** @param {unknown} value @returns {asserts value is ConsumedPolicy} */
function provePolicyFields(value) {
  if (!isRecord(value) || !isRecord(value.compatibilityBaseline) ||
      typeof value.compatibilityBaseline.commit !== 'string' || typeof value.compatibilityBaseline.path !== 'string' ||
      typeof value.compatibilityBaseline.sha256 !== 'string' || !Array.isArray(value.compositions) ||
      !value.compositions.every(isComposition) || !Array.isArray(value.alternatives) ||
      !value.alternatives.every(isAlternative) || !Array.isArray(value.operationIdCompatibility) ||
      !value.operationIdCompatibility.every(isCompatibility))
    throw new Error('Invalid checked API composition policy projection');
}
