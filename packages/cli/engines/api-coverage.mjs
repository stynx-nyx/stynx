import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import * as ts from 'typescript';
import { parseNestControllerDeclarations } from './nest-route-declarations.mjs';
import { bindHttpApiCompositions, operationId } from './http-api-compositions.mjs';

/** @typedef {{ method: string, path: string, routePath: string, bodyType: string | null,
 * responseType: string | null, jsonResponseType: string | null, hasQueryObject: boolean,
 * isPublic: boolean, queryNames: string[], handler: string, controller: string,
 * source: string, sourceLine: number, tag: string, declarationId: string,
 * compositionId?: string | null, compatibleOperationId?: string | null }} Operation */
/** @typedef {string | number | boolean | null} LiteralScalar */
/** @typedef {{ $ref?: string, type?: string, format?: string, const?: LiteralScalar,
 * enum?: LiteralScalar[], properties?: Record<string, Schema>, required?: string[],
 * additionalProperties?: boolean | Schema, items?: Schema, anyOf?: Schema[], allOf?: Schema[],
 * 'x-stynx-source'?: string, 'x-stynx-unresolved-source-type'?: string | null }} Schema */
/** @typedef {{ declarations: Map<string, {node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration,
 * sourceFile: ts.SourceFile}>, ambiguousDeclarations: Set<string>, schemas: Record<string, Schema>,
 * building: Set<string>, typeBindings?: Map<string, Schema> }} Registry */

// Module state for the one synchronous run in progress; helpers below read it.
/** @type {string} */
let repoRoot;
/** @type {ReturnType<typeof bindHttpApiCompositions>} */
let composition;
/** @type {Registry} */
let schemaRegistry;

/**
 * Compares the Nest routes declared under the configured source roots with the
 * committed OpenAPI document. Writes only when `writeOpenApi` is true (the
 * repository's `api:docs:write`); `stynx verify-api-coverage` never passes it.
 */
/**
 * @param {{root: string, writeOpenApi?: boolean}} options
 */
export function verifyApiCoverage({ root, writeOpenApi = false }) {
  repoRoot = resolve(root);
  const config = jsonField(readConfig(), 'apiCoverage') ?? {};
  const openapiPath = resolveConfigurationPath(
    jsonField(config, 'openapiPath') ?? 'docs/framework/contracts/openapi.json',
  );
  const sourceRoots = jsonField(config, 'sourceRoots') ?? ['reference/api/src', 'packages'];
  const routePrefix = jsonField(config, 'routePrefix') ?? '';
  if (!Array.isArray(sourceRoots)) throw new TypeError('sourceRoots.map is not a function');
  const sourceRootPaths = sourceRoots.map((/** @type {unknown} */ sourceRoot) =>
    resolveConfigurationPath(sourceRoot),
  );
  const returnTypeIndex = buildReturnTypeIndex(sourceRootPaths);
  composition = bindHttpApiCompositions(
    repoRoot,
    discoverNestOperations(sourceRootPaths, routePrefix, returnTypeIndex),
  );
  const implementedOperations = composition.operations;
  schemaRegistry = buildSchemaRegistry(
    sourceRootPaths,
    implementedOperations
      .flatMap((operation) => [
        operation.bodyType,
        operation.jsonResponseType ?? operation.responseType,
      ])
      .filter(Boolean),
    implementedOperations.filter((operation) => operation.jsonResponseType),
  );
  // Resolve the entire declaration population before projecting any document.
  // A secondary composition may introduce types absent from the primary contract.
  for (const operation of implementedOperations) {
    if (operation.bodyType) requestBodySchema(operation.bodyType, schemaRegistry);
    if (operation.jsonResponseType) validateJsonResponseType(operation, schemaRegistry);
    const responseType = operation.jsonResponseType ?? operation.responseType;
    if (responseType) responseBodySchema(responseType, schemaRegistry);
  }

  if (writeOpenApi) {
    writeOpenApiContract(openapiPath, composition.primary, true);
    const legacyOpenApiPath = resolve(repoRoot, 'docs/framework/api/openapi.json');
    if (legacyOpenApiPath !== openapiPath) {
      writeOpenApiContract(legacyOpenApiPath, composition.primary, true);
    }
    for (const selected of composition.compositions) {
      writeOpenApiContract(
        resolve(repoRoot, selected.artifactPath),
        implementedOperations.filter(
          (operation) => !operation.compositionId || operation.compositionId === selected.id,
        ),
        false,
        selected.id,
      );
    }
  }

  const openapiRoutes = readOpenApiPaths(openapiPath);
  const implementedRoutes = implementedOperations.map((operation) => operation.path);
  const openapiByCanonical = groupByCanonical(openapiRoutes);
  const implementedByCanonical = groupByCanonical(implementedRoutes);
  const missingInCode = [...openapiByCanonical.entries()]
    .filter(([canonical]) => !implementedByCanonical.has(canonical))
    .flatMap(([canonical, routes]) => routes.map((route) => diagnostic(route, canonical)))
    .sort((a, b) => a.path.localeCompare(b.path));
  const missingInOpenApi = [...implementedByCanonical.entries()]
    .filter(([canonical]) => !openapiByCanonical.has(canonical))
    .flatMap(([canonical, routes]) => routes.map((route) => diagnostic(route, canonical)))
    .sort((a, b) => a.path.localeCompare(b.path));
  const parameterNameMismatches = compareParameterNames(openapiByCanonical, implementedByCanonical);
  const operationDrift = compareOperations(openapiPath, composition.primary, true);
  const compositionDrift = composition.compositions.flatMap((selected) =>
    compareOperations(
      resolve(repoRoot, selected.artifactPath),
      implementedOperations.filter(
        (operation) => !operation.compositionId || operation.compositionId === selected.id,
      ),
      false,
      selected.id,
    ).map((failure) => ({ compositionId: selected.id, ...failure })),
  );

  const summary = {
    schemaVersion: '1',
    openapiPath: existsSync(openapiPath) ? relative(repoRoot, openapiPath) : null,
    openapiPaths: openapiRoutes.length,
    implementedOperations: implementedOperations.length,
    implementedRoutes: implementedRoutes.length,
    parameterNameMismatches,
    missingInCode,
    missingInOpenApi,
    operationDrift,
    compositionDrift,
  };
  const drift =
    missingInCode.length > 0 ||
    missingInOpenApi.length > 0 ||
    parameterNameMismatches.length > 0 ||
    operationDrift.length > 0 ||
    compositionDrift.length > 0;
  return { summary, drift, operations: implementedOperations, openapiPath };
}

/**
 * @returns {unknown}
 */
function readConfig() {
  const rc = join(repoRoot, '.stynxrc.json');
  if (existsSync(rc)) return JSON.parse(readFileSync(rc, 'utf8'));
  const manifest = join(repoRoot, 'package.json');
  if (!existsSync(manifest)) return {};
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(manifest, 'utf8'));
  return jsonField(parsed, 'stynx') ?? {};
}

/**
 * @param {string} file
 */
function readOpenApiPaths(file) {
  if (!existsSync(file)) return [];
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  return Object.keys(jsonObject(jsonField(parsed, 'paths') ?? {})).map(normalizePath);
}

/**
 * @param {string[]} roots
 * @param {unknown} prefix
 * @param {Record<string, string>} returnTypes
 * @returns {Operation[]}
 */
function discoverNestOperations(roots, prefix, returnTypes) {
  const operations = [];
  for (const file of roots.flatMap(walk).filter((path) => path.endsWith('.controller.ts'))) {
    const text = readFileSync(file, 'utf8');
    const jsonResponseTypes = jsonResponseAnnotations(text, file);
    for (const controller of parseNestControllerDeclarations(text, { file })) {
      const serviceProperties = constructorProperties(controller.source);
      for (const member of controller.methods) {
        const fragment = member.signature;
        const jsonResponseType = jsonResponseTypes.get(member.position.offset) ?? null;
        if (jsonResponseType && member.registrations.length === 0) {
          throw new Error(
            `${relative(repoRoot, file)}:${member.position.line}: JSON response annotation requires an HTTP route`,
          );
        }
        jsonResponseTypes.delete(member.position.offset);
        const bodyParameters = member.parameters.filter((parameter) =>
          parameter.decorators.some((decorator) => decorator.name === 'Body'),
        );
        if (
          bodyParameters.length > 1 ||
          bodyParameters.some((parameter) =>
            parameter.decorators.some(
              (decorator) => decorator.name === 'Body' && decorator.selector?.kind !== 'whole',
            ),
          )
        ) {
          throw new Error(
            `${relative(repoRoot, file)}:${member.position.line}: unsupported partial or multiple body contract`,
          );
        }
        const bodyType = bodyParameters[0]?.type ?? null;
        const queries = member.parameters.flatMap((parameter) =>
          parameter.decorators.filter((decorator) => decorator.name === 'Query'),
        );
        const queryNames = queries
          .flatMap((decorator) =>
            decorator.selector?.kind === 'property' ? [decorator.selector.name] : [],
          )
          .sort((left, right) => left.localeCompare(right));
        const attached = [...controller.decorators, ...member.decorators];
        for (const base of controller.paths) {
          for (const registration of member.registrations) {
            if (registration.method === 'ALL' || registration.method === 'SEARCH') {
              throw new Error(
                `${relative(repoRoot, file)}:${member.position.line}: unresolved ${registration.method} method population for OpenAPI`,
              );
            }
            const routePath = normalizePath(`${prefix}/${base}/${registration.path}`);
            operations.push({
              method: registration.method.toLowerCase(),
              path: openApiPath(routePath),
              routePath,
              bodyType,
              responseType:
                member.returnType ??
                responseTypeName(fragment, member.source, serviceProperties, returnTypes),
              jsonResponseType,
              hasQueryObject: queries.some((decorator) => decorator.selector?.kind === 'whole'),
              isPublic: attached.some((decorator) =>
                ['Public', 'PublicTenantRoute'].includes(decorator.name),
              ),
              queryNames,
              handler: member.name,
              controller: controller.name,
              source: relative(repoRoot, file),
              sourceLine: member.position.line,
              tag: controller.name.replace(/Controller$/u, '') || controller.name,
              declarationId: `${relative(repoRoot, file)}:${controller.name}.${member.name}:${registration.method}:${routePath}`,
              controllerOptions: controller.options,
            });
          }
        }
      }
    }
    if (jsonResponseTypes.size > 0) {
      throw new Error(
        `${relative(repoRoot, file)}: JSON response annotation requires a discovered controller route`,
      );
    }
  }

  return operations.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.method.localeCompare(right.method) ||
      left.source.localeCompare(right.source),
  );
}

/** Read only actual method JSDoc, never a signature/body text match. */
/**
 * @param {string} text
 * @param {string} file
 */
function jsonResponseAnnotations(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  /** @type {Map<number, string>} */
  const annotations = new Map();
  /** @param {ts.Node} node */
  const visit = (node) => {
    const tags = nativeJSDocTags(node).filter(
      (tag) => tag.tagName.text === 'stynx-json-response-type',
    );
    if (tags.length > 0) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      /** @type {(reason: string) => never} */
      const refuse = (reason) => {
        throw new Error(`${relative(repoRoot, file)}:${line}: ${reason}`);
      };
      if (!ts.isMethodDeclaration(node))
        refuse('JSON response annotation is method-only, never a request-body annotation');
      const tag = tags[0];
      if (tags.length !== 1 || !tag) refuse('duplicate JSON response annotation');
      const comment = tag.comment;
      const name = typeof comment === 'string' ? comment.trim() : '';
      if (!/^[A-Za-z_$][\w$]*$/u.test(name) || name === 'UnknownJson') {
        refuse('JSON response annotation requires a named non-generic declaration');
      }
      annotations.set(node.getStart(source), name);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return annotations;
}

/**
 * @param {Operation} operation
 * @param {Registry} registry
 */
function validateJsonResponseDeclaration(operation, registry) {
  const name = operation.jsonResponseType;
  const declaration = name === null ? undefined : registry.declarations.get(name);
  if (
    name === null ||
    !declaration ||
    registry.ambiguousDeclarations.has(name) ||
    declaration.node.typeParameters?.length
  ) {
    throw new Error(
      `${operation.source}:${operation.sourceLine}: unresolved, ambiguous or generic JSON response declaration ${name}`,
    );
  }
}

/**
 * @param {Operation} operation
 * @param {Registry} registry
 */
function validateJsonResponseType(operation, registry) {
  validateJsonResponseDeclaration(operation, registry);
  const name = operation.jsonResponseType;
  /** @type {Set<string>} */
  const visited = new Set();
  /** @param {unknown} schema */
  const validate = (schema) => {
    if (!schema || typeof schema !== 'object') return;
    /** @type {unknown} */
    const ref = Reflect.get(schema, '$ref');
    if (typeof ref === 'string' && ref) {
      if (ref === '#/components/schemas/UnknownJson') {
        throw new Error(
          `${operation.source}:${operation.sourceLine}: unresolved JSON response schema ${name}`,
        );
      }
      const component = ref.match(/^#\/components\/schemas\/(.+)$/u)?.[1];
      if (component && !visited.has(component)) {
        visited.add(component);
        if (registry.ambiguousDeclarations.has(component)) {
          throw new Error(
            `${operation.source}:${operation.sourceLine}: ambiguous JSON response schema ${component}`,
          );
        }
        validate(registry.schemas[component]);
      }
    }
    for (const value of Object.values(schema)) {
      if (Array.isArray(value)) value.forEach(validate);
      else validate(value);
    }
  };
  validate(responseBodySchema(name, registry));
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (
      entry.isDirectory() &&
      !['node_modules', 'dist', 'coverage', 'test', 'tests', 'fixtures', '__fixtures__'].includes(
        entry.name,
      )
    )
      return walk(path);
    return entry.isFile() ? [path] : [];
  });
}

/**
 * @param {string} path
 */
function normalizePath(path) {
  return `/${path}`.replace(/\/+/gu, '/').replace(/\/$/u, '') || '/';
}

/**
 * @param {string} path
 */
function openApiPath(path) {
  return normalizePath(path)
    .split('/')
    .map((segment) => (segment.startsWith(':') ? `{${segment.slice(1)}}` : segment))
    .join('/');
}

/**
 * @param {string} path
 */
function canonicalizePath(path) {
  return normalizePath(path)
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) return '{}';
      if (/^\{[^/{}]+\}$/u.test(segment)) return '{}';
      return segment;
    })
    .join('/');
}

/**
 * @param {string} path
 */
function parameterNames(path) {
  return normalizePath(path)
    .split('/')
    .filter(Boolean)
    .map((segment, index) => {
      if (segment.startsWith(':')) return { index, name: segment.slice(1), syntax: ':' };
      const match = segment.match(/^\{([^/{}]+)\}$/u);
      return match ? { index, name: match[1], syntax: '{}' } : null;
    })
    .filter((parameter) => parameter !== null);
}

/**
 * @param {string[]} paths
 */
function groupByCanonical(paths) {
  /** @type {Map<string, string[]>} */
  const grouped = new Map();
  for (const path of paths) {
    const canonical = canonicalizePath(path);
    const routes = grouped.get(canonical) ?? [];
    routes.push(path);
    grouped.set(canonical, routes);
  }
  return grouped;
}

/**
 * @param {string} path
 * @param {string} canonical
 */
function diagnostic(path, canonical) {
  return { path, normalized: canonical };
}

/**
 * @param {Map<string, string[]>} expected
 * @param {Map<string, string[]>} actual
 */
function compareParameterNames(expected, actual) {
  const mismatches = [];
  for (const [canonical, expectedPaths] of expected.entries()) {
    const actualPaths = actual.get(canonical);
    if (!actualPaths) continue;
    const expectedNames = parameterNames(expectedPaths[0] ?? '');
    const actualNames = parameterNames(actualPaths[0] ?? '');
    for (const [index, expectedParam] of expectedNames.entries()) {
      const actualParam = actualNames[index];
      if (actualParam && actualParam.name !== expectedParam.name) {
        mismatches.push({
          normalized: canonical,
          openapiPath: expectedPaths[0],
          routePath: actualPaths[0],
          segment: expectedParam.index,
          openapiParam: expectedParam.name,
          routeParam: actualParam.name,
        });
      }
    }
  }
  return mismatches;
}

/**
 * @param {string} text
 */
function methodBodyStart(text) {
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];
    if (quote) {
      if (char === quote && previous !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') parenDepth += 1;
    else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (char === '[') bracketDepth += 1;
    else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === '{') {
      if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) return index;
      braceDepth += 1;
    } else if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
    }
  }
  return -1;
}

/**
 * @param {string} fragment
 * @param {string} source
 * @param {Record<string, string>} serviceProperties
 * @param {Record<string, string>} returnTypes
 */
function responseTypeName(fragment, source, serviceProperties, returnTypes) {
  const explicit = explicitReturnType(fragment);
  if (explicit) return explicit;
  const serviceCall = source.match(/return\s+this\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/u);
  if (serviceCall) {
    const serviceName = serviceCall[1];
    const serviceType = serviceName === undefined ? undefined : serviceProperties[serviceName];
    const serviceReturn = serviceType ? returnTypes[`${serviceType}.${serviceCall[2]}`] : null;
    if (serviceReturn) return serviceReturn;
  }
  if (/return\s+\{/u.test(source)) return 'JsonObject';
  return 'JsonValue';
}

/**
 * @param {string} fragment
 */
function explicitReturnType(fragment) {
  const openBraceIndex = methodBodyStart(fragment);
  const signature = openBraceIndex === -1 ? fragment : fragment.slice(0, openBraceIndex);
  const match = signature.match(/\)\s*:\s*/u);
  if (!match || match.index === undefined) return null;
  return readTypeExpression(signature.slice(match.index + match[0].length));
}

/**
 * @param {string} text
 */
function constructorProperties(text) {
  const match = text.match(/constructor\s*\(([\s\S]*?)\)\s*\{/u);
  if (!match || match[1] === undefined) return {};
  /** @type {Record<string, string>} */
  const properties = {};
  for (const property of match[1].matchAll(
    /private\s+readonly\s+([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)/gu,
  )) {
    const [, name, type] = property;
    if (name !== undefined && type !== undefined) properties[name] = type;
  }
  return properties;
}

/**
 * @param {string[]} roots
 */
function buildReturnTypeIndex(roots) {
  /** @type {Record<string, string>} */
  const index = {};
  const sourceFiles = roots
    .flatMap(walk)
    .filter(
      (path) => path.endsWith('.ts') && !path.endsWith('.spec.ts') && !path.endsWith('.test.ts'),
    );
  for (const file of sourceFiles) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    source.forEachChild((node) => {
      if (!ts.isClassDeclaration(node) || !node.name?.text) return;
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !member.type || !member.name) continue;
        const methodName = propertyName(member.name);
        if (methodName) index[`${node.name.text}.${methodName}`] = member.type.getText(source);
      }
    });
  }
  return index;
}

/**
 * @param {string} text
 */
function readTypeExpression(text) {
  let depth = 0;
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];
    if (quote) {
      if (char === quote && previous !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '<' || char === '{' || char === '[' || char === '(') depth += 1;
    if (char === '>' || char === '}' || char === ']' || char === ')') {
      if (depth === 0) return text.slice(0, index).trim();
      depth -= 1;
    }
    if (depth === 0 && (char === ',' || char === '\n')) return text.slice(0, index).trim();
  }
  return text.trim();
}

/**
 * @param {Operation} operation
 * @returns {Record<string, unknown>}
 */
function operationContract(operation) {
  const parameters = [...pathParameters(operation.path), ...queryParameters(operation.queryNames)];
  return {
    operationId: operationId(operation),
    tags: [operation.tag],
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(operation.bodyType ? { requestBody: requestBody(operation.bodyType, schemaRegistry) } : {}),
    ...(!operation.bodyType && ['post', 'put', 'patch'].includes(operation.method)
      ? { 'x-stynx-no-request-body': true }
      : {}),
    ...(operation.hasQueryObject ? { 'x-stynx-query-object': true } : {}),
    security: operation.isPublic ? [] : [{ bearerAuth: [], tenantHeader: [] }],
    'x-stynx-source': operation.source,
    'x-stynx-controller': operation.controller,
    'x-stynx-handler': operation.handler,
    ...(operation.compositionId ? { 'x-stynx-composition': operation.compositionId } : {}),
    ...(operation.routePath !== operation.path ? { 'x-stynx-route': operation.routePath } : {}),
    responses: operationResponses(operation, schemaRegistry),
  };
}

/**
 * @param {Operation} operation
 * @param {boolean} variants
 */
function operationWithVariants(operation, variants) {
  const method = operationContract(operation);
  const group = composition.groups.get(`${operation.method.toUpperCase()} ${operation.path}`);
  if (variants && group && group.length > 1)
    method['x-stynx-operation-variants'] = group.map(operationContract);
  return method;
}

/**
 * @param {string} file
 * @param {Operation[]} operations
 * @param {boolean} variants
 * @param {string} [compositionId]
 */
function compareOperations(file, operations, variants, compositionId) {
  /** @type {unknown} */
  const contract = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const paths = jsonField(contract, 'paths') ?? {};
  const expected = new Map(
    operations.map((operation) => [
      `${operation.method.toUpperCase()} ${operation.path}`,
      operation,
    ]),
  );
  const failures = [];
  if (
    jsonField(contract, 'openapi') !== '3.1.0' ||
    jsonField(contract, 'x-stynx-composition') !== compositionId
  )
    failures.push({ reason: 'document-identity-mismatch' });
  if (
    stableJson(jsonField(contract, 'components')) !== stableJson(openApiComponents(schemaRegistry))
  )
    failures.push({ reason: 'schema-components-mismatch' });
  for (const [path, item] of jsonEntries(paths)) {
    for (const [method, actual] of jsonEntries(item)) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'].includes(method))
        continue;
      const key = `${method.toUpperCase()} ${path}`;
      const operation = expected.get(key);
      if (!operation) failures.push({ method: method.toUpperCase(), path, reason: 'not-declared' });
      else {
        if (stableJson(actual) !== stableJson(operationWithVariants(operation, variants)))
          failures.push({
            method: method.toUpperCase(),
            path,
            reason: 'operation-contract-mismatch',
          });
        expected.delete(key);
      }
    }
  }
  for (const operation of expected.values())
    failures.push({
      method: operation.method.toUpperCase(),
      path: operation.path,
      reason: 'missing-operation',
    });
  return failures;
}

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(Reflect.get(value, key))}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/**
 * @param {string} file
 * @param {Operation[]} operations
 * @param {boolean} variants
 * @param {string} [compositionId]
 */
function writeOpenApiContract(file, operations, variants, compositionId) {
  /** @type {Record<string, Record<string, unknown>>} */
  const paths = {};
  for (const operation of operations) {
    const pathItem = paths[operation.path] ?? {};
    if (pathItem[operation.method])
      throw new Error(
        `API composition collision while writing ${file}: ${operation.method} ${operation.path}`,
      );
    pathItem[operation.method] = operationWithVariants(operation, variants);
    paths[operation.path] = sortObject(pathItem);
  }

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        openapi: '3.1.0',
        info: {
          title: 'STYNX API',
          version: '0.2.0',
          description:
            'Generated route and contract inventory for STYNX reference and package controllers.',
        },
        components: openApiComponents(schemaRegistry),
        ...(compositionId ? { 'x-stynx-composition': compositionId } : {}),
        paths: sortObject(paths),
      },
      null,
      2,
    )}\n`,
  );
}

/**
 * @param {string} path
 */
function pathParameters(path) {
  return parameterNames(path).map((parameter) => ({
    name: parameter.name,
    in: 'path',
    required: true,
    schema: {
      type: 'string',
    },
    example: '00000000-0000-4000-8000-000000000000',
  }));
}

/**
 * @param {string[]} names
 */
function queryParameters(names) {
  return names.map((name) => ({
    name,
    in: 'query',
    required: false,
    schema: {
      type: 'string',
    },
    example: `${name}-example`,
  }));
}

/**
 * @param {string} typeName
 * @param {Registry} registry
 */
function requestBody(typeName, registry) {
  const schema = requestBodySchema(typeName, registry);
  return {
    required: true,
    content: {
      'application/json': {
        schema,
        'x-stynx-source-type': typeName,
        examples: {
          default: {
            value: exampleForSchema(schema, registry),
          },
        },
      },
    },
  };
}

/**
 * @param {string | null} typeName
 * @param {Registry} registry
 */
function requestBodySchema(typeName, registry) {
  const schemaName = schemaNameForBodyType(typeName);
  if (!schemaName) return { $ref: '#/components/schemas/UnknownJson' };
  if (registry.schemas[schemaName]) return { $ref: `#/components/schemas/${schemaName}` };
  return {
    $ref: '#/components/schemas/UnknownJson',
    'x-stynx-unresolved-source-type': typeName,
  };
}

/**
 * @param {Operation} operation
 * @param {Registry} registry
 */
function operationResponses(operation, registry) {
  const schema = responseBodySchema(operation.jsonResponseType ?? operation.responseType, registry);
  return {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema,
          'x-stynx-source-type': operation.responseType,
          ...(operation.jsonResponseType
            ? { 'x-stynx-json-response-type': operation.jsonResponseType }
            : {}),
          examples: {
            default: {
              value: exampleForSchema(schema, registry),
            },
          },
        },
      },
    },
    400: problemResponse('Bad request'),
    401: problemResponse('Unauthorized'),
    403: problemResponse('Forbidden'),
    404: problemResponse('Not found'),
    default: problemResponse('Unexpected error'),
  };
}

/**
 * @param {string | null} typeName
 * @param {Registry} registry
 */
function responseBodySchema(typeName, registry) {
  if (!typeName) return { $ref: '#/components/schemas/JsonValue' };
  return schemaForTypeExpression(typeName, registry);
}

/**
 * @param {string} description
 */
function problemResponse(description) {
  return {
    description,
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/ProblemDetails',
        },
        examples: {
          default: {
            value: {
              statusCode: 400,
              code: 'STYNX_ERROR',
              message: description,
              correlationId: 'req_000000000000',
            },
          },
        },
      },
    },
  };
}

/**
 * @param {Registry} registry
 */
function openApiComponents(registry) {
  return {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      tenantHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'x-tenant-id',
      },
    },
    schemas: {
      ...sortObject(registry.schemas),
      ProblemDetails: {
        type: 'object',
        additionalProperties: true,
        properties: {
          statusCode: { type: 'integer' },
          code: { type: 'string' },
          message: { type: 'string' },
          correlationId: { type: 'string' },
        },
      },
      JsonValue: {
        description: 'Any JSON-compatible response value.',
      },
      JsonObject: {
        type: 'object',
        additionalProperties: {
          $ref: '#/components/schemas/JsonValue',
        },
      },
      UnknownJson: {
        description: 'Route-specific schema not yet promoted to a typed contract.',
      },
    },
  };
}

/**
 * @param {string[]} roots
 * @param {(string | null)[]} seedTypeNames
 * @param {Operation[]} jsonResponseOperations
 * @returns {Registry}
 */
function buildSchemaRegistry(roots, seedTypeNames, jsonResponseOperations) {
  const sourceFiles = roots
    .flatMap(walk)
    .filter(
      (path) => path.endsWith('.ts') && !path.endsWith('.spec.ts') && !path.endsWith('.test.ts'),
    );
  /** @type {Registry['declarations']} */
  const declarations = new Map();
  /** @type {Set<string>} */
  const ambiguousDeclarations = new Set();
  for (const file of sourceFiles) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    source.forEachChild((node) => {
      if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name?.text) {
        if (!declarations.has(node.name.text)) {
          declarations.set(node.name.text, { node, sourceFile: source });
        } else {
          ambiguousDeclarations.add(node.name.text);
        }
      }
    });
  }

  /** @type {Registry} */
  const state = {
    declarations,
    ambiguousDeclarations,
    schemas: schemaDictionary(),
    building: new Set(),
  };
  // Refuse invalid wire declarations at their annotation before schema construction
  // can emit a context-free generic-declaration diagnostic.
  for (const operation of jsonResponseOperations) {
    validateJsonResponseDeclaration(operation, state);
  }
  for (const name of seedTypeNames.map(schemaNameForBodyType)) {
    if (name) schemaForTypeName(name, state);
  }
  return state;
}

/**
 * @param {string} name
 * @param {Registry} state
 * @returns {Schema}
 */
function schemaForTypeName(name, state) {
  if (state.schemas[name]) return state.schemas[name];
  const declaration = state.declarations.get(name);
  if (!declaration) return { $ref: '#/components/schemas/UnknownJson' };
  if (declaration.node.typeParameters?.length)
    throw new Error(`Unsupported generic schema declaration ${name}`);
  if (state.building.has(name)) return { $ref: `#/components/schemas/${name}` };

  state.building.add(name);
  const schema = ts.isInterfaceDeclaration(declaration.node)
    ? interfaceSchema(declaration.node, state)
    : schemaForTypeNode(declaration.node.type, state);
  state.building.delete(name);

  state.schemas[name] = {
    ...schema,
    'x-stynx-source': relative(repoRoot, declaration.sourceFile.fileName),
  };
  return state.schemas[name];
}

/**
 * @param {string} typeText
 * @param {Registry} state
 * @returns {Schema}
 */
function schemaForTypeExpression(typeText, state) {
  const source = ts.createSourceFile(
    '__stynx_openapi_type__.ts',
    `type __StynxOpenApiType = ${typeText};`,
    ts.ScriptTarget.Latest,
    true,
  );
  const alias = source.statements.find((statement) => ts.isTypeAliasDeclaration(statement));
  return alias ? schemaForTypeNode(alias.type, state) : { $ref: '#/components/schemas/JsonValue' };
}

/**
 * @param {ts.InterfaceDeclaration} node
 * @param {Registry} state
 * @returns {Schema}
 */
function interfaceSchema(node, state) {
  const bases = (node.heritageClauses ?? []).flatMap((clause) =>
    clause.types.map((base) => objectShape(schemaForTypeExpression(base.getText(), state), state)),
  );
  return mergeObjectShapes([...bases, objectSchemaFromMembers(node.members, state)]);
}

/**
 * @param {Schema} schema
 * @param {Registry} state
 * @param {Set<string>} [seen]
 * @returns {Schema}
 */
function objectShape(schema, state, seen = new Set()) {
  if (schema.$ref) {
    const name = schema.$ref.match(/^#\/components\/schemas\/(.+)$/u)?.[1];
    if (!name || seen.has(name))
      throw new Error(`Unresolved or recursive inherited object schema ${schema.$ref}`);
    const next = new Set(seen).add(name);
    const resolved =
      state.schemas[name] ?? (state.declarations.has(name) ? schemaForTypeName(name, state) : null);
    if (!resolved) throw new Error(`Unresolved inherited object schema ${name}`);
    return objectShape(resolved, state, next);
  }
  if (schema.allOf)
    return mergeObjectShapes(schema.allOf.map((item) => objectShape(item, state, seen)));
  if (schema.type !== 'object')
    throw new Error('Unsupported non-object inherited or utility schema');
  return schema;
}

/**
 * @param {Schema[]} shapes
 * @returns {Schema}
 */
function mergeObjectShapes(shapes) {
  const indexConstraints = shapes
    .map((shape) => shape.additionalProperties)
    .filter((constraint) => constraint !== false && constraint !== undefined && constraint !== true)
    .filter(
      (constraint) =>
        stableJson(constraint) !== stableJson({ $ref: '#/components/schemas/JsonValue' }),
    );
  const indexTypes = indexConstraints.map(primitiveIndexType);
  if (
    shapes.length > 1 &&
    indexConstraints.length &&
    (indexTypes.some((type) => !type) || new Set(indexTypes).size !== 1)
  )
    throw new Error('Unsupported open-object inherited or intersection schema constraints');
  const properties = schemaDictionary();
  /** @type {Set<string>} */
  const required = new Set();
  /** @type {boolean | Schema} */
  let additionalProperties = false;
  for (const shape of shapes) {
    for (const [name, schema] of Object.entries(shape.properties ?? {})) {
      const previous = properties[name];
      properties[name] =
        Object.hasOwn(properties, name) &&
        previous !== undefined &&
        stableJson(previous) !== stableJson(schema)
          ? { allOf: [previous, schema] }
          : schema;
    }
    for (const name of shape.required ?? []) required.add(name);
    if (shape.additionalProperties !== false && shape.additionalProperties !== undefined)
      additionalProperties = shape.additionalProperties;
  }
  if (shapes.length > 1 && indexConstraints.length) {
    for (const schema of Object.values(properties)) {
      if (!schemaFitsPrimitiveIndex(schema, indexTypes[0]))
        throw new Error('Unsupported declared property and open index intersection schema');
    }
    // A named property's schema replaces additionalProperties in JSON Schema. Admission
    // above proves it already implies every index constraint, so none is lost here.
    const constraint = indexConstraints[0];
    if (constraint !== undefined) additionalProperties = constraint;
  }
  return {
    type: 'object',
    additionalProperties,
    properties: sortObject(properties),
    ...(required.size ? { required: [...required].sort() } : {}),
  };
}

/**
 * @param {Schema} schema
 * @returns {string | null}
 */
function primitiveIndexType(schema) {
  if (schema.anyOf?.length === 1 && Object.keys(schema).length === 1)
    return schema.anyOf[0] ? primitiveIndexType(schema.anyOf[0]) : null;
  return Object.keys(schema).length === 1 &&
    schema.type !== undefined &&
    ['string', 'number', 'boolean', 'null'].includes(schema.type)
    ? schema.type
    : null;
}

/**
 * @param {Schema} schema
 * @param {string | null | undefined} type
 * @returns {boolean}
 */
function schemaFitsPrimitiveIndex(schema, type) {
  if (schema.type === type) return true;
  if (schema.anyOf) return schema.anyOf.every((item) => schemaFitsPrimitiveIndex(item, type));
  if (schema.allOf) return schema.allOf.some((item) => schemaFitsPrimitiveIndex(item, type));
  return false;
}

/**
 * @param {ts.TypeNode} node
 * @returns {string[]}
 */
function utilityKeys(node) {
  if (ts.isParenthesizedTypeNode(node)) return utilityKeys(node.type);
  if (ts.isUnionTypeNode(node)) return node.types.flatMap(utilityKeys);
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) return [node.literal.text];
  throw new Error('Unsupported computed object utility key schema');
}

/**
 * @param {readonly ts.TypeElement[]} members
 * @param {Registry} state
 * @returns {Schema}
 */
function objectSchemaFromMembers(members, state) {
  const properties = schemaDictionary();
  const required = [];
  for (const member of members) {
    if (ts.isIndexSignatureDeclaration(member))
      throw new Error('Unsupported object index signature schema');
    if (!ts.isPropertySignature(member) || !member.name) continue;
    const name = propertyName(member.name);
    if (!name) continue;
    properties[name] = schemaForTypeNode(member.type, state);
    if (!member.questionToken) required.push(name);
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties: sortObject(properties),
    ...(required.length > 0
      ? { required: required.sort((left, right) => left.localeCompare(right)) }
      : {}),
  };
}

/**
 * @param {ts.TypeLiteralNode} node
 * @param {Registry} state
 * @returns {Schema}
 */
function typeLiteralSchema(node, state) {
  const index = node.members.find(ts.isIndexSignatureDeclaration);
  if (!index) return objectSchemaFromMembers(node.members, state);
  const parameter = index.parameters[0];
  if (
    node.members.length !== 1 ||
    index.name !== undefined ||
    index.questionToken !== undefined ||
    index.modifiers?.length ||
    index.typeParameters?.length ||
    index.parameters.length !== 1 ||
    !index.type ||
    index.type.kind === ts.SyntaxKind.NeverKeyword ||
    !parameter ||
    !ts.isIdentifier(parameter.name) ||
    parameter.type?.kind !== ts.SyntaxKind.StringKeyword ||
    parameter.questionToken !== undefined ||
    parameter.dotDotDotToken !== undefined ||
    parameter.initializer !== undefined ||
    parameter.modifiers?.length
  ) {
    throw new Error('Unsupported object index signature schema');
  }
  return {
    type: 'object',
    additionalProperties: schemaForTypeNode(index.type, state),
  };
}

/**
 * @param {ts.PropertyName} name
 */
function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text;
  return null;
}

/**
 * @param {ts.TypeNode | undefined} node
 * @param {Registry} state
 * @returns {Schema}
 */
function schemaForTypeNode(node, state) {
  if (!node) return { $ref: '#/components/schemas/UnknownJson' };

  if (ts.isParenthesizedTypeNode(node)) return schemaForTypeNode(node.type, state);
  if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword)
    return schemaForTypeNode(node.type, state);
  if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.KeyOfKeyword)
    return { type: 'string', enum: finiteKeys(node, state) };
  if (ts.isMappedTypeNode(node)) return mappedTypeSchema(node, state);
  if (ts.isIndexedAccessTypeNode(node)) {
    const object = objectShape(schemaForTypeNode(node.objectType, state), state);
    const keys = finiteKeys(node.indexType, state);
    const selected = keys.map((key) => {
      const property = object.properties?.[key];
      if (!Object.hasOwn(object.properties ?? {}, key) || property === undefined)
        throw new Error(`Unresolved indexed schema property ${key}`);
      return property;
    });
    return selected.length === 1 && selected[0] !== undefined ? selected[0] : { anyOf: selected };
  }
  if (ts.isArrayTypeNode(node)) {
    return { type: 'array', items: schemaForTypeNode(node.elementType, state) };
  }
  if (ts.isTypeLiteralNode(node)) return typeLiteralSchema(node, state);
  if (ts.isLiteralTypeNode(node)) return literalSchema(node.literal);
  if (ts.isUnionTypeNode(node)) return unionSchema(node.types, state);
  if (ts.isIntersectionTypeNode(node)) return intersectionSchema(node.types, state);
  if (ts.isTypeReferenceNode(node)) return typeReferenceSchema(node, state);

  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
      return { type: 'string' };
    case ts.SyntaxKind.NumberKeyword:
      return { type: 'number' };
    case ts.SyntaxKind.BooleanKeyword:
      return { type: 'boolean' };
    case ts.SyntaxKind.NullKeyword:
      return { type: 'null' };
    case ts.SyntaxKind.UnknownKeyword:
    case ts.SyntaxKind.AnyKeyword:
      return { $ref: '#/components/schemas/JsonValue' };
    case ts.SyntaxKind.VoidKeyword:
      return { $ref: '#/components/schemas/JsonValue' };
    default:
      return { $ref: '#/components/schemas/UnknownJson' };
  }
}

/**
 * @param {ts.TypeReferenceNode} node
 * @param {Registry} state
 * @returns {Schema}
 */
function typeReferenceSchema(node, state) {
  const name = node.typeName.getText();
  const binding = state.typeBindings?.get(name);
  if (binding !== undefined) return binding;
  if (name === 'Readonly' && node.typeArguments?.[0]) {
    return schemaForTypeNode(node.typeArguments[0], state);
  }
  if (name === 'Promise' && node.typeArguments?.[0]) {
    return schemaForTypeNode(node.typeArguments[0], state);
  }
  if (name === 'JsonObject' || name === 'JsonValue') {
    return { $ref: `#/components/schemas/${name}` };
  }
  if (['Partial', 'Required', 'Pick', 'Omit'].includes(name)) {
    const arguments_ = node.typeArguments ?? [];
    if (arguments_.length !== (['Pick', 'Omit'].includes(name) ? 2 : 1))
      throw new Error(`Unsupported ${name} schema arguments`);
    const schema = objectShape(schemaForTypeNode(arguments_[0], state), state);
    const properties = { ...schema.properties };
    if (name === 'Pick' || name === 'Omit') {
      const keyArgument = arguments_[1];
      if (!keyArgument) throw new Error(`Unsupported ${name} schema arguments`);
      const keys = new Set(utilityKeys(keyArgument));
      if (name === 'Pick' && [...keys].some((key) => !Object.hasOwn(properties, key)))
        throw new Error('Unresolved Pick schema property');
      for (const key of Object.keys(properties))
        if (keys.has(key) !== (name === 'Pick')) delete properties[key];
    }
    const required =
      name === 'Required'
        ? Object.keys(properties).sort()
        : name === 'Partial'
          ? []
          : (schema.required ?? []).filter((key) => Object.hasOwn(properties, key));
    const rest = { ...schema };
    delete rest.required;
    return {
      ...rest,
      properties: sortObject(properties),
      ...(required.length ? { required } : {}),
    };
  }
  if (['Array', 'ReadonlyArray'].includes(name) && node.typeArguments?.[0]) {
    return { type: 'array', items: schemaForTypeNode(node.typeArguments[0], state) };
  }
  if (name === 'Record') {
    if (node.typeArguments?.length !== 2) throw new Error('Unsupported Record schema arguments');
    let keyType = node.typeArguments[0];
    if (!keyType) throw new Error('Unsupported Record schema arguments');
    while (ts.isParenthesizedTypeNode(keyType)) keyType = keyType.type;
    const valueType = node.typeArguments[1];
    // This exact source dictionary has no admissible property value.
    if (
      keyType.kind === ts.SyntaxKind.StringKeyword &&
      valueType?.kind === ts.SyntaxKind.NeverKeyword
    )
      return { type: 'object', additionalProperties: false };
    const value = schemaForTypeNode(valueType, state);
    if (keyType.kind !== ts.SyntaxKind.StringKeyword) {
      const keys = finiteKeys(keyType, state);
      return {
        type: 'object',
        additionalProperties: false,
        properties: sortObject(Object.fromEntries(keys.map((key) => [key, value]))),
        ...(keys.length ? { required: [...keys].sort() } : {}),
      };
    }
    return {
      type: 'object',
      additionalProperties: value,
    };
  }
  if (name === 'Date') {
    return { type: 'string', format: 'date-time' };
  }
  if (name === 'Buffer' || name === 'Uint8Array') {
    return { type: 'string', format: 'binary' };
  }
  const declaration = state.declarations.get(name);
  if (declaration) {
    if (node.typeArguments?.length || declaration.node.typeParameters?.length)
      throw new Error(`Unsupported generic schema instantiation ${name}`);
    schemaForTypeName(name, state);
    return { $ref: `#/components/schemas/${name}` };
  }
  return { $ref: '#/components/schemas/UnknownJson' };
}

/**
 * @param {readonly ts.TypeNode[]} types
 * @param {Registry} state
 * @returns {Schema}
 */
function unionSchema(types, state) {
  const nonUndefined = types.filter((type) => type.kind !== ts.SyntaxKind.UndefinedKeyword);
  const literalSchemas = nonUndefined.map((type) => schemaForTypeNode(type, state));
  const enumValues = literalSchemas
    .filter((schema) => Object.prototype.hasOwnProperty.call(schema, 'const'))
    .flatMap((schema) => (schema.const === undefined ? [] : [schema.const]));
  if (enumValues.length === literalSchemas.length && enumValues.length > 0) {
    const valueTypes = [
      ...new Set(enumValues.map((value) => (value === null ? 'null' : typeof value))),
    ];
    return {
      ...(valueTypes.length === 1 ? { type: valueTypes[0] } : {}),
      enum: enumValues,
    };
  }
  return { anyOf: literalSchemas };
}

/**
 * @param {readonly ts.TypeNode[]} types
 * @param {Registry} state
 * @returns {Schema}
 */
function intersectionSchema(types, state) {
  const schemas = types.map((type) => schemaForTypeNode(type, state));
  if (schemas.every((schema) => isObjectSchema(schema, state)))
    try {
      return mergeObjectShapes(schemas.map((schema) => objectShape(schema, state)));
    } catch (error) {
      throw new Error(
        `Unsupported intersection schema: ${types.map((type) => type.getText()).join(' & ')}`,
        { cause: error },
      );
    }
  return { allOf: schemas };
}

/**
 * @param {Schema} schema
 * @param {Registry} state
 * @param {Set<string>} [seen]
 * @returns {boolean}
 */
function isObjectSchema(schema, state, seen = new Set()) {
  if (schema.type === 'object') return true;
  if (schema.allOf) return schema.allOf.every((item) => isObjectSchema(item, state, seen));
  if (!schema.$ref) return false;
  const name = schema.$ref.match(/^#\/components\/schemas\/(.+)$/u)?.[1];
  if (!name || seen.has(name) || !Object.hasOwn(state.schemas, name)) return false;
  const resolved = state.schemas[name];
  return resolved !== undefined && isObjectSchema(resolved, state, new Set(seen).add(name));
}

/**
 * @param {ts.TypeNode} node
 * @param {Registry} state
 * @returns {string[]}
 */
function finiteKeys(node, state) {
  if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.KeyOfKeyword) {
    const shape = objectShape(schemaForTypeNode(node.type, state), state);
    if (shape.additionalProperties !== false) throw new Error('Unsupported unbounded keyof schema');
    return Object.keys(shape.properties ?? {});
  }
  let schema = schemaForTypeNode(node, state);
  /** @type {Set<string>} */
  const seen = new Set();
  while (schema.$ref) {
    const name = schema.$ref.match(/^#\/components\/schemas\/(.+)$/u)?.[1];
    if (!name || seen.has(name) || !Object.hasOwn(state.schemas, name))
      throw new Error('Unresolved finite schema keys');
    seen.add(name);
    const resolved = state.schemas[name];
    if (!resolved) throw new Error('Unresolved finite schema keys');
    schema = resolved;
  }
  const keys = Object.hasOwn(schema, 'const') ? [schema.const] : schema.enum;
  if (!Array.isArray(keys) || !keys.every((key) => typeof key === 'string'))
    throw new Error('Unsupported non-finite mapped or indexed schema keys');
  return [...new Set(keys)];
}

/**
 * @param {ts.MappedTypeNode} node
 * @param {Registry} state
 * @returns {Schema}
 */
function mappedTypeSchema(node, state) {
  if (node.nameType || !node.type || !node.typeParameter.constraint)
    throw new Error('Unsupported mapped schema shape');
  const constraint = node.typeParameter.constraint;
  const keys = finiteKeys(constraint, state);
  const inherited =
    ts.isTypeOperatorNode(constraint) && constraint.operator === ts.SyntaxKind.KeyOfKeyword
      ? objectShape(schemaForTypeNode(constraint.type, state), state)
      : null;
  const properties = schemaDictionary();
  const required = [];
  for (const key of keys) {
    const bindings = new Map(state.typeBindings ?? []);
    bindings.set(node.typeParameter.name.text, { type: 'string', const: key });
    properties[key] = schemaForTypeNode(node.type, { ...state, typeBindings: bindings });
    const optional = node.questionToken && node.questionToken.kind !== ts.SyntaxKind.MinusToken;
    if (
      !optional &&
      (node.questionToken?.kind === ts.SyntaxKind.MinusToken ||
        !inherited ||
        (inherited.required ?? []).includes(key))
    )
      required.push(key);
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties: sortObject(properties),
    ...(required.length ? { required: required.sort() } : {}),
  };
}

/**
 * @param {ts.LiteralTypeNode["literal"]} literal
 * @returns {Schema}
 */
function literalSchema(literal) {
  if (ts.isStringLiteral(literal)) return { type: 'string', const: literal.text };
  if (ts.isNumericLiteral(literal)) return { type: 'number', const: Number(literal.text) };
  if (literal.kind === ts.SyntaxKind.TrueKeyword) return { type: 'boolean', const: true };
  if (literal.kind === ts.SyntaxKind.FalseKeyword) return { type: 'boolean', const: false };
  if (literal.kind === ts.SyntaxKind.NullKeyword) return { type: 'null', const: null };
  return { $ref: '#/components/schemas/UnknownJson' };
}

/**
 * @param {Schema | undefined} schema
 * @param {Registry} registry
 * @param {Set<string>} [seen]
 * @returns {unknown}
 */
function exampleForSchema(schema, registry, seen = new Set()) {
  if (!schema || typeof schema !== 'object') return null;
  if (schema.$ref) {
    const name = schema.$ref.match(/^#\/components\/schemas\/(.+)$/u)?.[1];
    if (!name || seen.has(name)) return {};
    if (name === 'JsonValue') return { example: true };
    if (name === 'JsonObject' || name === 'FlowJsonObject')
      return { id: '00000000-0000-4000-8000-000000000000' };
    seen.add(name);
    return exampleForSchema(registry.schemas[name] ?? {}, registry, seen);
  }
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0)
    return exampleForSchema(schema.anyOf[0], registry, seen);
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    return Object.assign({}, ...schema.allOf.map((item) => exampleForSchema(item, registry, seen)));
  }
  if (schema.type === 'array') return [exampleForSchema(schema.items ?? {}, registry, seen)];
  if (schema.type === 'object' || schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([name, propertySchema]) => [
        name,
        exampleForSchema(propertySchema, registry, seen),
      ]),
    );
  }
  if (schema.type === 'integer' || schema.type === 'number') return 1;
  if (schema.type === 'boolean') return true;
  if (schema.type === 'null') return null;
  return 'example';
}

/**
 * @param {string} typeName
 */
function isUnknownBodyType(typeName) {
  return /^(?:unknown|any|Record\s*<\s*string\s*,\s*unknown\s*>|Record\s*<\s*string\s*,\s*any\s*>)$/u.test(
    typeName,
  );
}

/**
 * @param {string | null} typeName
 */
function schemaNameForBodyType(typeName) {
  if (!typeName || isUnknownBodyType(typeName)) return null;
  return typeName.match(/^[A-Za-z_$][\w$]*/u)?.[0] ?? null;
}

/**
 * @template T
 * @param {Record<string, T>} value
 * @returns {Record<string, T>}
 */
function sortObject(value) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

/** @returns {Record<string, Schema>} */
function schemaDictionary() {
  /** @type {Record<string, Schema>} */
  const dictionary = {};
  Object.setPrototypeOf(dictionary, null);
  return dictionary;
}

/** @param {unknown} value
 * @returns {value is Record<string, unknown>} */
function isPropertyRecord(value) {
  return typeof value === 'object' && value !== null;
}
/** @param {unknown} value
 * @returns {value is {tagName: {text: string}, comment?: unknown}} */
function isNativeJSDocTag(value) {
  return (
    isPropertyRecord(value) &&
    isPropertyRecord(value.tagName) &&
    typeof value.tagName.text === 'string'
  );
}
/** @param {ts.Node} node
 * @returns {{tagName: {text: string}, comment?: unknown}[]} */
function nativeJSDocTags(node) {
  /** @type {unknown} */
  const docs = Reflect.get(node, 'jsDoc');
  if (docs == null) return [];
  if (!Array.isArray(docs)) throw new Error('Invalid native TypeScript JSDoc collection');
  return docs.flatMap((/** @type {unknown} */ doc) => {
    if (!isPropertyRecord(doc)) throw new Error('Invalid native TypeScript JSDoc node');
    const tags = doc.tags;
    if (tags == null) return [];
    if (!Array.isArray(tags)) throw new Error('Invalid native TypeScript JSDoc tags');
    return tags.map((/** @type {unknown} */ tag) => {
      if (!isNativeJSDocTag(tag)) throw new Error('Invalid native TypeScript JSDoc tag');
      return tag;
    });
  });
}

/** @param {unknown} value @returns {object} */
function jsonObject(value) {
  if (value === null || value === undefined)
    throw new TypeError('Cannot convert undefined or null to object');
  /** @type {unknown} */
  const boxed = Object(value);
  if ((typeof boxed !== 'object' || boxed === null) && typeof boxed !== 'function')
    throw new TypeError('Invalid native Object result');
  return boxed;
}
/** @param {unknown} value @param {string} name @returns {unknown} */
function jsonField(value, name) {
  if (value === null || value === undefined)
    throw new TypeError(`Cannot read properties of ${value} (reading '${name}')`);
  return Reflect.get(jsonObject(value), name, value);
}
/** @param {unknown} value @returns {[string, unknown][]} */
function jsonEntries(value) {
  return Object.entries(jsonObject(value));
}
/** Invoke the same native path resolver at the configuration consumption boundary.
 * @param {unknown} value @returns {string} */
function resolveConfigurationPath(value) {
  /** @type {unknown} */
  const result = Reflect.apply(resolve, undefined, [repoRoot, value]);
  if (typeof result !== 'string') throw new TypeError('Invalid native path resolution result');
  return result;
}
