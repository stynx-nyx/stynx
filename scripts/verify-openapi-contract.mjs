#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();
const openApiPath = resolve(repoRoot, 'docs/framework/contracts/openapi.json');
const genericResponseAllowlistPath = resolve(repoRoot, 'docs/framework/contracts/openapi-generic-response-allowlist.json');

if (!existsSync(openApiPath)) {
  throw new Error(`OpenAPI contract not found at ${openApiPath}. Run pnpm api:docs:write first.`);
}

const contract = JSON.parse(readFileSync(openApiPath, 'utf8'));
const genericResponseAllowlist = readGenericResponseAllowlist(genericResponseAllowlistPath);
const failures = [];

if (contract.openapi !== '3.1.0') {
  failures.push(`openapi must be 3.1.0, got ${contract.openapi ?? '(missing)'}`);
}

for (const scheme of ['bearerAuth', 'tenantHeader']) {
  if (!contract.components?.securitySchemes?.[scheme]) {
    failures.push(`missing security scheme ${scheme}`);
  }
}

for (const schema of ['ProblemDetails', 'UnknownJson']) {
  if (!contract.components?.schemas?.[schema]) {
    failures.push(`missing schema ${schema}`);
  }
}

for (const schema of ['JsonValue', 'JsonObject']) {
  if (!contract.components?.schemas?.[schema]) {
    failures.push(`missing schema ${schema}`);
  }
}

for (const [path, item] of Object.entries(contract.paths ?? {})) {
  const templatedParameters = [...path.matchAll(/\{([^/{}]+)\}/gu)].map((match) => match[1]);
  for (const [method, operation] of Object.entries(item ?? {})) {
    const label = `${method.toUpperCase()} ${path}`;
    if (!operation.operationId) failures.push(`${label}: missing operationId`);
    if (!Array.isArray(operation.tags) || operation.tags.length === 0) failures.push(`${label}: missing tags`);
    if (!operation['x-stynx-source']) failures.push(`${label}: missing x-stynx-source`);
    if (!Array.isArray(operation.security)) failures.push(`${label}: missing explicit security declaration`);

    const parameters = operation.parameters ?? [];
    for (const name of templatedParameters) {
      const match = parameters.find((parameter) =>
        parameter?.in === 'path' && parameter.name === name && parameter.required === true
      );
      if (!match) failures.push(`${label}: missing required path parameter ${name}`);
    }

    if (['post', 'put', 'patch'].includes(method)) {
      if (!operation.requestBody && operation['x-stynx-no-request-body'] !== true) {
        failures.push(`${label}: missing requestBody or x-stynx-no-request-body`);
      }
    }

    const mediaType = operation.requestBody?.content?.['application/json'];
    const sourceType = mediaType?.['x-stynx-source-type'];
    if (mediaType?.schema?.['x-stynx-unresolved-source-type']) {
      failures.push(`${label}: unresolved request body type ${mediaType.schema['x-stynx-unresolved-source-type']}`);
    }
    if (
      sourceType
      && !isUnknownBodyType(sourceType)
      && mediaType?.schema?.$ref === '#/components/schemas/UnknownJson'
    ) {
      failures.push(`${label}: typed request body ${sourceType} fell back to UnknownJson`);
    }
    if (mediaType?.schema?.$ref === '#/components/schemas/UnknownJson') {
      failures.push(`${label}: request body must use a concrete schema`);
    }
    const requestSchemaName = schemaNameFromRef(mediaType?.schema?.$ref);
    if (sourceType && !isUnknownBodyType(sourceType) && requestSchemaName) {
      const requestSchema = contract.components?.schemas?.[requestSchemaName];
      if (!requestSchema) failures.push(`${label}: missing request body schema ${requestSchemaName}`);
      else if (!requestSchema['x-stynx-source']) {
        failures.push(`${label}: request body schema ${requestSchemaName} missing x-stynx-source`);
      }
    }

    for (const response of ['200', '400', '401', '403', '404', 'default']) {
      if (!operation.responses?.[response]) {
        failures.push(`${label}: missing ${response} response`);
      }
    }
    if (operation.responses?.['200']?.content?.['application/json']?.schema?.$ref === '#/components/schemas/UnknownJson') {
      failures.push(`${label}: 200 response must not use UnknownJson`);
    }
    const successSchemaRef = operation.responses?.['200']?.content?.['application/json']?.schema?.$ref;
    if (isGenericResponseRef(successSchemaRef) && !isAllowedGenericResponse(path, method, genericResponseAllowlist)) {
      failures.push(`${label}: generic 200 response ${successSchemaRef} is not allowlisted`);
    }
    if (!operation.responses?.['200']?.content?.['application/json']?.examples?.default) {
      failures.push(`${label}: missing default 200 response example`);
    }
  }
}

if (failures.length > 0) {
  console.error('[openapi:contract] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[openapi:contract] OK: ${Object.keys(contract.paths ?? {}).length} paths`);

function isUnknownBodyType(typeName) {
  return /^(?:unknown|any|Record\s*<\s*string\s*,\s*unknown\s*>|Record\s*<\s*string\s*,\s*any\s*>)$/u.test(typeName);
}

function schemaNameFromRef(ref) {
  return typeof ref === 'string' ? ref.match(/^#\/components\/schemas\/(.+)$/u)?.[1] : null;
}

function readGenericResponseAllowlist(file) {
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  return (parsed.allow ?? []).map((entry) => ({
    ...entry,
    regex: new RegExp(entry.pathPattern, 'u'),
    methods: new Set(entry.methods ?? []),
  }));
}

function isGenericResponseRef(ref) {
  return [
    '#/components/schemas/JsonValue',
    '#/components/schemas/JsonObject',
    '#/components/schemas/FlowJsonObject',
  ].includes(ref);
}

function isAllowedGenericResponse(path, method, allowlist) {
  return allowlist.some((entry) =>
    entry.regex.test(path) && entry.methods.has(method) && typeof entry.reason === 'string' && entry.reason.length > 0
  );
}
