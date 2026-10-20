// OpenAPI 3.x -> client model for `stynx-sdk-codegen`.
//
// The model, its naming rules and the emitted shapes follow openapi-typescript-codegen 0.31.0
// (MIT, Ferdi Koomen; see ./LICENSE-openapi-typescript-codegen) so the regenerated SDK keeps the
// published `@stynx-nyx/sdk` surface: the `GeneratedStynxSdk` client, one `*Service` class per
// tag, `CancelablePromise`, `ApiError`, `OpenAPI`, and `$Model` schema constants. Only the
// options STYNX used are kept: fetch client, union types, options objects, exported schemas.

const reservedWords =
  /^(arguments|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|eval|export|extends|false|finally|for|function|if|implements|import|in|instanceof|interface|let|new|null|package|private|protected|public|return|static|super|switch|this|throw|true|try|typeof|var|void|while|with|yield)$/g;

const unique = (value, index, array) => array.indexOf(value) === index;
const isDefined = (value) => value !== undefined && value !== null && value !== '';
const isString = (value) => typeof value === 'string';
const escapePattern = (value) => value?.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// camelcase 6.3.0 (MIT, Sindre Sorhus), the variant the reference generator used for names.
const UPPERCASE = /[\p{Lu}]/u;
const LOWERCASE = /[\p{Ll}]/u;
const SEPARATORS_AND_IDENTIFIER = /[_.\- ]+([\p{Alpha}\p{N}_]|$)/gu;
const NUMBERS_AND_IDENTIFIER = /\d+([\p{Alpha}\p{N}_]|$)/gu;

export function camelCase(input, { pascalCase = false } = {}) {
  let value = input.trim();
  if (value.length === 0) return '';
  const lower = (text) => text.toLocaleLowerCase();
  const upper = (text) => text.toLocaleUpperCase();
  if (value.length === 1) return pascalCase ? upper(value) : lower(value);
  if (value !== lower(value)) {
    let isLastCharLower = false;
    let isLastCharUpper = false;
    let isLastLastCharUpper = false;
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (isLastCharLower && UPPERCASE.test(character)) {
        value = `${value.slice(0, index)}-${value.slice(index)}`;
        isLastCharLower = false;
        isLastLastCharUpper = isLastCharUpper;
        isLastCharUpper = true;
        index += 1;
      } else if (isLastCharUpper && isLastLastCharUpper && LOWERCASE.test(character)) {
        value = `${value.slice(0, index - 1)}-${value.slice(index - 1)}`;
        isLastLastCharUpper = isLastCharUpper;
        isLastCharUpper = false;
        isLastCharLower = true;
      } else {
        isLastCharLower = lower(character) === character && upper(character) !== character;
        isLastLastCharUpper = isLastCharUpper;
        isLastCharUpper = upper(character) === character && lower(character) !== character;
      }
    }
  }
  value = lower(value.replace(/^[_.\- ]+/, ''));
  if (pascalCase) value = upper(value.charAt(0)) + value.slice(1);
  SEPARATORS_AND_IDENTIFIER.lastIndex = 0;
  NUMBERS_AND_IDENTIFIER.lastIndex = 0;
  return value
    .replace(SEPARATORS_AND_IDENTIFIER, (_, identifier) => upper(identifier))
    .replace(NUMBERS_AND_IDENTIFIER, (match) => upper(match));
}

const typeMappings = new Map([
  ['file', 'binary'],
  ['any', 'any'],
  ['object', 'any'],
  ['array', 'any[]'],
  ['boolean', 'boolean'],
  ['byte', 'number'],
  ['int', 'number'],
  ['integer', 'number'],
  ['float', 'number'],
  ['double', 'number'],
  ['short', 'number'],
  ['long', 'number'],
  ['number', 'number'],
  ['char', 'string'],
  ['date', 'string'],
  ['date-time', 'string'],
  ['password', 'string'],
  ['string', 'string'],
  ['void', 'void'],
  ['null', 'null'],
]);

const mappedType = (type, format) => (format === 'binary' ? 'binary' : typeMappings.get(type));
const encode = (value) => value.replace(/^[^a-zA-Z_$]+/g, '').replace(/[^\w$]+/g, '_');

const stripNamespace = (value) =>
  value
    .trim()
    .replace(/^#\/components\/schemas\//, '')
    .replace(/^#\/components\/responses\//, '')
    .replace(/^#\/components\/parameters\//, '')
    .replace(/^#\/components\/examples\//, '')
    .replace(/^#\/components\/requestBodies\//, '')
    .replace(/^#\/components\/headers\//, '')
    .replace(/^#\/components\/securitySchemes\//, '')
    .replace(/^#\/components\/links\//, '')
    .replace(/^#\/components\/callbacks\//, '');

function getType(type = 'any', format) {
  const result = { type: 'any', base: 'any', template: null, imports: [], isNullable: false };
  if (Array.isArray(type)) {
    const joined = type
      .filter((item) => item !== 'null')
      .map((item) => mappedType(item, format))
      .filter(isDefined)
      .join(' | ');
    result.type = joined;
    result.base = joined;
    result.isNullable = type.includes('null');
    return result;
  }
  const mapped = mappedType(type, format);
  if (mapped) {
    result.type = mapped;
    result.base = mapped;
    return result;
  }
  const typeWithoutNamespace = decodeURIComponent(stripNamespace(type));
  if (/\[.*\]$/g.test(typeWithoutNamespace)) {
    const matches = typeWithoutNamespace.match(/(.*?)\[(.*)\]$/);
    if (matches?.length) {
      const match1 = getType(encode(matches[1]));
      const match2 = getType(encode(matches[2]));
      if (match1.type === 'any[]') {
        result.type = `${match2.type}[]`;
        result.base = `${match2.type}`;
        match1.imports = [];
      } else if (match2.type) {
        result.type = `${match1.type}<${match2.type}>`;
        result.base = match1.type;
        result.template = match2.type;
      } else {
        result.type = match1.type;
        result.base = match1.type;
        result.template = match1.type;
      }
      result.imports.push(...match1.imports, ...match2.imports);
      return result;
    }
  }
  if (typeWithoutNamespace) {
    const encoded = encode(typeWithoutNamespace);
    result.type = encoded;
    result.base = encoded;
    result.imports.push(encoded);
  }
  return result;
}

function getRef(openApi, item) {
  if (!item.$ref) return item;
  let result = openApi;
  for (const segment of item.$ref.replace(/^#/g, '').split('/').filter(Boolean)) {
    const key = decodeURIComponent(segment.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (!Object.prototype.hasOwnProperty.call(result, key))
      throw new Error(`Could not find reference: "${item.$ref}"`);
    result = result[key];
  }
  return result;
}

function constraints(definition) {
  return {
    format: definition.format,
    maximum: definition.maximum,
    exclusiveMaximum: definition.exclusiveMaximum,
    minimum: definition.minimum,
    exclusiveMinimum: definition.exclusiveMinimum,
    multipleOf: definition.multipleOf,
    maxLength: definition.maxLength,
    minLength: definition.minLength,
    maxItems: definition.maxItems,
    minItems: definition.minItems,
    uniqueItems: definition.uniqueItems,
    maxProperties: definition.maxProperties,
    minProperties: definition.minProperties,
    pattern: escapePattern(definition.pattern),
  };
}

function getModelDefault(definition, model) {
  if (definition.default === undefined) return undefined;
  if (definition.default === null) return 'null';
  switch (definition.type || typeof definition.default) {
    case 'int':
    case 'integer':
    case 'number':
      if (model?.export === 'enum' && model.enum?.[definition.default])
        return model.enum[definition.default].value;
      return definition.default;
    case 'boolean':
      return JSON.stringify(definition.default);
    case 'string':
      return `'${definition.default}'`;
    case 'object':
      try {
        return JSON.stringify(definition.default, null, 4);
      } catch {
        return undefined;
      }
  }
  return undefined;
}

function getEnum(values) {
  if (!Array.isArray(values)) return [];
  return values
    .filter(unique)
    .filter((value) => typeof value === 'number' || typeof value === 'string')
    .map((value) =>
      typeof value === 'number'
        ? { name: `'_${value}'`, value: String(value), type: 'number', description: null }
        : {
            name: String(value)
              .replace(/\W+/g, '_')
              .replace(/^(\d+)/g, '_$1')
              .replace(/([a-z])([A-Z]+)/g, '$1_$2')
              .toUpperCase(),
            value: `'${value.replace(/'/g, "\\'")}'`,
            type: 'string',
            description: null,
          },
    );
}

function extendEnum(enumerators, definition) {
  const names = definition['x-enum-varnames']?.filter(isString);
  const descriptions = definition['x-enum-descriptions']?.filter(isString);
  return enumerators.map((enumerator, index) => ({
    name: names?.[index] || enumerator.name,
    description: descriptions?.[index] || enumerator.description,
    value: enumerator.value,
    type: enumerator.type,
  }));
}

const escapeName = (value) => {
  if (value || value === '') {
    if (!/^[a-zA-Z_$][\w$]+$/g.test(value)) return `'${value}'`;
  }
  return value;
};

function findDiscriminator(openApi, parent) {
  if (!openApi.components || !parent) return undefined;
  for (const definition of Object.values(openApi.components.schemas ?? {})) {
    if (
      definition.discriminator &&
      definition.oneOf?.length &&
      definition.oneOf.some((item) => item.$ref && stripNamespace(item.$ref) == parent.name)
    )
      return definition.discriminator;
  }
  return undefined;
}

function discriminatorValue(discriminator, parent) {
  if (discriminator.mapping) {
    const inverted = {};
    for (const key in discriminator.mapping) inverted[discriminator.mapping[key]] = key;
    const ref = Object.keys(inverted).find((item) => stripNamespace(item) == parent.name);
    if (ref && inverted[ref]) return inverted[ref];
  }
  return parent.name;
}

function emptyModel(extra) {
  return { imports: [], enum: [], enums: [], properties: [], ...extra };
}

function getModelProperties(openApi, definition, getModelFn, parent) {
  const models = [];
  const discriminator = findDiscriminator(openApi, parent);
  for (const propertyName in definition.properties) {
    if (!Object.prototype.hasOwnProperty.call(definition.properties, propertyName)) continue;
    const property = definition.properties[propertyName];
    const common = {
      name: escapeName(propertyName),
      description: property.description || null,
      deprecated: property.deprecated === true,
      isDefinition: false,
      isReadOnly: property.readOnly === true,
      isRequired: !!definition.required?.includes(propertyName),
      ...constraints(property),
    };
    if (parent && discriminator?.propertyName == propertyName) {
      models.push({
        export: 'reference',
        type: 'string',
        base: `'${discriminatorValue(discriminator, parent)}'`,
        template: null,
        isNullable: property.nullable === true,
        link: null,
        ...emptyModel(),
        ...common,
      });
    } else if (property.$ref) {
      const model = getType(property.$ref);
      models.push({
        export: 'reference',
        type: model.type,
        base: model.base,
        template: model.template,
        link: null,
        isNullable: model.isNullable || property.nullable === true,
        imports: model.imports,
        enum: [],
        enums: [],
        properties: [],
        ...common,
      });
    } else {
      const model = getModelFn(openApi, property);
      models.push({
        export: model.export,
        type: model.type,
        base: model.base,
        template: model.template,
        link: model.link,
        isNullable: model.isNullable || property.nullable === true,
        imports: model.imports,
        enum: model.enum,
        enums: model.enums,
        properties: model.properties,
        ...common,
      });
    }
  }
  return models;
}

function getModelComposition(openApi, definition, definitions, type, getModelFn) {
  const composition = { type, imports: [], enums: [], properties: [] };
  const properties = [];
  definitions
    .map((item) => getModelFn(openApi, item))
    .filter((model) => {
      const hasProperties = model.properties.length;
      const hasEnums = model.enums.length;
      const isObject = model.type === 'any';
      const isDictionary = model.export === 'dictionary';
      return !(isObject && !hasProperties && !hasEnums) || isDictionary;
    })
    .forEach((model) => {
      composition.imports.push(...model.imports);
      composition.enums.push(...model.enums);
      composition.properties.push(model);
    });
  if (definition.required) {
    const required = definitions
      .reduce((all, item) => {
        const resolved = item.$ref ? getRef(openApi, item) : item;
        return [...all, ...getModelFn(openApi, resolved).properties];
      }, [])
      .filter((property) => !property.isRequired && definition.required.includes(property.name))
      .map((property) => ({ ...property, isRequired: true }));
    required.forEach((property) => {
      composition.imports.push(...property.imports);
      composition.enums.push(...property.enums);
    });
    properties.push(...required);
  }
  if (definition.properties) {
    const modelProperties = getModelProperties(openApi, definition, getModelFn);
    modelProperties.forEach((property) => {
      composition.imports.push(...property.imports);
      composition.enums.push(...property.enums);
      if (property.export === 'enum') composition.enums.push(property);
    });
    properties.push(...modelProperties);
  }
  if (properties.length) {
    composition.properties.push({
      name: 'properties',
      export: 'interface',
      type: 'any',
      base: 'any',
      template: null,
      link: null,
      description: '',
      isDefinition: false,
      isReadOnly: false,
      isNullable: false,
      isRequired: false,
      imports: [],
      enum: [],
      enums: [],
      properties,
    });
  }
  return composition;
}

export function getModel(openApi, definition, isDefinition = false, name = '') {
  const model = {
    name,
    export: 'interface',
    type: 'any',
    base: 'any',
    template: null,
    link: null,
    description: definition.description || null,
    deprecated: definition.deprecated === true,
    isDefinition,
    isReadOnly: definition.readOnly === true,
    isNullable: definition.nullable === true,
    isRequired: false,
    ...constraints(definition),
    imports: [],
    enum: [],
    enums: [],
    properties: [],
  };
  const fromType = (exportKind, source, link) => {
    model.export = exportKind;
    model.type = source.type;
    model.base = source.base;
    model.template = source.template;
    if (link) model.link = link;
    model.imports.push(...source.imports);
    model.default = getModelDefault(definition, model);
    return model;
  };
  if (definition.$ref) {
    const reference = getType(definition.$ref);
    return fromType('reference', reference);
  }
  if (definition.enum && definition.type !== 'boolean') {
    const enumerators = extendEnum(getEnum(definition.enum), definition);
    if (enumerators.length) {
      model.export = 'enum';
      model.type = 'string';
      model.base = 'string';
      model.enum.push(...enumerators);
      model.default = getModelDefault(definition, model);
      return model;
    }
  }
  if (definition.type === 'array' && definition.items) {
    if (definition.items.$ref) return fromType('array', getType(definition.items.$ref));
    const item = getModel(openApi, definition.items);
    return fromType('array', item, item);
  }
  if (
    definition.type === 'object' &&
    (typeof definition.additionalProperties === 'object' ||
      definition.additionalProperties === true)
  ) {
    const additional =
      typeof definition.additionalProperties === 'object' ? definition.additionalProperties : {};
    if (additional.$ref) return fromType('dictionary', getType(additional.$ref));
    const item = getModel(openApi, additional);
    return fromType('dictionary', item, item);
  }
  for (const [keyword, kind] of [
    ['oneOf', 'one-of'],
    ['anyOf', 'any-of'],
    ['allOf', 'all-of'],
  ]) {
    if (definition[keyword]?.length) {
      const composition = getModelComposition(
        openApi,
        definition,
        definition[keyword],
        kind,
        getModel,
      );
      model.export = composition.type;
      model.imports.push(...composition.imports);
      model.properties.push(...composition.properties);
      model.enums.push(...composition.enums);
      return model;
    }
  }
  if (definition.type === 'object') {
    if (definition.properties) {
      model.export = 'interface';
      model.type = 'any';
      model.base = 'any';
      model.default = getModelDefault(definition, model);
      getModelProperties(openApi, definition, getModel, model).forEach((property) => {
        model.imports.push(...property.imports);
        model.enums.push(...property.enums);
        model.properties.push(property);
        if (property.export === 'enum') model.enums.push(property);
      });
      return model;
    }
    const item = getModel(openApi, {});
    return fromType('dictionary', item, item);
  }
  if (definition.type) {
    const generic = getType(definition.type, definition.format);
    model.export = 'generic';
    model.type = generic.type;
    model.base = generic.base;
    model.template = generic.template;
    model.isNullable = generic.isNullable || model.isNullable;
    model.imports.push(...generic.imports);
    model.default = getModelDefault(definition, model);
    return model;
  }
  return model;
}

const parameterName = (value) =>
  camelCase(
    value
      .replace(/^[^a-zA-Z]+/g, '')
      .replace('[]', 'Array')
      .replace(/[^\w-]+/g, '-')
      .trim(),
  ).replace(reservedWords, '_$1');

function copySchema(target, model) {
  target.export = model.export;
  target.type = model.type;
  target.base = model.base;
  target.template = model.template;
  target.link = model.link;
  target.isReadOnly = model.isReadOnly;
  Object.assign(target, constraints({ ...model, pattern: undefined }));
  target.pattern = escapePattern(model.pattern);
  target.imports.push(...model.imports);
  target.enum.push(...model.enum);
  target.enums.push(...model.enums);
  target.properties.push(...model.properties);
}

function getOperationParameter(openApi, parameter) {
  const operationParameter = {
    in: parameter.in,
    prop: parameter.name,
    export: 'interface',
    name: parameterName(parameter.name),
    type: 'any',
    base: 'any',
    template: null,
    link: null,
    description: parameter.description || null,
    deprecated: parameter.deprecated === true,
    isDefinition: false,
    isReadOnly: false,
    isRequired: parameter.required === true,
    isNullable: parameter.nullable === true,
    imports: [],
    enum: [],
    enums: [],
    properties: [],
    mediaType: null,
  };
  const fromReference = (ref, schema) => {
    const reference = getType(ref);
    operationParameter.export = 'reference';
    operationParameter.type = reference.type;
    operationParameter.base = reference.base;
    operationParameter.template = reference.template;
    operationParameter.imports.push(...reference.imports);
    if (schema) operationParameter.default = getModelDefault(schema);
    return operationParameter;
  };
  if (parameter.$ref) return fromReference(parameter.$ref);
  let schema = parameter.schema;
  if (schema) {
    if (schema.$ref?.startsWith('#/components/parameters/')) schema = getRef(openApi, schema);
    if (schema.$ref) return fromReference(schema.$ref, schema);
    const model = getModel(openApi, schema);
    copySchema(operationParameter, model);
    operationParameter.isRequired = operationParameter.isRequired || model.isRequired;
    operationParameter.isNullable = operationParameter.isNullable || model.isNullable;
    operationParameter.default = model.default;
  }
  return operationParameter;
}

function getOperationParameters(openApi, parameters) {
  const result = {
    imports: [],
    parameters: [],
    parametersPath: [],
    parametersQuery: [],
    parametersForm: [],
    parametersCookie: [],
    parametersHeader: [],
    parametersBody: null,
  };
  const groups = {
    path: 'parametersPath',
    query: 'parametersQuery',
    formData: 'parametersForm',
    cookie: 'parametersCookie',
    header: 'parametersHeader',
  };
  for (const item of parameters) {
    const definition = getRef(openApi, item);
    const parameter = getOperationParameter(openApi, definition);
    if (parameter.prop === 'api-version') continue;
    const group = groups[definition.in];
    if (!group) continue;
    result[group].push(parameter);
    result.parameters.push(parameter);
    result.imports.push(...parameter.imports);
  }
  return result;
}

const supportedMediaTypes = [
  'application/json-patch+json',
  'application/json',
  'application/x-www-form-urlencoded',
  'text/json',
  'text/plain',
  'multipart/form-data',
  'multipart/mixed',
  'multipart/related',
  'multipart/batch',
];

function getContent(content) {
  const preferred = Object.keys(content)
    .filter((mediaType) => supportedMediaTypes.includes(mediaType.split(';')[0].trim()))
    .find((mediaType) => isDefined(content[mediaType]?.schema));
  if (preferred) return { mediaType: preferred, schema: content[preferred].schema };
  const first = Object.keys(content).find((mediaType) => isDefined(content[mediaType]?.schema));
  return first ? { mediaType: first, schema: content[first].schema } : null;
}

function getRequestBody(openApi, body) {
  const requestBody = {
    in: 'body',
    export: 'interface',
    prop: 'requestBody',
    name: 'requestBody',
    type: 'any',
    base: 'any',
    template: null,
    link: null,
    description: body.description || null,
    default: undefined,
    isDefinition: false,
    isReadOnly: false,
    isRequired: body.required === true,
    isNullable: body.nullable === true,
    imports: [],
    enum: [],
    enums: [],
    properties: [],
    mediaType: null,
  };
  if (!body.content) return requestBody;
  const content = getContent(body.content);
  if (!content) return requestBody;
  requestBody.mediaType = content.mediaType;
  if (['application/x-www-form-urlencoded', 'multipart/form-data'].includes(content.mediaType)) {
    requestBody.in = 'formData';
    requestBody.name = 'formData';
    requestBody.prop = 'formData';
  }
  if (content.schema.$ref) {
    const reference = getType(content.schema.$ref);
    requestBody.export = 'reference';
    requestBody.type = reference.type;
    requestBody.base = reference.base;
    requestBody.template = reference.template;
    requestBody.imports.push(...reference.imports);
    return requestBody;
  }
  const model = getModel(openApi, content.schema);
  copySchema(requestBody, model);
  requestBody.isRequired = requestBody.isRequired || model.isRequired;
  requestBody.isNullable = requestBody.isNullable || model.isNullable;
  return requestBody;
}

function getOperationResponse(openApi, response, code) {
  const operationResponse = {
    in: 'response',
    name: '',
    code,
    description: response.description || null,
    export: 'generic',
    type: 'any',
    base: 'any',
    template: null,
    link: null,
    isDefinition: false,
    isReadOnly: false,
    isRequired: false,
    isNullable: false,
    imports: [],
    enum: [],
    enums: [],
    properties: [],
  };
  if (response.content) {
    const content = getContent(response.content);
    if (content) {
      if (content.schema.$ref?.startsWith('#/components/responses/'))
        content.schema = getRef(openApi, content.schema);
      if (content.schema.$ref) {
        const reference = getType(content.schema.$ref);
        operationResponse.export = 'reference';
        operationResponse.type = reference.type;
        operationResponse.base = reference.base;
        operationResponse.template = reference.template;
        operationResponse.imports.push(...reference.imports);
        return operationResponse;
      }
      const model = getModel(openApi, content.schema);
      copySchema(operationResponse, model);
      operationResponse.isRequired = model.isRequired;
      operationResponse.isNullable = model.isNullable;
      return operationResponse;
    }
  }
  if (response.headers) {
    for (const name in response.headers) {
      operationResponse.in = 'header';
      operationResponse.name = name;
      operationResponse.type = 'string';
      operationResponse.base = 'string';
      return operationResponse;
    }
  }
  return operationResponse;
}

function responseCode(value) {
  if (value === 'default') return 200;
  if (/[0-9]+/g.test(value)) {
    const code = parseInt(value);
    if (Number.isInteger(code)) return Math.abs(code);
  }
  return null;
}

const sameType = (left, right) => {
  const equal =
    left.type === right.type && left.base === right.base && left.template === right.template;
  return equal && left.link && right.link ? sameType(left.link, right.link) : equal;
};

const requiredFirst = (left, right) => {
  const a = left.isRequired && left.default === undefined;
  const b = right.isRequired && right.default === undefined;
  if (a && !b) return -1;
  if (b && !a) return 1;
  return 0;
};

function getOperation(openApi, url, method, tag, op, pathParams) {
  const serviceName = camelCase(
    tag
      .replace(/^[^a-zA-Z]+/g, '')
      .replace(/[^\w-]+/g, '-')
      .trim(),
    { pascalCase: true },
  );
  const operationName = op.operationId
    ? camelCase(
        op.operationId
          .replace(/^[^a-zA-Z]+/g, '')
          .replace(/[^\w-]+/g, '-')
          .trim(),
      )
    : camelCase(
        `${method}-${url
          .replace(/[^/]*?{api-version}.*?\//g, '')
          .replace(/{(.*?)}/g, '')
          .replace(/\//g, '-')}`,
      );
  const operation = {
    service: serviceName,
    name: operationName,
    summary: op.summary || null,
    description: op.description || null,
    deprecated: op.deprecated === true,
    method: method.toUpperCase(),
    path: url,
    parameters: [...pathParams.parameters],
    parametersPath: [...pathParams.parametersPath],
    parametersQuery: [...pathParams.parametersQuery],
    parametersForm: [...pathParams.parametersForm],
    parametersHeader: [...pathParams.parametersHeader],
    parametersCookie: [...pathParams.parametersCookie],
    parametersBody: pathParams.parametersBody,
    imports: [],
    errors: [],
    results: [],
    responseHeader: null,
  };
  if (op.parameters) {
    const parameters = getOperationParameters(openApi, op.parameters);
    operation.imports.push(...parameters.imports);
    operation.parameters.push(...parameters.parameters);
    operation.parametersPath.push(...parameters.parametersPath);
    operation.parametersQuery.push(...parameters.parametersQuery);
    operation.parametersForm.push(...parameters.parametersForm);
    operation.parametersHeader.push(...parameters.parametersHeader);
    operation.parametersCookie.push(...parameters.parametersCookie);
    operation.parametersBody = parameters.parametersBody;
  }
  if (op.requestBody) {
    const requestBody = getRequestBody(openApi, getRef(openApi, op.requestBody));
    operation.imports.push(...requestBody.imports);
    operation.parameters.push(requestBody);
    operation.parametersBody = requestBody;
  }
  if (op.responses) {
    const responses = [];
    for (const code in op.responses) {
      const value = responseCode(code);
      if (value)
        responses.push(getOperationResponse(openApi, getRef(openApi, op.responses[code]), value));
    }
    responses.sort((left, right) => (left.code < right.code ? -1 : left.code > right.code ? 1 : 0));
    const results = responses.filter(
      (response) =>
        response.code && response.code !== 204 && response.code >= 200 && response.code < 300,
    );
    if (!results.length) {
      results.push({
        in: 'response',
        name: '',
        code: 200,
        description: '',
        export: 'generic',
        type: 'void',
        base: 'void',
        template: null,
        link: null,
        isDefinition: false,
        isReadOnly: false,
        isRequired: false,
        isNullable: false,
        imports: [],
        enum: [],
        enums: [],
        properties: [],
      });
    }
    const distinct = results.filter(
      (result, index, all) => all.findIndex((other) => sameType(other, result)) === index,
    );
    operation.errors = responses
      .filter((response) => response.code >= 300 && response.description)
      .map((response) => ({ code: response.code, description: response.description }));
    operation.responseHeader = distinct.find((result) => result.in === 'header')?.name ?? null;
    for (const result of distinct) {
      operation.results.push(result);
      operation.imports.push(...result.imports);
    }
  }
  operation.parameters = operation.parameters.sort(requiredFirst);
  return operation;
}

const byLowerName = (left, right) => left.toLowerCase().localeCompare(right.toLowerCase(), 'en');

/** The client model: version, server, models and services, post-processed for rendering. */
export function parseOpenApi(openApi) {
  const version = String(openApi.info?.version ?? '1.0').replace(/^v/gi, '');
  const server = openApi.servers?.[0];
  let url = server?.url || '';
  for (const variable in server?.variables || {})
    url = url.replace(`{${variable}}`, server.variables[variable].default);
  url = url.replace(/\/$/g, '');

  const models = [];
  for (const name in openApi.components?.schemas ?? {}) {
    const definitionType = getType(name);
    models.push(
      getModel(
        openApi,
        openApi.components.schemas[name],
        true,
        definitionType.base.replace(reservedWords, '_$1'),
      ),
    );
  }
  for (const name in openApi.components?.parameters ?? {}) {
    const definition = openApi.components.parameters[name];
    if (!definition.schema) continue;
    const model = getModel(
      openApi,
      definition.schema,
      true,
      getType(name).base.replace(reservedWords, '_$1'),
    );
    model.description = definition.description || null;
    model.deprecated = definition.deprecated;
    models.push(model);
  }

  const services = new Map();
  for (const url in openApi.paths ?? {}) {
    const pathItem = openApi.paths[url];
    const pathParams = getOperationParameters(openApi, pathItem.parameters || []);
    for (const method in pathItem) {
      if (!['get', 'put', 'post', 'delete', 'options', 'head', 'patch'].includes(method)) continue;
      const op = pathItem[method];
      const tags = op.tags?.length ? op.tags.filter(unique) : ['Default'];
      for (const tag of tags) {
        const operation = getOperation(openApi, url, method, tag, op, pathParams);
        const service = services.get(operation.service) || {
          name: operation.service,
          operations: [],
          imports: [],
        };
        service.operations.push(operation);
        service.imports.push(...operation.imports);
        services.set(operation.service, service);
      }
    }
  }

  return {
    version,
    server: url,
    models: models.map((model) => ({
      ...model,
      imports: model.imports
        .filter(unique)
        .sort(byLowerName)
        .filter((name) => model.name !== name),
      enums: model.enums.filter(
        (item, index, all) => all.findIndex((other) => other.name === item.name) === index,
      ),
      enum: model.enum.filter(
        (item, index, all) => all.findIndex((other) => other.name === item.name) === index,
      ),
    })),
    services: [...services.values()].map((service) => {
      const names = new Map();
      const operations = service.operations.map((operation) => {
        const clone = { ...operation };
        clone.imports.push(...clone.parameters.flatMap((parameter) => parameter.imports));
        clone.imports.push(...clone.results.flatMap((result) => result.imports));
        const count = names.get(clone.name) || 0;
        if (count > 0) clone.name = `${clone.name}${count}`;
        names.set(operation.name, count + 1);
        return clone;
      });
      const imports = [...service.imports];
      for (const operation of operations) imports.push(...operation.imports);
      return { ...service, operations, imports: imports.filter(unique).sort(byLowerName) };
    }),
  };
}
