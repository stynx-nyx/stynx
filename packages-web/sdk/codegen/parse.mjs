// OpenAPI 3.x -> client model for `stynx-sdk-codegen`.
//
// The model, its naming rules and the emitted shapes follow openapi-typescript-codegen 0.31.0
// (MIT, Ferdi Koomen; see ./LICENSE-openapi-typescript-codegen) so the regenerated SDK keeps the
// published `@stynx-nyx/sdk` surface: the `GeneratedStynxSdk` client, one `*Service` class per
// tag, `CancelablePromise`, `ApiError`, `OpenAPI`, and `$Model` schema constants. Only the
// options STYNX used are kept: fetch client, union types, options objects, exported schemas.

/**
 * Private records constructed by this parser. Raw schema fields are not asserted to have
 * these shapes; copied metadata remains unknown until its existing rendering operation.
 * @typedef {{type: string, base: string, template: string | null, imports: string[],
 *   isNullable?: boolean}} TypeReference
 * @typedef {{name: string, value: string, type: string, description: string | null}} Enumerator
 * @typedef {{format?: unknown, maximum?: unknown, exclusiveMaximum?: unknown,
 *   minimum?: unknown, exclusiveMinimum?: unknown, multipleOf?: unknown,
 *   maxLength?: unknown, minLength?: unknown, maxItems?: unknown, minItems?: unknown,
 *   uniqueItems?: unknown, maxProperties?: unknown, minProperties?: unknown,
 *   pattern?: unknown}} Constraints
 * @typedef {TypeReference & Constraints & {name: string, export: string,
 *   link: Model | null, description: unknown, deprecated?: unknown, default?: unknown,
 *   isDefinition: boolean, isReadOnly: boolean, isRequired: boolean, isNullable: boolean,
 *   enum: Enumerator[], enums: Model[], properties: Model[]}} Model
 * @typedef {Model & {in: unknown, prop: unknown, mediaType: string | null}} Parameter
 * @typedef {Model & {in: string, code: number}} ResponseModel
 * @typedef {{imports: string[], parameters: Parameter[], parametersPath: Parameter[],
 *   parametersQuery: Parameter[], parametersForm: Parameter[], parametersCookie: Parameter[],
 *   parametersHeader: Parameter[], parametersBody: Parameter | null}} ParameterGroups
 * @typedef {ParameterGroups & {service: string, name: string, summary: unknown,
 *   description: unknown, deprecated: boolean, method: string, path: string,
 *   errors: {code: number, description: unknown}[], results: ResponseModel[],
 *   responseHeader: string | null}} Operation
 * @typedef {{name: string, operations: Operation[], imports: string[]}} Service
 * @typedef {{version: string, server: string, models: Model[], services: Service[]}} ClientModel
 * @typedef {(openApi: unknown, definition: unknown, isDefinition?: boolean, name?: string) => Model} ModelReader
 */

// These helpers operate on the private fresh native-JSON input. They do not claim an
// OpenAPI schema. Native method domains are proved only where that method was consumed.
/** @param {unknown} value @param {PropertyKey} key @returns {unknown} */
function jsonField(value, key) {
  if (value === null || value === undefined)
    throw new TypeError(`Cannot read properties of ${value} (reading '${String(key)}')`);
  /** @type {unknown} */
  const target = Object(value);
  if ((typeof target !== 'object' || target === null) && typeof target !== 'function')
    throw new TypeError('Native Object boxing returned a non-object');
  return Reflect.get(target, key, value);
}

/** @param {unknown} value @param {PropertyKey} key @returns {unknown} */
function optionalJsonField(value, key) {
  return value === null || value === undefined ? undefined : jsonField(value, key);
}

/** @param {unknown} value @returns {string} */
function schemaText(value) {
  if (typeof value !== 'string') throw new TypeError('OpenAPI text method requires a string');
  return value;
}

/** @param {unknown} value @returns {unknown[]} */
function schemaArray(value) {
  if (!Array.isArray(value)) throw new TypeError('OpenAPI array method requires an array');
  return value;
}

/** @param {unknown} value @returns {string | unknown[]} */
function schemaIterable(value) {
  if (typeof value === 'string' || Array.isArray(value)) return value;
  throw new TypeError('OpenAPI collection is not iterable');
}

/** @param {unknown} value @returns {object} */
function jsonObject(value) {
  if (value === null || value === undefined)
    throw new TypeError('Cannot convert undefined or null to object');
  /** @type {unknown} */
  const boxed = Object(value);
  if ((typeof boxed !== 'object' || boxed === null) && typeof boxed !== 'function')
    throw new TypeError('Native Object boxing returned a non-object');
  return boxed;
}

/** @param {unknown} value @returns {string[]} */
function jsonKeys(value) {
  return Object.keys(jsonObject(value));
}

/** @param {unknown} value @returns {unknown[]} */
function jsonValues(value) {
  return Object.values(jsonObject(value));
}

/** @param {unknown} value @returns {PropertyKey} */
function jsonKey(value) {
  return typeof value === 'symbol' ? value : `${value}`;
}

/** @param {unknown} value @returns {string[] | undefined} */
function optionalStringArray(value) {
  return value === null || value === undefined ? undefined : schemaArray(value).filter(isString);
}

/** @param {unknown} value @param {string} prefix @returns {boolean | undefined} */
function optionalStartsWith(value, prefix) {
  return value === null || value === undefined ? undefined : schemaText(value).startsWith(prefix);
}

/** @param {unknown} value @param {string} item @returns {boolean | undefined} */
function optionalSchemaIncludes(value, item) {
  return value === null || value === undefined ? undefined : schemaIncludes(value, item);
}

/** @param {unknown} value @param {string} item @returns {boolean} */
function schemaIncludes(value, item) {
  if (typeof value === 'string') return value.includes(item);
  return schemaArray(value).includes(item);
}

const reservedWords =
  /^(arguments|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|eval|export|extends|false|finally|for|function|if|implements|import|in|instanceof|interface|let|new|null|package|private|protected|public|return|static|super|switch|this|throw|true|try|typeof|var|void|while|with|yield)$/g;

/** @template T @param {T} value @param {number} index @param {T[]} array */
const unique = (value, index, array) => array.indexOf(value) === index;
/** @param {unknown} value @returns {boolean} */
const isDefined = (value) => value !== undefined && value !== null && value !== '';
/** @param {unknown} value */
const isString = (value) => typeof value === 'string';
/** @param {unknown} value @returns {unknown} */
const escapePattern = (value) =>
  value === null || value === undefined
    ? undefined
    : schemaText(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// camelcase 6.3.0 (MIT, Sindre Sorhus), the variant the reference generator used for names.
const UPPERCASE = /[\p{Lu}]/u;
const LOWERCASE = /[\p{Ll}]/u;
const SEPARATORS_AND_IDENTIFIER = /[_.\- ]+([\p{Alpha}\p{N}_]|$)/gu;
const NUMBERS_AND_IDENTIFIER = /\d+([\p{Alpha}\p{N}_]|$)/gu;

/** @param {string} input @param {{pascalCase?: boolean}} [options] @returns {string} */
export function camelCase(input, { pascalCase = false } = {}) {
  let value = input.trim();
  if (value.length === 0) return '';
  /** @param {string} text */
  const lower = (text) => text.toLocaleLowerCase();
  /** @param {string} text */
  const upper = (text) => text.toLocaleUpperCase();
  if (value.length === 1) return pascalCase ? upper(value) : lower(value);
  if (value !== lower(value)) {
    let isLastCharLower = false;
    let isLastCharUpper = false;
    let isLastLastCharUpper = false;
    for (let index = 0; index < value.length; index += 1) {
      const character = value.charAt(index);
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
    .replace(
      SEPARATORS_AND_IDENTIFIER,
      (/** @type {string} */ _, /** @type {string} */ identifier) => upper(identifier),
    )
    .replace(NUMBERS_AND_IDENTIFIER, (match) => upper(match));
}

/** @type {ReadonlyMap<unknown, string>} */
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

/** @param {unknown} type @param {unknown} format */
const mappedType = (type, format) => (format === 'binary' ? 'binary' : typeMappings.get(type));
/** @param {string} value */
const encode = (value) => value.replace(/^[^a-zA-Z_$]+/g, '').replace(/[^\w$]+/g, '_');

/** @param {unknown} value @returns {string} */
const stripNamespace = (value) =>
  schemaText(value)
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

/** @param {unknown} [type] @param {unknown} [format] @returns {TypeReference} */
function getType(type = 'any', format) {
  /** @type {TypeReference} */
  const result = { type: 'any', base: 'any', template: null, imports: [], isNullable: false };
  if (Array.isArray(type)) {
    /** @type {unknown[]} */
    const nativeTypes = type;
    const joined = nativeTypes
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
      const left = matches[1];
      const right = matches[2];
      if (left === undefined || right === undefined)
        throw new TypeError('Native type-pattern match omitted a capture');
      const match1 = getType(encode(left));
      const match2 = getType(encode(right));
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

/** @param {unknown} openApi @param {unknown} item @returns {unknown} */
function getRef(openApi, item) {
  if (!jsonField(item, '$ref')) return item;
  let result = openApi;
  for (const segment of schemaText(jsonField(item, '$ref'))
    .replace(/^#/g, '')
    .split('/')
    .filter(Boolean)) {
    const key = decodeURIComponent(segment.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (!Object.prototype.hasOwnProperty.call(result, key))
      throw new Error(`Could not find reference: "${jsonField(item, '$ref')}"`);
    result = jsonField(result, key);
  }
  return result;
}

/** @param {unknown} definition @returns {Constraints} */
function constraints(definition) {
  return {
    format: jsonField(definition, 'format'),
    maximum: jsonField(definition, 'maximum'),
    exclusiveMaximum: jsonField(definition, 'exclusiveMaximum'),
    minimum: jsonField(definition, 'minimum'),
    exclusiveMinimum: jsonField(definition, 'exclusiveMinimum'),
    multipleOf: jsonField(definition, 'multipleOf'),
    maxLength: jsonField(definition, 'maxLength'),
    minLength: jsonField(definition, 'minLength'),
    maxItems: jsonField(definition, 'maxItems'),
    minItems: jsonField(definition, 'minItems'),
    uniqueItems: jsonField(definition, 'uniqueItems'),
    maxProperties: jsonField(definition, 'maxProperties'),
    minProperties: jsonField(definition, 'minProperties'),
    pattern: escapePattern(jsonField(definition, 'pattern')),
  };
}

/** @param {unknown} definition @param {Model} [model] @returns {unknown} */
function getModelDefault(definition, model) {
  if (jsonField(definition, 'default') === undefined) return undefined;
  if (jsonField(definition, 'default') === null) return 'null';
  switch (jsonField(definition, 'type') || typeof jsonField(definition, 'default')) {
    case 'int':
    case 'integer':
    case 'number':
      if (
        model?.export === 'enum' &&
        optionalJsonField(model.enum, jsonKey(jsonField(definition, 'default')))
      )
        return jsonField(jsonField(model.enum, jsonKey(jsonField(definition, 'default'))), 'value');
      return jsonField(definition, 'default');
    case 'boolean':
      return JSON.stringify(jsonField(definition, 'default'));
    case 'string':
      return `'${jsonField(definition, 'default')}'`;
    case 'object':
      try {
        return JSON.stringify(jsonField(definition, 'default'), null, 4);
      } catch {
        return undefined;
      }
  }
  return undefined;
}

/** @param {unknown} values @returns {Enumerator[]} */
function getEnum(values) {
  if (!Array.isArray(values)) return [];
  /** @type {unknown[]} */
  const nativeValues = values;
  return nativeValues
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

/** @param {Enumerator[]} enumerators @param {unknown} definition @returns {Enumerator[]} */
function extendEnum(enumerators, definition) {
  const names = optionalStringArray(jsonField(definition, 'x-enum-varnames'));
  const descriptions = optionalStringArray(jsonField(definition, 'x-enum-descriptions'));
  return enumerators.map((enumerator, index) => ({
    name: names?.[index] || enumerator.name,
    description: descriptions?.[index] || enumerator.description,
    value: enumerator.value,
    type: enumerator.type,
  }));
}

/** @param {string} value @returns {string} */
const escapeName = (value) => {
  if (value || value === '') {
    if (!/^[a-zA-Z_$][\w$]+$/g.test(value)) return `'${value}'`;
  }
  return value;
};

/** @param {unknown} openApi @param {Model} [parent] @returns {unknown} */
function findDiscriminator(openApi, parent) {
  if (!jsonField(openApi, 'components') || !parent) return undefined;
  for (const definition of jsonValues(
    jsonField(jsonField(openApi, 'components'), 'schemas') ?? {},
  )) {
    if (
      jsonField(definition, 'discriminator') &&
      optionalJsonField(jsonField(definition, 'oneOf'), 'length') &&
      schemaArray(jsonField(definition, 'oneOf')).some(
        (item) => jsonField(item, '$ref') && stripNamespace(jsonField(item, '$ref')) == parent.name,
      )
    )
      return jsonField(definition, 'discriminator');
  }
  return undefined;
}

/** @param {unknown} discriminator @param {Model} parent @returns {string} */
function discriminatorValue(discriminator, parent) {
  if (jsonField(discriminator, 'mapping')) {
    /** @type {Record<PropertyKey, string>} */
    const inverted = {};
    for (const key in jsonObject(jsonField(discriminator, 'mapping') ?? {}))
      inverted[jsonKey(jsonField(jsonField(discriminator, 'mapping'), key))] = key;
    const ref = Object.keys(inverted).find((item) => stripNamespace(item) == parent.name);
    if (ref && inverted[ref]) return inverted[ref];
  }
  return parent.name;
}

/** @returns {{imports: string[], enum: Enumerator[], enums: Model[], properties: Model[]}} */
function emptyModel() {
  return { imports: [], enum: [], enums: [], properties: [] };
}

/** @param {unknown} openApi @param {unknown} definition @param {ModelReader} getModelFn @param {Model} [parent] @returns {Model[]} */
function getModelProperties(openApi, definition, getModelFn, parent) {
  /** @type {Model[]} */
  const models = [];
  const discriminator = findDiscriminator(openApi, parent);
  for (const propertyName in jsonObject(jsonField(definition, 'properties') ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(jsonField(definition, 'properties'), propertyName))
      continue;
    const property = jsonField(jsonField(definition, 'properties'), propertyName);
    const common = {
      name: escapeName(propertyName),
      description: jsonField(property, 'description') || null,
      deprecated: jsonField(property, 'deprecated') === true,
      isDefinition: false,
      isReadOnly: jsonField(property, 'readOnly') === true,
      isRequired: !!optionalSchemaIncludes(jsonField(definition, 'required'), propertyName),
      ...constraints(property),
    };
    if (parent && optionalJsonField(discriminator, 'propertyName') == propertyName) {
      models.push({
        export: 'reference',
        type: 'string',
        base: `'${discriminatorValue(discriminator, parent)}'`,
        template: null,
        isNullable: jsonField(property, 'nullable') === true,
        link: null,
        ...emptyModel(),
        ...common,
      });
    } else if (jsonField(property, '$ref')) {
      const model = getType(jsonField(property, '$ref'));
      models.push({
        export: 'reference',
        type: model.type,
        base: model.base,
        template: model.template,
        link: null,
        isNullable: model.isNullable || jsonField(property, 'nullable') === true,
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
        isNullable: model.isNullable || jsonField(property, 'nullable') === true,
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

/** @param {unknown} openApi @param {unknown} definition @param {unknown} definitions @param {string} type @param {ModelReader} getModelFn @returns {{type: string, imports: string[], enums: Model[], properties: Model[]}} */
function getModelComposition(openApi, definition, definitions, type, getModelFn) {
  /** @type {{type: string, imports: string[], enums: Model[], properties: Model[]}} */
  const composition = { type, imports: [], enums: [], properties: [] };
  /** @type {Model[]} */
  const properties = [];
  schemaArray(definitions)
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
  if (jsonField(definition, 'required')) {
    const required = schemaArray(definitions)
      .reduce((/** @type {Model[]} */ all, item) => {
        const resolved = jsonField(item, '$ref') ? getRef(openApi, item) : item;
        return [...all, ...getModelFn(openApi, resolved).properties];
      }, [])
      .filter(
        (property) =>
          !property.isRequired && schemaIncludes(jsonField(definition, 'required'), property.name),
      )
      .map((property) => ({ ...property, isRequired: true }));
    required.forEach((property) => {
      composition.imports.push(...property.imports);
      composition.enums.push(...property.enums);
    });
    properties.push(...required);
  }
  if (jsonField(definition, 'properties')) {
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

/** @param {unknown} openApi @param {unknown} definition @param {boolean} [isDefinition] @param {string} [name] @returns {Model} */
export function getModel(openApi, definition, isDefinition = false, name = '') {
  /** @type {Model} */
  const model = {
    name,
    export: 'interface',
    type: 'any',
    base: 'any',
    template: null,
    link: null,
    description: jsonField(definition, 'description') || null,
    deprecated: jsonField(definition, 'deprecated') === true,
    isDefinition,
    isReadOnly: jsonField(definition, 'readOnly') === true,
    isNullable: jsonField(definition, 'nullable') === true,
    isRequired: false,
    ...constraints(definition),
    imports: [],
    enum: [],
    enums: [],
    properties: [],
  };
  /** @param {string} exportKind @param {TypeReference} source @param {Model} [link] */
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
  if (jsonField(definition, '$ref')) {
    const reference = getType(jsonField(definition, '$ref'));
    return fromType('reference', reference);
  }
  if (jsonField(definition, 'enum') && jsonField(definition, 'type') !== 'boolean') {
    const enumerators = extendEnum(getEnum(jsonField(definition, 'enum')), definition);
    if (enumerators.length) {
      model.export = 'enum';
      model.type = 'string';
      model.base = 'string';
      model.enum.push(...enumerators);
      model.default = getModelDefault(definition, model);
      return model;
    }
  }
  if (jsonField(definition, 'type') === 'array' && jsonField(definition, 'items')) {
    if (jsonField(jsonField(definition, 'items'), '$ref'))
      return fromType('array', getType(jsonField(jsonField(definition, 'items'), '$ref')));
    const item = getModel(openApi, jsonField(definition, 'items'));
    return fromType('array', item, item);
  }
  if (
    jsonField(definition, 'type') === 'object' &&
    (typeof jsonField(definition, 'additionalProperties') === 'object' ||
      jsonField(definition, 'additionalProperties') === true)
  ) {
    const additional =
      typeof jsonField(definition, 'additionalProperties') === 'object'
        ? jsonField(definition, 'additionalProperties')
        : {};
    if (jsonField(additional, '$ref'))
      return fromType('dictionary', getType(jsonField(additional, '$ref')));
    const item = getModel(openApi, additional);
    return fromType('dictionary', item, item);
  }
  /** @type {[string, string][]} */
  const compositionKinds = [
    ['oneOf', 'one-of'],
    ['anyOf', 'any-of'],
    ['allOf', 'all-of'],
  ];
  for (const [keyword, kind] of compositionKinds) {
    if (optionalJsonField(jsonField(definition, keyword), 'length')) {
      const composition = getModelComposition(
        openApi,
        definition,
        jsonField(definition, keyword),
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
  if (jsonField(definition, 'type') === 'object') {
    if (jsonField(definition, 'properties')) {
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
    if (jsonField(definition, 'additionalProperties') === false) {
      return fromType('dictionary', {
        type: 'never',
        base: 'never',
        template: null,
        imports: [],
      });
    }
    const item = getModel(openApi, {});
    return fromType('dictionary', item, item);
  }
  if (jsonField(definition, 'type')) {
    const generic = getType(jsonField(definition, 'type'), jsonField(definition, 'format'));
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

/** @param {unknown} value @returns {string} */
const parameterName = (value) =>
  camelCase(
    schemaText(value)
      .replace(/^[^a-zA-Z]+/g, '')
      .replace('[]', 'Array')
      .replace(/[^\w-]+/g, '-')
      .trim(),
  ).replace(reservedWords, '_$1');

/** @param {Model} target @param {Model} model */
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

/** @param {unknown} openApi @param {unknown} parameter @returns {Parameter} */
function getOperationParameter(openApi, parameter) {
  /** @type {Parameter} */
  const operationParameter = {
    in: jsonField(parameter, 'in'),
    prop: jsonField(parameter, 'name'),
    export: 'interface',
    name: parameterName(jsonField(parameter, 'name')),
    type: 'any',
    base: 'any',
    template: null,
    link: null,
    description: jsonField(parameter, 'description') || null,
    deprecated: jsonField(parameter, 'deprecated') === true,
    isDefinition: false,
    isReadOnly: false,
    isRequired: jsonField(parameter, 'required') === true,
    isNullable: jsonField(parameter, 'nullable') === true,
    imports: [],
    enum: [],
    enums: [],
    properties: [],
    mediaType: null,
  };
  /** @param {unknown} ref @param {unknown} [schema] */
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
  if (jsonField(parameter, '$ref')) return fromReference(jsonField(parameter, '$ref'));
  let schema = jsonField(parameter, 'schema');
  if (schema) {
    if (optionalStartsWith(jsonField(schema, '$ref'), '#/components/parameters/'))
      schema = getRef(openApi, schema);
    if (jsonField(schema, '$ref')) return fromReference(jsonField(schema, '$ref'), schema);
    const model = getModel(openApi, schema);
    copySchema(operationParameter, model);
    operationParameter.isRequired = operationParameter.isRequired || model.isRequired;
    operationParameter.isNullable = operationParameter.isNullable || model.isNullable;
    operationParameter.default = model.default;
  }
  return operationParameter;
}

/** @param {unknown} openApi @param {unknown} parameters @returns {ParameterGroups} */
function getOperationParameters(openApi, parameters) {
  /** @type {ParameterGroups} */
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
  for (const item of schemaIterable(parameters)) {
    const definition = getRef(openApi, item);
    const parameter = getOperationParameter(openApi, definition);
    if (parameter.prop === 'api-version') continue;
    const group = jsonField(groups, jsonKey(jsonField(definition, 'in')));
    if (!group) continue;
    if (
      group !== 'parametersPath' &&
      group !== 'parametersQuery' &&
      group !== 'parametersForm' &&
      group !== 'parametersCookie' &&
      group !== 'parametersHeader'
    )
      throw new TypeError('OpenAPI parameter group does not identify a parameter list');
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

/** @param {unknown} content @returns {{mediaType: string, schema: unknown} | null} */
function getContent(content) {
  const preferred = jsonKeys(content)
    .filter((mediaType) => supportedMediaTypes.includes(mediaType.split(';', 1).join('').trim()))
    .find((mediaType) => isDefined(optionalJsonField(jsonField(content, mediaType), 'schema')));
  if (preferred)
    return { mediaType: preferred, schema: jsonField(jsonField(content, preferred), 'schema') };
  const first = jsonKeys(content).find((mediaType) =>
    isDefined(optionalJsonField(jsonField(content, mediaType), 'schema')),
  );
  return first
    ? { mediaType: first, schema: jsonField(jsonField(content, first), 'schema') }
    : null;
}

/** @param {unknown} openApi @param {unknown} body @returns {Parameter} */
function getRequestBody(openApi, body) {
  /** @type {Parameter} */
  const requestBody = {
    in: 'body',
    export: 'interface',
    prop: 'requestBody',
    name: 'requestBody',
    type: 'any',
    base: 'any',
    template: null,
    link: null,
    description: jsonField(body, 'description') || null,
    default: undefined,
    isDefinition: false,
    isReadOnly: false,
    isRequired: jsonField(body, 'required') === true,
    isNullable: jsonField(body, 'nullable') === true,
    imports: [],
    enum: [],
    enums: [],
    properties: [],
    mediaType: null,
  };
  if (!jsonField(body, 'content')) return requestBody;
  const content = getContent(jsonField(body, 'content'));
  if (!content) return requestBody;
  requestBody.mediaType = content.mediaType;
  if (['application/x-www-form-urlencoded', 'multipart/form-data'].includes(content.mediaType)) {
    requestBody.in = 'formData';
    requestBody.name = 'formData';
    requestBody.prop = 'formData';
  }
  if (jsonField(content.schema, '$ref')) {
    const reference = getType(jsonField(content.schema, '$ref'));
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

/** @param {unknown} openApi @param {unknown} response @param {number} code @returns {ResponseModel} */
function getOperationResponse(openApi, response, code) {
  /** @type {ResponseModel} */
  const operationResponse = {
    in: 'response',
    name: '',
    code,
    description: jsonField(response, 'description') || null,
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
  if (jsonField(response, 'content')) {
    const content = getContent(jsonField(response, 'content'));
    if (content) {
      if (optionalStartsWith(jsonField(content.schema, '$ref'), '#/components/responses/'))
        content.schema = getRef(openApi, content.schema);
      if (jsonField(content.schema, '$ref')) {
        const reference = getType(jsonField(content.schema, '$ref'));
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
  if (jsonField(response, 'headers')) {
    for (const name in jsonObject(jsonField(response, 'headers') ?? {})) {
      operationResponse.in = 'header';
      operationResponse.name = name;
      operationResponse.type = 'string';
      operationResponse.base = 'string';
      return operationResponse;
    }
  }
  return operationResponse;
}

/** @param {string} value @returns {number | null} */
function responseCode(value) {
  if (value === 'default') return 200;
  if (/[0-9]+/g.test(value)) {
    const code = parseInt(value);
    if (Number.isInteger(code)) return Math.abs(code);
  }
  return null;
}

/** @param {Model} left @param {Model} right @returns {boolean} */
const sameType = (left, right) => {
  const equal =
    left.type === right.type && left.base === right.base && left.template === right.template;
  return equal && left.link && right.link ? sameType(left.link, right.link) : equal;
};

/** @param {Model} left @param {Model} right */
const requiredFirst = (left, right) => {
  const a = left.isRequired && left.default === undefined;
  const b = right.isRequired && right.default === undefined;
  if (a && !b) return -1;
  if (b && !a) return 1;
  return 0;
};

/** @param {unknown} openApi @param {string} url @param {string} method @param {unknown} tag @param {unknown} op @param {ParameterGroups} pathParams @returns {Operation} */
function getOperation(openApi, url, method, tag, op, pathParams) {
  const serviceName = camelCase(
    schemaText(tag)
      .replace(/^[^a-zA-Z]+/g, '')
      .replace(/[^\w-]+/g, '-')
      .trim(),
    { pascalCase: true },
  );
  const operationName = jsonField(op, 'operationId')
    ? camelCase(
        schemaText(jsonField(op, 'operationId'))
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
  /** @type {Operation} */
  const operation = {
    service: serviceName,
    name: operationName,
    summary: jsonField(op, 'summary') || null,
    description: jsonField(op, 'description') || null,
    deprecated: jsonField(op, 'deprecated') === true,
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
  if (jsonField(op, 'parameters')) {
    const parameters = getOperationParameters(openApi, jsonField(op, 'parameters'));
    operation.imports.push(...parameters.imports);
    operation.parameters.push(...parameters.parameters);
    operation.parametersPath.push(...parameters.parametersPath);
    operation.parametersQuery.push(...parameters.parametersQuery);
    operation.parametersForm.push(...parameters.parametersForm);
    operation.parametersHeader.push(...parameters.parametersHeader);
    operation.parametersCookie.push(...parameters.parametersCookie);
    operation.parametersBody = parameters.parametersBody;
  }
  if (jsonField(op, 'requestBody')) {
    const requestBody = getRequestBody(openApi, getRef(openApi, jsonField(op, 'requestBody')));
    operation.imports.push(...requestBody.imports);
    operation.parameters.push(requestBody);
    operation.parametersBody = requestBody;
  }
  if (jsonField(op, 'responses')) {
    /** @type {ResponseModel[]} */
    const responses = [];
    for (const code in jsonObject(jsonField(op, 'responses') ?? {})) {
      const value = responseCode(code);
      if (value)
        responses.push(
          getOperationResponse(
            openApi,
            getRef(openApi, jsonField(jsonField(op, 'responses'), code)),
            value,
          ),
        );
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

/** @param {string} left @param {string} right */
const byLowerName = (left, right) => left.toLowerCase().localeCompare(right.toLowerCase(), 'en');

/** The client model: version, server, models and services, post-processed for rendering. */
/** @param {unknown} openApi @returns {ClientModel} */
export function parseOpenApi(openApi) {
  const version = String(optionalJsonField(jsonField(openApi, 'info'), 'version') ?? '1.0').replace(
    /^v/gi,
    '',
  );
  const server = optionalJsonField(jsonField(openApi, 'servers'), '0');
  let url = optionalJsonField(server, 'url') || '';
  for (const variable in jsonObject(optionalJsonField(server, 'variables') || {}))
    url = schemaText(url).replace(
      `{${variable}}`,
      `${jsonField(jsonField(jsonField(server, 'variables'), variable), 'default')}`,
    );
  const serverUrl = schemaText(url).replace(/\/$/g, '');

  /** @type {Model[]} */
  const models = [];
  for (const name in jsonObject(
    optionalJsonField(jsonField(openApi, 'components'), 'schemas') ?? {},
  )) {
    const definitionType = getType(name);
    models.push(
      getModel(
        openApi,
        jsonField(jsonField(jsonField(openApi, 'components'), 'schemas'), name),
        true,
        definitionType.base.replace(reservedWords, '_$1'),
      ),
    );
  }
  for (const name in jsonObject(
    optionalJsonField(jsonField(openApi, 'components'), 'parameters') ?? {},
  )) {
    const definition = jsonField(jsonField(jsonField(openApi, 'components'), 'parameters'), name);
    if (!jsonField(definition, 'schema')) continue;
    const model = getModel(
      openApi,
      jsonField(definition, 'schema'),
      true,
      getType(name).base.replace(reservedWords, '_$1'),
    );
    model.description = jsonField(definition, 'description') || null;
    model.deprecated = jsonField(definition, 'deprecated');
    models.push(model);
  }

  /** @type {Map<string, Service>} */
  const services = new Map();
  for (const url in jsonObject(jsonField(openApi, 'paths') ?? {})) {
    const pathItem = jsonField(jsonField(openApi, 'paths'), url);
    const pathParams = getOperationParameters(openApi, jsonField(pathItem, 'parameters') || []);
    for (const method in jsonObject(pathItem ?? {})) {
      if (!['get', 'put', 'post', 'delete', 'options', 'head', 'patch'].includes(method)) continue;
      const op = jsonField(pathItem, method);
      const tags = optionalJsonField(jsonField(op, 'tags'), 'length')
        ? schemaArray(jsonField(op, 'tags')).filter(unique)
        : ['Default'];
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
    server: serverUrl,
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
      /** @type {Map<string, number>} */
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
