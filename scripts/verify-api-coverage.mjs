#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import * as ts from 'typescript';

const repoRoot = process.cwd();
const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const writeOpenApi = args.has('--write-openapi');
const config = readConfig().apiCoverage ?? {};
const openapiPath = resolve(repoRoot, config.openapiPath ?? 'docs/framework/contracts/openapi.json');
const sourceRoots = config.sourceRoots ?? ['reference/api/src', 'packages'];
const routePrefix = config.routePrefix ?? '';
const sourceRootPaths = sourceRoots.map((root) => resolve(repoRoot, root));
const returnTypeIndex = buildReturnTypeIndex(sourceRootPaths);
const implementedOperations = discoverNestOperations(
  sourceRootPaths,
  routePrefix,
  returnTypeIndex,
);
const schemaRegistry = buildSchemaRegistry(
  sourceRootPaths,
  implementedOperations
    .flatMap((operation) => [operation.bodyType, operation.responseType])
    .filter(Boolean),
);

if (writeOpenApi) {
  writeOpenApiContract(openapiPath, implementedOperations);
  const legacyOpenApiPath = resolve(repoRoot, 'docs/framework/api/openapi.json');
  if (legacyOpenApiPath !== openapiPath) {
    writeOpenApiContract(legacyOpenApiPath, implementedOperations);
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

const summary = {
  schemaVersion: '1',
  openapiPath: existsSync(openapiPath) ? relative(repoRoot, openapiPath) : null,
  openapiPaths: openapiRoutes.length,
  implementedOperations: implementedOperations.length,
  implementedRoutes: implementedRoutes.length,
  parameterNameMismatches,
  missingInCode,
  missingInOpenApi,
};

if (args.has('--json')) console.log(JSON.stringify(summary, null, 2));
else
  console.log(
    `API coverage: ${summary.openapiPaths} OpenAPI paths, ${summary.implementedRoutes} implemented routes.`,
  );
if (
  strict &&
  (missingInCode.length > 0 || missingInOpenApi.length > 0 || parameterNameMismatches.length > 0)
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
    const controller = text.match(/@Controller\(([^)]*)\)/u)?.[1] ?? "''";
    const base = literal(controller);
    const className = text.match(/export\s+class\s+([A-Za-z_$][\w$]*)/u)?.[1] ?? 'Controller';
    const serviceProperties = constructorProperties(text);
    for (const match of text.matchAll(/@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/gu)) {
      const routePath = normalizePath(`${prefix}/${base}/${literal(match[2])}`);
      const fragment = methodFragment(text, match.index);
      const bodyType = bodyTypeName(fragment);
      const queryNames = namedQueryParameters(fragment);
      const handler = handlerName(text.slice(match.index + match[0].length));
      operations.push({
        method: httpMethod(match[1]),
        path: openApiPath(routePath),
        routePath,
        bodyType,
        responseType: responseTypeName(fragment, methodSource(text, match.index), serviceProperties, returnTypes),
        hasQueryObject: /@Query\(\)/u.test(fragment),
        isPublic: isPublicOperation(text, match.index, routePath),
        queryNames,
        handler,
        source: relative(repoRoot, file),
        tag: className.replace(/Controller$/u, '') || className,
      });
    }
  }
  return operations.sort((left, right) =>
    left.path.localeCompare(right.path)
    || left.method.localeCompare(right.method)
    || left.source.localeCompare(right.source),
  );
}

function walk(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (
      entry.isDirectory()
      && !['node_modules', 'dist', 'coverage', 'test', 'tests', 'fixtures', '__fixtures__'].includes(entry.name)
    )
      return walk(path);
    return entry.isFile() ? [path] : [];
  });
}

function literal(value = '') {
  return value
    .trim()
    .replace(/^['"`]|['"`]$/gu, '')
    .replace(/^\//u, '')
    .replace(/\/$/u, '');
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

function httpMethod(decoratorName) {
  return decoratorName.toLowerCase();
}

function handlerName(textAfterDecorator) {
  return textAfterDecorator.match(/^\s*(?:@[^\n]+\n\s*)*([A-Za-z_$][\w$]*)\s*\(/u)?.[1] ?? 'handler';
}

function methodFragment(text, decoratorIndex) {
  const source = methodSource(text, decoratorIndex);
  const openBrace = methodBodyStart(source);
  return openBrace === -1 ? source : source.slice(0, openBrace);
}

function methodSource(text, decoratorIndex) {
  const rest = text.slice(decoratorIndex);
  const openBrace = methodBodyStart(rest);
  if (openBrace === -1) return rest;
  const closeBrace = blockEnd(rest, openBrace);
  return closeBrace === -1 ? rest : rest.slice(0, closeBrace + 1);
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

function blockEnd(text, openBrace) {
  let depth = 0;
  let quote = null;
  for (let index = openBrace; index < text.length; index += 1) {
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
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function bodyTypeName(fragment) {
  const match = fragment.match(/@Body\([^)]*\)\s+[A-Za-z_$][\w$]*\??:\s*/u);
  if (!match || match.index === undefined) return null;
  return readTypeExpression(fragment.slice(match.index + match[0].length));
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
  for (const property of match[1].matchAll(/private\s+readonly\s+([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)/gu)) {
    properties[property[1]] = property[2];
  }
  return properties;
}

function buildReturnTypeIndex(roots) {
  const index = {};
  const sourceFiles = roots
    .flatMap(walk)
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.spec.ts') && !path.endsWith('.test.ts'));
  for (const file of sourceFiles) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
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

function namedQueryParameters(fragment) {
  return [...fragment.matchAll(/@Query\(\s*['"`]([^'"`]+)['"`]\s*\)/gu)]
    .map((match) => match[1])
    .sort((left, right) => left.localeCompare(right));
}

function isPublicOperation(text, decoratorIndex, routePath) {
  if (routePath === '/' || routePath.startsWith('/health') || routePath.startsWith('/ready')) return true;
  const decoratorWindow = text.slice(Math.max(0, decoratorIndex - 500), decoratorIndex);
  return /@Public\(\)/u.test(decoratorWindow);
}

function writeOpenApiContract(file, operations) {
  const paths = {};
  for (const operation of operations) {
    const pathItem = paths[operation.path] ?? {};
    const parameters = [
      ...pathParameters(operation.path),
      ...queryParameters(operation.queryNames),
    ];
    const method = {
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
      ...(operation.routePath !== operation.path ? { 'x-stynx-route': operation.routePath } : {}),
      responses: operationResponses(operation, schemaRegistry),
    };
    pathItem[operation.method] = method;
    paths[operation.path] = sortObject(pathItem);
  }

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({
    openapi: '3.1.0',
    info: {
      title: 'STYNX API',
      version: '0.2.0',
      description: 'Generated route and contract inventory for STYNX reference and package controllers.',
    },
    components: openApiComponents(schemaRegistry),
    paths: sortObject(paths),
  }, null, 2)}\n`);
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
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.spec.ts') && !path.endsWith('.test.ts'));
  const declarations = new Map();
  for (const file of sourceFiles) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
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
    schemas: {},
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
  return objectSchemaFromMembers(node.members, state);
}

function objectSchemaFromMembers(members, state) {
  const properties = {};
  const required = [];
  for (const member of members) {
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
    ...(required.length > 0 ? { required: required.sort((left, right) => left.localeCompare(right)) } : {}),
  };
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function schemaForTypeNode(node, state) {
  if (!node) return { $ref: '#/components/schemas/UnknownJson' };

  if (ts.isParenthesizedTypeNode(node)) return schemaForTypeNode(node.type, state);
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
  if (['Readonly', 'Required'].includes(name) && node.typeArguments?.[0]) {
    return schemaForTypeNode(node.typeArguments[0], state);
  }
  if (name === 'Promise' && node.typeArguments?.[0]) {
    return schemaForTypeNode(node.typeArguments[0], state);
  }
  if (name === 'JsonObject' || name === 'JsonValue') {
    return { $ref: `#/components/schemas/${name}` };
  }
  if (name === 'Partial' && node.typeArguments?.[0]) {
    const schema = schemaForTypeNode(node.typeArguments[0], state);
    if (schema.$ref) return schema;
    const { required, ...rest } = schema;
    return rest;
  }
  if (name === 'Array' && node.typeArguments?.[0]) {
    return { type: 'array', items: schemaForTypeNode(node.typeArguments[0], state) };
  }
  if (name === 'Record') {
    return {
      type: 'object',
      additionalProperties: node.typeArguments?.[1]
        ? schemaForTypeNode(node.typeArguments[1], state)
        : true,
    };
  }
  if (name === 'Date') {
    return { type: 'string', format: 'date-time' };
  }
  if (name === 'Buffer' || name === 'Uint8Array') {
    return { type: 'string', format: 'binary' };
  }
  if (state.declarations.has(name)) {
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
    const valueTypes = [...new Set(enumValues.map((value) => (value === null ? 'null' : typeof value)))];
    return {
      ...(valueTypes.length === 1 ? { type: valueTypes[0] } : {}),
      enum: enumValues,
    };
  }
  return { anyOf: literalSchemas };
}

function intersectionSchema(types, state) {
  return { allOf: types.map((type) => schemaForTypeNode(type, state)) };
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
    if (name === 'JsonObject' || name === 'FlowJsonObject') return { id: '00000000-0000-4000-8000-000000000000' };
    seen.add(name);
    return exampleForSchema(registry.schemas[name] ?? {}, registry, seen);
  }
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) return exampleForSchema(schema.anyOf[0], registry, seen);
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
  return /^(?:unknown|any|Record\s*<\s*string\s*,\s*unknown\s*>|Record\s*<\s*string\s*,\s*any\s*>)$/u.test(typeName);
}

function schemaNameForBodyType(typeName) {
  if (!typeName || isUnknownBodyType(typeName)) return null;
  return typeName.match(/^[A-Za-z_$][\w$]*/u)?.[0] ?? null;
}

function operationId(operation) {
  const pathId = operation.path
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      const parameter = segment.match(/^(?::([^/{}:]+)|\{([^/{}:]+)\})$/u);
      return parameter ? `by-${parameter[1] ?? parameter[2]}` : segment.replace(/[^A-Za-z0-9]+/gu, '-');
    })
    .join('-');
  return [operation.tag, operation.method, pathId, operation.handler]
    .filter(Boolean)
    .join('-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '');
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}
