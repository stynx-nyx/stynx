#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import * as ts from 'typescript';
import { parseNestControllerDeclarations } from './lib/nest-route-declarations.mjs';
import { bindHttpApiCompositions, operationId } from './lib/http-api-compositions.mjs';

const repoRoot = process.cwd();
const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const writeOpenApi = args.has('--write-openapi');
const config = readConfig().apiCoverage ?? {};
const openapiPath = resolve(
  repoRoot,
  config.openapiPath ?? 'docs/framework/contracts/openapi.json',
);
const sourceRoots = config.sourceRoots ?? ['reference/api/src', 'packages'];
const routePrefix = config.routePrefix ?? '';
const sourceRootPaths = sourceRoots.map((root) => resolve(repoRoot, root));
const returnTypeIndex = buildReturnTypeIndex(sourceRootPaths);
const composition = bindHttpApiCompositions(
  repoRoot,
  discoverNestOperations(sourceRootPaths, routePrefix, returnTypeIndex),
);
const implementedOperations = composition.operations;
const schemaRegistry = buildSchemaRegistry(
  sourceRootPaths,
  implementedOperations
    .flatMap((operation) => [operation.bodyType, operation.responseType])
    .filter(Boolean),
);
// Resolve the entire declaration population before projecting any document.
// A secondary composition may introduce types absent from the primary contract.
for (const operation of implementedOperations) {
  if (operation.bodyType) requestBodySchema(operation.bodyType, schemaRegistry);
  if (operation.responseType) responseBodySchema(operation.responseType, schemaRegistry);
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

if (args.has('--json')) console.log(JSON.stringify(summary, null, 2));
else
  console.log(
    `API coverage: ${summary.openapiPaths} OpenAPI paths, ${summary.implementedRoutes} implemented routes.`,
  );
if (
  strict &&
  (missingInCode.length > 0 ||
    missingInOpenApi.length > 0 ||
    parameterNameMismatches.length > 0 ||
    operationDrift.length > 0 ||
    compositionDrift.length > 0)
) {
  throw new Error(`API coverage drift detected:\n${JSON.stringify(summary, null, 2)}`);
}

function readConfig() {
  const rc = join(repoRoot, '.stynxrc.json');
  if (existsSync(rc)) return JSON.parse(readFileSync(rc, 'utf8'));
  return JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).stynx ?? {};
}

function readOpenApiPaths(file) {
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  return Object.keys(parsed.paths ?? {}).map(normalizePath);
}

function discoverNestOperations(roots, prefix, returnTypes) {
  const operations = [];
  for (const file of roots.flatMap(walk).filter((path) => path.endsWith('.controller.ts'))) {
    const text = readFileSync(file, 'utf8');
    for (const controller of parseNestControllerDeclarations(text, { file })) {
      const serviceProperties = constructorProperties(controller.source);
      for (const member of controller.methods) {
        const fragment = member.signature;
        const bodyParameters = member.parameters.filter((parameter) =>
          parameter.decorators.some((decorator) => decorator.name === 'Body'),
        );
        if (
          bodyParameters.length > 1 ||
          bodyParameters.some((parameter) =>
            parameter.decorators.some(
              (decorator) => decorator.name === 'Body' && decorator.selector.kind !== 'whole',
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
          .filter((decorator) => decorator.selector.kind === 'property')
          .map((decorator) => decorator.selector.name)
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
              hasQueryObject: queries.some((decorator) => decorator.selector.kind === 'whole'),
              isPublic: attached.some((decorator) =>
                ['Public', 'PublicTenantRoute'].includes(decorator.name),
              ),
              queryNames,
              handler: member.name,
              controller: controller.name,
              source: relative(repoRoot, file),
              tag: controller.name.replace(/Controller$/u, '') || controller.name,
              declarationId: `${relative(repoRoot, file)}:${controller.name}.${member.name}:${registration.method}:${routePath}`,
              controllerOptions: controller.options,
            });
          }
        }
      }
    }
  }

  return operations.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.method.localeCompare(right.method) ||
      left.source.localeCompare(right.source),
  );
}

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

function normalizePath(path) {
  return `/${path}`.replace(/\/+/gu, '/').replace(/\/$/u, '') || '/';
}

function openApiPath(path) {
  return normalizePath(path)
    .split('/')
    .map((segment) => (segment.startsWith(':') ? `{${segment.slice(1)}}` : segment))
    .join('/');
}

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

function parameterNames(path) {
  return normalizePath(path)
    .split('/')
    .filter(Boolean)
    .map((segment, index) => {
      if (segment.startsWith(':')) return { index, name: segment.slice(1), syntax: ':' };
      const match = segment.match(/^\{([^/{}]+)\}$/u);
      return match ? { index, name: match[1], syntax: '{}' } : null;
    })
    .filter(Boolean);
}

function groupByCanonical(paths) {
  const grouped = new Map();
  for (const path of paths) {
    const canonical = canonicalizePath(path);
    const routes = grouped.get(canonical) ?? [];
    routes.push(path);
    grouped.set(canonical, routes);
  }
  return grouped;
}

function diagnostic(path, canonical) {
  return { path, normalized: canonical };
}

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

function responseTypeName(fragment, source, serviceProperties, returnTypes) {
  const explicit = explicitReturnType(fragment);
  if (explicit) return explicit;
  const serviceCall = source.match(/return\s+this\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/u);
  if (serviceCall) {
    const serviceType = serviceProperties[serviceCall[1]];
    const serviceReturn = serviceType ? returnTypes[`${serviceType}.${serviceCall[2]}`] : null;
    if (serviceReturn) return serviceReturn;
  }
  if (/return\s+\{/u.test(source)) return 'JsonObject';
  return 'JsonValue';
}

function explicitReturnType(fragment) {
  const openBraceIndex = methodBodyStart(fragment);
  const signature = openBraceIndex === -1 ? fragment : fragment.slice(0, openBraceIndex);
  const match = signature.match(/\)\s*:\s*/u);
  if (!match || match.index === undefined) return null;
  return readTypeExpression(signature.slice(match.index + match[0].length));
}

function constructorProperties(text) {
  const match = text.match(/constructor\s*\(([\s\S]*?)\)\s*\{/u);
  if (!match) return {};
  const properties = {};
  for (const property of match[1].matchAll(
    /private\s+readonly\s+([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)/gu,
  )) {
    properties[property[1]] = property[2];
  }
  return properties;
}

function buildReturnTypeIndex(roots) {
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

function operationWithVariants(operation, variants) {
  const method = operationContract(operation);
  const group = composition.groups.get(`${operation.method.toUpperCase()} ${operation.path}`);
  if (variants && group.length > 1)
    method['x-stynx-operation-variants'] = group.map(operationContract);
  return method;
}

function compareOperations(file, operations, variants, compositionId) {
  const contract = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const paths = contract.paths ?? {};
  const expected = new Map(
    operations.map((operation) => [
      `${operation.method.toUpperCase()} ${operation.path}`,
      operation,
    ]),
  );
  const failures = [];
  if (contract.openapi !== '3.1.0' || contract['x-stynx-composition'] !== compositionId)
    failures.push({ reason: 'document-identity-mismatch' });
  if (stableJson(contract.components) !== stableJson(openApiComponents(schemaRegistry)))
    failures.push({ reason: 'schema-components-mismatch' });
  for (const [path, item] of Object.entries(paths)) {
    for (const [method, actual] of Object.entries(item)) {
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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function writeOpenApiContract(file, operations, variants, compositionId) {
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

function requestBodySchema(typeName, registry) {
  const schemaName = schemaNameForBodyType(typeName);
  if (!schemaName) return { $ref: '#/components/schemas/UnknownJson' };
  if (registry.schemas[schemaName]) return { $ref: `#/components/schemas/${schemaName}` };
  return {
    $ref: '#/components/schemas/UnknownJson',
    'x-stynx-unresolved-source-type': typeName,
  };
}

function operationResponses(operation, registry) {
  const schema = responseBodySchema(operation.responseType, registry);
  return {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema,
          'x-stynx-source-type': operation.responseType,
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

function responseBodySchema(typeName, registry) {
  if (!typeName) return { $ref: '#/components/schemas/JsonValue' };
  return schemaForTypeExpression(typeName, registry);
}

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

function buildSchemaRegistry(roots, seedTypeNames) {
  const sourceFiles = roots
    .flatMap(walk)
    .filter(
      (path) => path.endsWith('.ts') && !path.endsWith('.spec.ts') && !path.endsWith('.test.ts'),
    );
  const declarations = new Map();
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
        }
      }
    });
  }

  const state = {
    declarations,
    schemas: Object.create(null),
    building: new Set(),
  };
  for (const name of seedTypeNames.map(schemaNameForBodyType).filter(Boolean)) {
    schemaForTypeName(name, state);
  }
  return state;
}

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

function interfaceSchema(node, state) {
  const bases = (node.heritageClauses ?? []).flatMap((clause) =>
    clause.types.map((base) => objectShape(schemaForTypeExpression(base.getText(), state), state)),
  );
  return mergeObjectShapes([...bases, objectSchemaFromMembers(node.members, state)]);
}

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

function mergeObjectShapes(shapes) {
  const indexConstraints = shapes
    .map((shape) => shape.additionalProperties)
    .filter(
      (constraint) =>
        constraint !== false &&
        constraint !== undefined &&
        constraint !== true &&
        stableJson(constraint) !== stableJson({ $ref: '#/components/schemas/JsonValue' }),
    );
  const indexTypes = indexConstraints.map(primitiveIndexType);
  if (
    shapes.length > 1 &&
    indexConstraints.length &&
    (indexTypes.some((type) => !type) || new Set(indexTypes).size !== 1)
  )
    throw new Error('Unsupported open-object inherited or intersection schema constraints');
  const properties = Object.create(null);
  const required = new Set();
  let additionalProperties = false;
  for (const shape of shapes) {
    for (const [name, schema] of Object.entries(shape.properties ?? {})) {
      properties[name] =
        Object.hasOwn(properties, name) && stableJson(properties[name]) !== stableJson(schema)
          ? { allOf: [properties[name], schema] }
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
    additionalProperties = indexConstraints[0];
  }
  return {
    type: 'object',
    additionalProperties,
    properties: sortObject(properties),
    ...(required.size ? { required: [...required].sort() } : {}),
  };
}

function primitiveIndexType(schema) {
  if (schema.anyOf?.length === 1 && Object.keys(schema).length === 1)
    return primitiveIndexType(schema.anyOf[0]);
  return Object.keys(schema).length === 1 &&
    ['string', 'number', 'boolean', 'null'].includes(schema.type)
    ? schema.type
    : null;
}

function schemaFitsPrimitiveIndex(schema, type) {
  if (schema.type === type) return true;
  if (schema.anyOf) return schema.anyOf.every((item) => schemaFitsPrimitiveIndex(item, type));
  if (schema.allOf) return schema.allOf.some((item) => schemaFitsPrimitiveIndex(item, type));
  return false;
}

function utilityKeys(node) {
  if (ts.isParenthesizedTypeNode(node)) return utilityKeys(node.type);
  if (ts.isUnionTypeNode(node)) return node.types.flatMap(utilityKeys);
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) return [node.literal.text];
  throw new Error('Unsupported computed object utility key schema');
}

function objectSchemaFromMembers(members, state) {
  const properties = Object.create(null);
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

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text;
  return null;
}

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
      if (!Object.hasOwn(object.properties ?? {}, key))
        throw new Error(`Unresolved indexed schema property ${key}`);
      return object.properties[key];
    });
    return selected.length === 1 ? selected[0] : { anyOf: selected };
  }
  if (ts.isArrayTypeNode(node)) {
    return { type: 'array', items: schemaForTypeNode(node.elementType, state) };
  }
  if (ts.isTypeLiteralNode(node)) return objectSchemaFromMembers(node.members, state);
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

function typeReferenceSchema(node, state) {
  const name = node.typeName.getText();
  if (state.typeBindings?.has(name)) return state.typeBindings.get(name);
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
      const keys = new Set(utilityKeys(arguments_[1]));
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
    const { required: _required, ...rest } = schema;
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
    while (ts.isParenthesizedTypeNode(keyType)) keyType = keyType.type;
    const value = schemaForTypeNode(node.typeArguments[1], state);
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
  if (state.declarations.has(name)) {
    if (node.typeArguments?.length || state.declarations.get(name).node.typeParameters?.length)
      throw new Error(`Unsupported generic schema instantiation ${name}`);
    schemaForTypeName(name, state);
    return { $ref: `#/components/schemas/${name}` };
  }
  return { $ref: '#/components/schemas/UnknownJson' };
}

function unionSchema(types, state) {
  const nonUndefined = types.filter((type) => type.kind !== ts.SyntaxKind.UndefinedKeyword);
  const literalSchemas = nonUndefined.map((type) => schemaForTypeNode(type, state));
  const enumValues = literalSchemas
    .filter((schema) => Object.prototype.hasOwnProperty.call(schema, 'const'))
    .map((schema) => schema.const);
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

function isObjectSchema(schema, state, seen = new Set()) {
  if (schema.type === 'object') return true;
  if (schema.allOf) return schema.allOf.every((item) => isObjectSchema(item, state, seen));
  if (!schema.$ref) return false;
  const name = schema.$ref.match(/^#\/components\/schemas\/(.+)$/u)?.[1];
  if (!name || seen.has(name) || !Object.hasOwn(state.schemas, name)) return false;
  return isObjectSchema(state.schemas[name], state, new Set(seen).add(name));
}

function finiteKeys(node, state) {
  if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.KeyOfKeyword) {
    const shape = objectShape(schemaForTypeNode(node.type, state), state);
    if (shape.additionalProperties !== false) throw new Error('Unsupported unbounded keyof schema');
    return Object.keys(shape.properties ?? {});
  }
  let schema = schemaForTypeNode(node, state);
  const seen = new Set();
  while (schema.$ref) {
    const name = schema.$ref.match(/^#\/components\/schemas\/(.+)$/u)?.[1];
    if (!name || seen.has(name) || !Object.hasOwn(state.schemas, name))
      throw new Error('Unresolved finite schema keys');
    seen.add(name);
    schema = state.schemas[name];
  }
  const keys = Object.hasOwn(schema, 'const') ? [schema.const] : schema.enum;
  if (!Array.isArray(keys) || !keys.every((key) => typeof key === 'string'))
    throw new Error('Unsupported non-finite mapped or indexed schema keys');
  return [...new Set(keys)];
}

function mappedTypeSchema(node, state) {
  if (node.nameType || !node.type || !node.typeParameter.constraint)
    throw new Error('Unsupported mapped schema shape');
  const constraint = node.typeParameter.constraint;
  const keys = finiteKeys(constraint, state);
  const inherited =
    ts.isTypeOperatorNode(constraint) && constraint.operator === ts.SyntaxKind.KeyOfKeyword
      ? objectShape(schemaForTypeNode(constraint.type, state), state)
      : null;
  const properties = Object.create(null);
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

function literalSchema(literal) {
  if (ts.isStringLiteral(literal)) return { type: 'string', const: literal.text };
  if (ts.isNumericLiteral(literal)) return { type: 'number', const: Number(literal.text) };
  if (literal.kind === ts.SyntaxKind.TrueKeyword) return { type: 'boolean', const: true };
  if (literal.kind === ts.SyntaxKind.FalseKeyword) return { type: 'boolean', const: false };
  if (literal.kind === ts.SyntaxKind.NullKeyword) return { type: 'null', const: null };
  return { $ref: '#/components/schemas/UnknownJson' };
}

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

function isUnknownBodyType(typeName) {
  return /^(?:unknown|any|Record\s*<\s*string\s*,\s*unknown\s*>|Record\s*<\s*string\s*,\s*any\s*>)$/u.test(
    typeName,
  );
}

function schemaNameForBodyType(typeName) {
  if (!typeName || isUnknownBodyType(typeName)) return null;
  return typeName.match(/^[A-Za-z_$][\w$]*/u)?.[0] ?? null;
}

function sortObject(value) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}
