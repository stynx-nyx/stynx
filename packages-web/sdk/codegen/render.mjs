// Client model -> TypeScript sources for `stynx-sdk-codegen` (fetch client, union types, options
// objects, exported schemas). The emitted shapes follow openapi-typescript-codegen 0.31.0 (MIT;
// see ./LICENSE-openapi-typescript-codegen); the caller formats every file with Prettier.
import { readFileSync } from 'node:fs';
import { camelCase } from './parse.mjs';

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

const unique = (value, index, array) => array.indexOf(value) === index;
const byLowerName = (left, right) =>
  left.name.toLowerCase().localeCompare(right.name.toLowerCase(), 'en');

const escapeComment = (value) =>
  value
    .replace(/\*\//g, '*')
    .replace(/\/\*/g, '*')
    .replace(/\r?\n(.*)/g, (_, line) => `\n * ${line.trim()}`);
const escapeDescription = (value) =>
  value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');

/** One line per statement, no blank lines: the reference generator's pre-format pass. */
const compact = (text) =>
  `${text
    .split(/[\r\n]+/)
    .map((line) => {
      const trimmed = line.trim().replace(/^\*/g, ' *');
      return trimmed.trim() === '' ? '' : trimmed;
    })
    .join('\n')}\n`;

function docComment(item) {
  if (!item.description && !item.deprecated) return '';
  return `/**\n${item.description ? ` * ${escapeComment(item.description)}\n` : ''}${
    item.deprecated ? ' * @deprecated\n' : ''
  } */\n`;
}

const nullable = (item) => (item.isNullable ? ' | null' : '');
const readOnly = (item) => (item.isReadOnly ? 'readonly ' : '');
const optional = (item, useOptions) =>
  useOptions
    ? !item.isRequired || item.default
      ? '?'
      : ''
    : !item.isRequired && !item.default
      ? '?'
      : '';
const base = (item) => (item.base === 'binary' ? 'Blob' : item.base);

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

function schemaFlags(item) {
  return `${item.isReadOnly ? `isReadOnly: ${item.isReadOnly},\n` : ''}${
    item.isRequired ? `isRequired: ${item.isRequired},\n` : ''
  }${item.isNullable ? `isNullable: ${item.isNullable},\n` : ''}`;
}

const descriptionField = (item) =>
  item.description ? `description: \`${escapeDescription(item.description)}\`,\n` : '';

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
      const quoted = (key) => (item[key] ? `${key}: '${item[key]}',\n` : '');
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

function renderSchemaFile(model) {
  return compact(`${header}\nexport const $${model.name} = ${renderSchema(model)} as const;`);
}

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

function renderOperation(operation) {
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
        ` * @returns ${result.type} ${result.description ? escapeComment(result.description) : ''}\n`,
    )
    .join('')} * @throws ApiError\n */\npublic ${operation.name}(${renderParameters(
    operation.parameters,
  )}): CancelablePromise<${
    operation.results.length ? operation.results.map(renderType).join(' | ') : 'void'
  }> {\nreturn this.httpRequest.request({\nmethod: '${operation.method}',\nurl: '${operation.path}',\n${group(
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

function renderService(service) {
  return compact(
    `${header}\n${service.imports
      .map((name) => `import type { ${name} } from '../models/${name}';\n`)
      .join(
        '',
      )}import type { CancelablePromise } from '../core/CancelablePromise';\nimport type { BaseHttpRequest } from '../core/BaseHttpRequest';\nexport class ${service.name}Service {\nconstructor(public readonly httpRequest: BaseHttpRequest) {}\n${service.operations
      .map(renderOperation)
      .join('')}}`,
  );
}

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

function renderCore(name, client) {
  const template = readFileSync(new URL(`./core/${name}.template`, import.meta.url), 'utf8');
  return `${header}\n${template
    .replaceAll('{{server}}', client.server)
    .replaceAll('{{version}}', client.version)}`;
}

/** Every generated file of one client, keyed by its path relative to the output directory. */
export function renderClientFiles(client, clientName) {
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
