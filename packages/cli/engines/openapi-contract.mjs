import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** @typedef {{regex: RegExp, methods: Set<unknown>, reason?: unknown}} AllowlistEntry */

/**
 * Structural rules for the committed OpenAPI document. Read-only. Each failure
 * keeps the repository script's text; `path` locates it in the document.
 */
/**
 * @param {{root: string, openapiPath?: string, genericResponseAllowlistPath?: string}} options
 */
export function verifyOpenApiContract({ root, openapiPath, genericResponseAllowlistPath }) {
  const repoRoot = resolve(root);
  const openApiPath = resolve(repoRoot, openapiPath ?? 'docs/framework/contracts/openapi.json');
  const genericResponseAllowlistFile = resolve(
    repoRoot,
    genericResponseAllowlistPath ?? 'docs/framework/contracts/openapi-generic-response-allowlist.json',
  );
  if (!existsSync(openApiPath)) {
    const error = Object.assign(new Error(
      `OpenAPI contract not found at ${openApiPath}. Run pnpm api:docs:write first.`,
    ), { code: 'openapi-missing' });
    throw error;
  }
  const text = readFileSync(openApiPath, 'utf8');
  /** @type {unknown} */
  const contract = JSON.parse(text);
  const genericResponseAllowlist = readGenericResponseAllowlist(genericResponseAllowlistFile);
  const failures = [];
  let operations = 0;

  if (field(contract, 'openapi') !== '3.1.0') {
    failures.push(`openapi must be 3.1.0, got ${field(contract, 'openapi') ?? '(missing)'}`);
  }

  for (const scheme of ['bearerAuth', 'tenantHeader']) {
    if (!optionalField(optionalField(field(contract, 'components'), 'securitySchemes'), scheme)) {
      failures.push(`missing security scheme ${scheme}`);
    }
  }

  for (const schema of ['ProblemDetails', 'UnknownJson']) {
    if (!optionalField(optionalField(field(contract, 'components'), 'schemas'), schema)) {
      failures.push(`missing schema ${schema}`);
    }
  }

  for (const schema of ['JsonValue', 'JsonObject']) {
    if (!optionalField(optionalField(field(contract, 'components'), 'schemas'), schema)) {
      failures.push(`missing schema ${schema}`);
    }
  }

  for (const [path, item] of entries(field(contract, 'paths') ?? {})) {
    const templatedParameters = [...path.matchAll(/\{([^/{}]+)\}/gu)].map((match) => match[1]);
    for (const [method, operation] of entries(item ?? {})) {
      operations += 1;
      const label = `${method.toUpperCase()} ${path}`;
      if (!field(operation, 'operationId')) failures.push(`${label}: missing operationId`);
      const tags = field(operation, 'tags');
      if (!Array.isArray(tags) || field(tags, 'length') === 0) failures.push(`${label}: missing tags`);
      if (!field(operation, 'x-stynx-source')) failures.push(`${label}: missing x-stynx-source`);
      if (!Array.isArray(field(operation, 'security'))) failures.push(`${label}: missing explicit security declaration`);

      const parameters = field(operation, 'parameters') ?? [];
      for (const name of templatedParameters) {
        if (!Array.isArray(parameters)) throw new TypeError('parameters.find is not a function');
        /** @type {unknown} */
        const match = parameters.find((/** @type {unknown} */ parameter) =>
          optionalField(parameter, 'in') === 'path' && field(parameter, 'name') === name && field(parameter, 'required') === true
        );
        if (!match) failures.push(`${label}: missing required path parameter ${name}`);
      }

      if (['post', 'put', 'patch'].includes(method)) {
        if (!field(operation, 'requestBody') && field(operation, 'x-stynx-no-request-body') !== true) {
          failures.push(`${label}: missing requestBody or x-stynx-no-request-body`);
        }
      }

      const mediaType = optionalField(optionalField(field(operation, 'requestBody'), 'content'), 'application/json');
      const sourceType = optionalField(mediaType, 'x-stynx-source-type');
      if (optionalField(optionalField(mediaType, 'schema'), 'x-stynx-unresolved-source-type')) {
        failures.push(`${label}: unresolved request body type ${field(field(mediaType, 'schema'), 'x-stynx-unresolved-source-type')}`);
      }
      if (
        sourceType
        && !isUnknownBodyType(sourceType)
        && optionalField(optionalField(mediaType, 'schema'), '$ref') === '#/components/schemas/UnknownJson'
      ) {
        failures.push(`${label}: typed request body ${sourceType} fell back to UnknownJson`);
      }
      if (optionalField(optionalField(mediaType, 'schema'), '$ref') === '#/components/schemas/UnknownJson') {
        failures.push(`${label}: request body must use a concrete schema`);
      }
      const requestSchemaName = schemaNameFromRef(optionalField(optionalField(mediaType, 'schema'), '$ref'));
      if (sourceType && !isUnknownBodyType(sourceType) && requestSchemaName) {
        const requestSchema = optionalField(optionalField(field(contract, 'components'), 'schemas'), requestSchemaName);
        if (!requestSchema) failures.push(`${label}: missing request body schema ${requestSchemaName}`);
        else if (!field(requestSchema, 'x-stynx-source')) {
          failures.push(`${label}: request body schema ${requestSchemaName} missing x-stynx-source`);
        }
      }

      for (const response of ['200', '400', '401', '403', '404', 'default']) {
        if (!optionalField(field(operation, 'responses'), response)) {
          failures.push(`${label}: missing ${response} response`);
        }
      }
      if (optionalField(optionalField(optionalField(optionalField(optionalField(field(operation, 'responses'), '200'), 'content'), 'application/json'), 'schema'), '$ref') === '#/components/schemas/UnknownJson') {
        failures.push(`${label}: 200 response must not use UnknownJson`);
      }
      const successSchemaRef = optionalField(optionalField(optionalField(optionalField(optionalField(field(operation, 'responses'), '200'), 'content'), 'application/json'), 'schema'), '$ref');
      if (isGenericResponseRef(successSchemaRef) && !isAllowedGenericResponse(path, method, genericResponseAllowlist)) {
        failures.push(`${label}: generic 200 response ${successSchemaRef} is not allowlisted`);
      }
      if (!optionalField(optionalField(optionalField(optionalField(optionalField(field(operation, 'responses'), '200'), 'content'), 'application/json'), 'examples'), 'default')) {
        failures.push(`${label}: missing default 200 response example`);
      }
    }
  }
  return {
    openApiPath,
    paths: Object.keys(object(field(contract, 'paths') ?? {})).length,
    operations,
    failures,
    lineOf: (/** @type {string | undefined} */ path) => jsonKeyLine(text, path),
  };
}

/**
 * @param {string} text
 * @param {string | undefined} key
 */
function jsonKeyLine(text, key) {
  if (!key) return 1;
  const index = text.indexOf(`${JSON.stringify(key)}:`);
  return index < 0 ? 1 : text.slice(0, index).split('\n').length;
}

/**
 * @param {unknown} typeName
 */
function isUnknownBodyType(typeName) {
  const pattern = /^(?:unknown|any|Record\s*<\s*string\s*,\s*unknown\s*>|Record\s*<\s*string\s*,\s*any\s*>)$/u;
  /** @type {unknown} */
  const result = Reflect.apply(pattern.test, pattern, [typeName]);
  if (typeof result !== 'boolean') throw new TypeError('Invalid native regular-expression result');
  return result;
}

/**
 * @param {unknown} ref
 */
function schemaNameFromRef(ref) {
  return typeof ref === 'string' ? ref.match(/^#\/components\/schemas\/(.+)$/u)?.[1] : null;
}

/**
 * @param {string} file
 */
function readGenericResponseAllowlist(file) {
  if (!existsSync(file)) return [];
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const allow = field(parsed, 'allow') ?? [];
  if (!Array.isArray(allow)) throw new TypeError('(parsed.allow ?? []).map is not a function');
  return allow.map((/** @type {unknown} */ entry) => ({
    ...(entry == null ? {} : object(entry)),
    regex: nativePattern(field(entry, 'pathPattern')),
    methods: nativeMethods(field(entry, 'methods') ?? []),
  }));
}

/**
 * @param {unknown} ref
 */
function isGenericResponseRef(ref) {
  return typeof ref === 'string' && [
    '#/components/schemas/JsonValue',
    '#/components/schemas/JsonObject',
    '#/components/schemas/FlowJsonObject',
  ].includes(ref);
}

/**
 * @param {string} path
 * @param {string} method
 * @param {{regex: RegExp, methods: Set<unknown>}[]} allowlist
 */
function isAllowedGenericResponse(path, method, allowlist) {
  return allowlist.some((entry) =>
    entry.regex.test(path) && entry.methods.has(method) && typeof field(entry, 'reason') === 'string' && nonemptyReason(entry)
  );
}

// These values are fresh native JSON; retain ordinary property access/boxing and no full-document admission.
/** @param {unknown} value @returns {object} */
function object(value) {
  if (value == null) throw new TypeError('Cannot convert undefined or null to object');
  /** @type {unknown} */
  const boxed = Object(value);
  if ((typeof boxed !== 'object' || boxed === null) && typeof boxed !== 'function') throw new TypeError('Invalid native Object result');
  return boxed;
}
/** @param {unknown} value @param {string} name @returns {unknown} */
function field(value, name) {
  if (value == null) throw new TypeError(`Cannot read properties of ${value} (reading '${name}')`);
  return Reflect.get(object(value), name, value);
}
/** @param {unknown} value @param {string} name @returns {unknown} */
function optionalField(value, name) { return value == null ? undefined : field(value, name); }
/** @param {unknown} value @returns {[string, unknown][]} */
function entries(value) { return Object.entries(object(value)); }
/** @param {unknown} pattern @returns {RegExp} */
function nativePattern(pattern) {
  /** @type {unknown} */
  const result = Reflect.construct(RegExp, [pattern, 'u']);
  if (!(result instanceof RegExp)) throw new TypeError('Invalid native regular-expression instance');
  return result;
}
/** @param {unknown} values @returns {Set<unknown>} */
function nativeMethods(values) {
  /** @type {unknown} */
  const result = Reflect.construct(Set, [values]);
  if (!(result instanceof Set)) throw new TypeError('Invalid native Set instance');
  return result;
}
/** @param {object} entry */
function nonemptyReason(entry) {
  // The private allowlist copy contains only native JSON data properties and constructed fields.
  const reason = field(entry, 'reason');
  return typeof reason === 'string' && reason.length > 0;
}
