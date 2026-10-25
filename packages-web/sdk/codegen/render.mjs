// Client model -> TypeScript sources for `stynx-sdk-codegen` (fetch client, union types, options
// objects, exported schemas). The emitted shapes follow openapi-typescript-codegen 0.31.0 (MIT;
// see ./LICENSE-openapi-typescript-codegen); the caller formats every file with Prettier.
import { readFileSync } from 'node:fs';
import { camelCase } from './parse.mjs';

/**
 * @typedef {import('./parse.mjs').Model} Model
 * @typedef {import('./parse.mjs').Parameter} Parameter
 * @typedef {import('./parse.mjs').Operation} Operation
 * @typedef {import('./parse.mjs').Service} Service
 * @typedef {import('./parse.mjs').ClientModel} ClientModel
 */

export const header =
  '/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */\n/* istanbul ignore file */\n/* tslint:disable */\n/* eslint-disable */';

const coreFiles = [
  'ApiError.ts',
  'ApiRequestOptions.ts',
  'ApiResult.ts',
  'BaseHttpRequest.ts',
  'CancelablePromise.ts',
  'FetchHttpRequest.ts',
  'OpenAPI.ts',
  'request.ts',
];

/** @param {unknown} value @returns {string} */
function renderedText(value) {
  if (typeof value !== 'string') throw new TypeError('Rendered description requires a string');
  return value;
}

/** @template T @param {T} value @param {number} index @param {T[]} array */
const unique = (value, index, array) => array.indexOf(value) === index;
/** @param {{name: string}} left @param {{name: string}} right */
const byLowerName = (left, right) =>
  left.name.toLowerCase().localeCompare(right.name.toLowerCase(), 'en');

/** @param {unknown} value @returns {string} */
const escapeComment = (value) =>
  renderedText(value)
    .replace(/\*\//g, '*')
    .replace(/\/\*/g, '*')
    .replace(
      /\r?\n(.*)/g,
      (/** @type {string} */ _, /** @type {string} */ line) => `\n * ${line.trim()}`,
    );
/** @param {unknown} value @returns {string} */
const escapeDescription = (value) =>
  renderedText(value).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');

/** One line per statement, no blank lines: the reference generator's pre-format pass. */
/** @param {string} text @returns {string} */
const compact = (text) =>
  `${text
    .split(/[\r\n]+/)
    .map((line) => {
      const trimmed = line.trim().replace(/^\*/g, ' *');
      return trimmed.trim() === '' ? '' : trimmed;
    })
    .join('\n')}\n`;

/** @param {Model} item */
function docComment(item) {
  if (!item.description && !item.deprecated) return '';
  return `/**\n${item.description ? ` * ${escapeComment(item.description)}\n` : ''}${
    item.deprecated ? ' * @deprecated\n' : ''
  } */\n`;
}

/** @param {Model} item */
const nullable = (item) => (item.isNullable ? ' | null' : '');
/** @param {Model} item */
const readOnly = (item) => (item.isReadOnly ? 'readonly ' : '');
/** @param {Model} item @param {boolean} [useOptions] */
const optional = (item, useOptions) =>
  useOptions
    ? !item.isRequired || item.default
      ? '?'
      : ''
    : !item.isRequired && !item.default
      ? '?'
      : '';
/** @param {Model} item */
const base = (item) => (item.base === 'binary' ? 'Blob' : item.base);

/** @param {Model} item @returns {string} */
function renderType(item) {
  switch (item.export) {
    case 'interface':
      if (!item.properties.length) return `any${nullable(item)}`;
      return `{\n${item.properties
        .map(
          (property) =>
            `${docComment(property)}${readOnly(property)}${property.name}${optional(property)}: ${renderType(property)};\n`,
        )
        .join('')}}${nullable(item)}`;
    case 'reference':
      return `${item.base}${nullable(item)}`;
    case 'enum':
      return `${item.enum
        .map((enumerator) => enumerator.value)
        .filter(unique)
        .join(' | ')}${nullable(item)}`;
    case 'array':
      return `Array<${item.link ? renderType(item.link) : base(item)}>${nullable(item)}`;
    case 'dictionary':
      return `Record<string, ${item.link ? renderType(item.link) : base(item)}>${nullable(item)}`;
    case 'one-of':
    case 'any-of':
    case 'all-of': {
      const types = item.properties.map(renderType).filter(unique);
      let joined = types.join(item.export === 'all-of' ? ' & ' : ' | ');
      if (types.length > 1) joined = `(${joined})`;
      return `${joined}${nullable(item)}`;
    }
    default:
      return `${base(item)}${nullable(item)}`;
  }
}

/** @param {Model} model @returns {string} */
function renderModel(model) {
  const imports = model.imports.length
    ? `${model.imports.map((name) => `import type { ${name} } from './${name}';\n`).join('')}\n`
    : '';
  let body;
  if (model.export === 'interface') {
    body = `${docComment(model)}export type ${model.name} = {\n${model.properties
      .map(
        (property) =>
          `${docComment(property)}${readOnly(property)}${property.name}${optional(property)}: ${renderType(property)};\n`,
      )
      .join('')}};\n`;
  } else {
    body = `${docComment(model)}export type ${model.name} = ${renderType(model)};\n`;
  }
  return compact(`${header}\n${imports}${body}`);
}

/** @param {Model} item */
function schemaFlags(item) {
  return `${item.isReadOnly ? `isReadOnly: ${item.isReadOnly},\n` : ''}${
    item.isRequired ? `isRequired: ${item.isRequired},\n` : ''
  }${item.isNullable ? `isNullable: ${item.isNullable},\n` : ''}`;
}

/** @param {Model} item */
const descriptionField = (item) =>
  item.description ? `description: \`${escapeDescription(item.description)}\`,\n` : '';

/** @param {Model} item @returns {string} */
function renderSchema(item) {
  switch (item.export) {
    case 'interface':
      return `{\n${descriptionField(item)}properties: {\n${item.properties
        .map((property) => `${property.name}: ${renderSchema(property)},\n`)
        .join('')}},\n${schemaFlags(item)}}`;
    case 'enum':
      return `{\ntype: 'Enum',\n${schemaFlags(item)}}`;
    case 'array':
    case 'dictionary':
      return `{\ntype: '${item.export}',\ncontains: ${
        item.link ? renderSchema(item.link) : `{\ntype: '${item.base}',\n}`
      },\n${schemaFlags(item)}}`;
    case 'one-of':
    case 'any-of':
    case 'all-of':
      return `{\ntype: '${item.export}',\n${descriptionField(item)}contains: [${item.properties
        .map(renderSchema)
        .join(', ')}],\n${schemaFlags(item)}}`;
    default: {
      /** @param {'format' | 'pattern'} key */
      const quoted = (key) => (item[key] ? `${key}: '${item[key]}',\n` : '');
      /** @param {'maximum' | 'exclusiveMaximum' | 'minimum' | 'exclusiveMinimum' | 'multipleOf' | 'maxLength' | 'minLength' | 'maxItems' | 'minItems' | 'uniqueItems' | 'maxProperties' | 'minProperties'} key */
      const plain = (key) => (item[key] ? `${key}: ${item[key]},\n` : '');
      return `{\n${item.type ? `type: '${item.type}',\n` : ''}${descriptionField(item)}${schemaFlags(
        item,
      )}${quoted('format')}${plain('maximum')}${plain('exclusiveMaximum')}${plain('minimum')}${plain(
        'exclusiveMinimum',
      )}${plain('multipleOf')}${plain('maxLength')}${plain('minLength')}${quoted('pattern')}${plain(
        'maxItems',
      )}${plain('minItems')}${plain('uniqueItems')}${plain('maxProperties')}${plain(
        'minProperties',
      )}}`;
    }
  }
}

/** @param {Model} model */
function renderSchemaFile(model) {
  return compact(`${header}\nexport const $${model.name} = ${renderSchema(model)} as const;`);
}

/** @param {Parameter[]} parameters */
function renderParameters(parameters) {
  if (!parameters.length) return '';
  return `{\n${parameters
    .map((parameter) => `${parameter.name}${parameter.default ? ` = ${parameter.default}` : ''},\n`)
    .join('')}}: {\n${parameters
    .map(
      (parameter) =>
        `${docComment(parameter)}${parameter.name}${optional(parameter, true)}: ${renderType(parameter)},\n`,
    )
    .join('')}}`;
}

/** @param {Operation} operation */
function renderOperation(operation) {
  /** @param {string} key @param {Parameter[]} items */
  const group = (key, items) =>
    items.length
      ? `${key}: {\n${items.map((item) => `'${item.prop}': ${item.name},\n`).join('')}},\n`
      : '';
  const body = operation.parametersBody;
  return `/**\n${operation.deprecated ? ' * @deprecated\n' : ''}${
    operation.summary ? ` * ${escapeComment(operation.summary)}\n` : ''
  }${operation.description ? ` * ${escapeComment(operation.description)}\n` : ''}${operation.results
    .map(
      (result) =>
        ` * @returns unknown ${result.description ? escapeComment(result.description) : ''}\n`,
    )
    .join('')} * @throws ApiError\n */\npublic ${operation.name}(${renderParameters(
    operation.parameters,
  )}): CancelablePromise<unknown> {\nreturn this.httpRequest.request({\nmethod: '${operation.method}',\nurl: '${operation.path}',\n${group(
    'path',
    operation.parametersPath,
  )}${group('cookies', operation.parametersCookie)}${group(
    'headers',
    operation.parametersHeader,
  )}${group('query', operation.parametersQuery)}${group('formData', operation.parametersForm)}${
    body
      ? `${body.in === 'formData' ? `formData: ${body.name},\n` : ''}${
          body.in === 'body' ? `body: ${body.name},\n` : ''
        }${body.mediaType ? `mediaType: '${body.mediaType}',\n` : ''}`
      : ''
  }${operation.responseHeader ? `responseHeader: '${operation.responseHeader}',\n` : ''}${
    operation.errors.length
      ? `errors: {\n${operation.errors
          .map((error) => `${error.code}: \`${escapeDescription(error.description)}\`,\n`)
          .join('')}},\n`
      : ''
  }});\n}\n`;
}

/** @param {Service} service */
function renderService(service) {
  const inputImports = new Set(
    service.operations.flatMap((operation) =>
      operation.parameters.flatMap((parameter) => parameter.imports),
    ),
  );
  return compact(
    `${header}\n${service.imports
      .filter((name) => inputImports.has(name))
      .map((name) => `import type { ${name} } from '../models/${name}';\n`)
      .join(
        '',
      )}import type { CancelablePromise } from '../core/CancelablePromise';\nimport type { BaseHttpRequest } from '../core/BaseHttpRequest';\nexport class ${service.name}Service {\nconstructor(public readonly httpRequest: BaseHttpRequest) {}\n${service.operations
      .map(renderOperation)
      .join('')}}`,
  );
}

/** @param {ClientModel} client @param {string} clientName @param {Service[]} services */
function renderClient(client, clientName, services) {
  return compact(
    `${header}\nimport type { BaseHttpRequest } from './core/BaseHttpRequest';\nimport type { OpenAPIConfig } from './core/OpenAPI';\nimport { FetchHttpRequest } from './core/FetchHttpRequest';\n${services
      .map(
        (service) =>
          `import { ${service.name}Service } from './services/${service.name}Service';\n`,
      )
      .join(
        '',
      )}type HttpRequestConstructor = new (config: OpenAPIConfig) => BaseHttpRequest;\nexport class ${clientName} {\n${services
      .map((service) => `public readonly ${camelCase(service.name)}: ${service.name}Service;\n`)
      .join(
        '',
      )}public readonly request: BaseHttpRequest;\nconstructor(config?: Partial<OpenAPIConfig>, HttpRequest: HttpRequestConstructor = FetchHttpRequest) {\nthis.request = new HttpRequest({\nBASE: config?.BASE ?? '${client.server}',\nVERSION: config?.VERSION ?? '${client.version}',\nWITH_CREDENTIALS: config?.WITH_CREDENTIALS ?? false,\nCREDENTIALS: config?.CREDENTIALS ?? 'include',\nTOKEN: config?.TOKEN,\nUSERNAME: config?.USERNAME,\nPASSWORD: config?.PASSWORD,\nHEADERS: config?.HEADERS,\nENCODE_PATH: config?.ENCODE_PATH,\n});\n${services
      .map(
        (service) =>
          `this.${camelCase(service.name)} = new ${service.name}Service(this.request);\n`,
      )
      .join('')}}\n}\n`,
  );
}

/** @param {string} clientName @param {Model[]} models @param {Service[]} services */
function renderIndex(clientName, models, services) {
  return `${header}\nexport { ${clientName} } from './${clientName}';\n\nexport { ApiError } from './core/ApiError';\nexport { BaseHttpRequest } from './core/BaseHttpRequest';\nexport { CancelablePromise, CancelError } from './core/CancelablePromise';\nexport { OpenAPI } from './core/OpenAPI';\nexport type { OpenAPIConfig } from './core/OpenAPI';\n${
    models.length
      ? `\n${models.map((model) => `export type { ${model.name} } from './models/${model.name}';\n`).join('')}`
      : ''
  }${
    models.length
      ? `\n${models.map((model) => `export { $${model.name} } from './schemas/$${model.name}';\n`).join('')}`
      : ''
  }${
    services.length
      ? `\n${services
          .map(
            (service) =>
              `export { ${service.name}Service } from './services/${service.name}Service';\n`,
          )
          .join('')}`
      : ''
  }`;
}

/** @param {string} name @param {ClientModel} client */
function renderCore(name, client) {
  const template = readFileSync(new URL(`./core/${name}.template`, import.meta.url), 'utf8');
  return `${header}\n${template
    .replaceAll('{{server}}', client.server)
    .replaceAll('{{version}}', client.version)}`;
}

/** Every generated file of one client, keyed by its path relative to the output directory. */
/** @param {ClientModel} client @param {string} clientName @returns {Map<string, string>} */
export function renderClientFiles(client, clientName) {
  /** @type {Map<string, string>} */
  const files = new Map();
  const models = [...client.models].sort(byLowerName);
  const services = [...client.services].sort(byLowerName);
  for (const name of coreFiles) files.set(`core/${name}`, renderCore(name, client));
  for (const service of client.services)
    files.set(`services/${service.name}Service.ts`, renderService(service));
  for (const model of client.models) {
    files.set(`schemas/$${model.name}.ts`, renderSchemaFile(model));
    files.set(`models/${model.name}.ts`, renderModel(model));
  }
  files.set(`${clientName}.ts`, renderClient(client, clientName, services));
  files.set('index.ts', renderIndex(clientName, models, services));
  return files;
}
