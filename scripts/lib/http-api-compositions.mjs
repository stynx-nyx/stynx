import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseNestControllerDeclarations } from './nest-route-declarations.mjs';
import { pascalCase, operationMethodName } from './sdk-operation-identities.mjs';

const verbs = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const key = (operation) => `${operation.method.toUpperCase()} ${operation.path}`;
const identity = (operation) =>
  `${operation.source}:${operation.controller}.${operation.handler}:${key(operation)}`;

/** Read the Architect registry; source discovery remains the population authority. */
export function bindHttpApiCompositions(repoRoot, operations) {
  const policyPath = resolve(repoRoot, 'law/policy/http-api-compositions.json');
  const policy = existsSync(policyPath) ? JSON.parse(readFileSync(policyPath, 'utf8')) : null;
  if (!policy) {
    if (
      existsSync(resolve(repoRoot, 'law/constitution.md')) ||
      existsSync(resolve(repoRoot, 'law/schemas/http-api-compositions.schema.json'))
    )
      throw new Error('Governed API composition policy is missing');
    return project(operations, [], [], []);
  }
  const schema = JSON.parse(
    readFileSync(resolve(repoRoot, 'law/schemas/http-api-compositions.schema.json'), 'utf8'),
  );
  validate(policy, schema, schema, 'http-api-compositions');
  const baseline = policy.compatibilityBaseline;
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
  const baselineContract = JSON.parse(baselineBytes.toString('utf8'));
  const sources = new Map();
  const historicalDeclarations = new Map();
  const mappings = new Set();
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
    const original = historicalDeclarations
      .get(entry.source)
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
    const previous = baselineContract.paths?.[entry.path]?.[entry.method.toLowerCase()];
    if (
      previous?.operationId !== entry.operationId ||
      previous?.['x-stynx-source'] !== entry.source
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
    if (match.length !== 1)
      throw new Error(`API compatibility declaration missing or ambiguous: ${entry.operationId}`);
    const declaration = identity(match[0]);
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
  for (const [path, item] of Object.entries(baselineContract.paths ?? {})) {
    for (const [method, published] of Object.entries(item)) {
      if (!verbs.has(method)) continue;
      const current = result.primary.filter(
        (operation) => operation.path === path && operation.method === method,
      );
      if (
        current.length !== 1 ||
        current[0].source !== published['x-stynx-source'] ||
        operationId(current[0]) !== published.operationId
      )
        throw new Error(`Published API operation identity lost: ${method.toUpperCase()} ${path}`);
    }
  }
  return result;
}

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

function project(operations, compositions, alternatives, compatibility) {
  const compositionIds = new Set();
  const controllers = new Set();
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
  const groups = new Map();
  const declarations = new Set();
  const operationIds = new Set();
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
  const primary = [];
  for (const [groupKey, group] of groups) {
    const alternative = policyGroups.get(groupKey);
    if (group.length === 1 && !alternative) {
      primary.push(group[0]);
      continue;
    }
    const actual = group.map((operation) => operation.compositionId).sort();
    const expected = alternative?.compositionIds.slice().sort();
    if (!alternative || JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`Unregistered or incomplete API operation collision: ${groupKey}`);
    primary.push(
      group.find((operation) => operation.compositionId === alternative.primaryCompositionId),
    );
    policyGroups.delete(groupKey);
  }
  if (policyGroups.size)
    throw new Error(`API alternative declarations absent: ${[...policyGroups.keys()].join(', ')}`);
  return { operations: bound, primary, groups, compositions };
}

function safeSource(path) {
  if (
    typeof path !== 'string' ||
    !/^[A-Za-z0-9_./-]+$/u.test(path) ||
    path.startsWith('/') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error(`Unsafe API registry source/artifact path: ${path}`);
}

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
function validate(value, schema, root, at) {
  if (schema.$ref) {
    if (
      !/^#\/\$defs\/[A-Za-z][A-Za-z0-9]*$/u.test(schema.$ref) ||
      !root.$defs?.[schema.$ref.replace('#/$defs/', '')] ||
      Object.keys(schema).some((key) => !['$ref', 'title', 'description'].includes(key))
    )
      throw new Error(`Unsupported API registry schema reference at ${at}`);
    return validate(value, root.$defs[schema.$ref.replace('#/$defs/', '')], root, at);
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
  for (const assertion of Object.keys(schema))
    if (!supported.has(assertion))
      throw new Error(`Unsupported API registry schema assertion ${assertion}`);
  const refuse = () => {
    throw new Error(`Invalid API registry value at ${at}`);
  };
  if (schema.const !== undefined && value !== schema.const) refuse();
  if (schema.enum && !schema.enum.includes(value)) refuse();
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
    for (const field of schema.required ?? []) if (!Object.hasOwn(value, field)) refuse();
    for (const [field, item] of Object.entries(value)) {
      if (!schema.properties?.[field]) {
        if (schema.additionalProperties === false) refuse();
      } else validate(item, schema.properties[field], root, `${at}.${field}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < (schema.minItems ?? 0)) refuse();
    if (
      schema.uniqueItems &&
      new Set(value.map((item) => JSON.stringify(item))).size !== value.length
    )
      refuse();
    for (const [index, item] of value.entries())
      validate(item, schema.items, root, `${at}[${index}]`);
  } else if (schema.type === 'string') {
    if (
      typeof value !== 'string' ||
      value.length < (schema.minLength ?? 0) ||
      (schema.pattern && !new RegExp(schema.pattern, 'u').test(value))
    )
      refuse();
  } else if (schema.type) throw new Error(`Unsupported API registry schema type ${schema.type}`);
}
