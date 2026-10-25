import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { getModel, parseOpenApi } from '../codegen/parse.mjs';
import { renderSdk } from '../codegen/generate.mjs';
import { renderClientFiles } from '../codegen/render.mjs';

const document = { components: { schemas: {} } };
function rendered(schema: Record<string, unknown>, name = 'Fixture') {
  const model = getModel(document, schema, true, name);
  const files = renderClientFiles(
    { models: [model], services: [], version: '1.0.0', server: '' },
    'FixtureClient',
  );
  return {
    model,
    source: files.get(`models/${name}.ts`),
    schema: files.get(`schemas/$${name}.ts`),
  };
}

describe('closed-empty source contract fidelity', () => {
  it('renders the source Record<string, never> schema as a never-valued dictionary', () => {
    const result = rendered({ type: 'object', additionalProperties: false }, 'ClosedEmpty');
    expect(result.model.export).toBe('dictionary');
    expect(result.source).toContain('export type ClosedEmpty = Record<string, never>;');
    expect(result.schema).toContain("type: 'never'");
  });

  it('accepts an empty generated input and rejects populated, null and scalar inputs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sdk-closed-empty-consumer-'));
    try {
      const result = rendered({ type: 'object', additionalProperties: false }, 'ClosedEmpty');
      writeFileSync(join(directory, 'ClosedEmpty.ts'), result.source);
      const consumer = join(directory, 'consumer.ts');
      writeFileSync(
        consumer,
        [
          "import type { ClosedEmpty } from './ClosedEmpty';",
          'export const empty: ClosedEmpty = {};',
          'export const populated: ClosedEmpty = { value: 1 };',
          'export const nullable: ClosedEmpty = null;',
          'export const scalar: ClosedEmpty = 1;',
        ].join('\n'),
      );
      const program = ts.createProgram([consumer], {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      });
      const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => ({
        code: diagnostic.code,
        file: diagnostic.file?.fileName,
        line:
          diagnostic.file && diagnostic.start !== undefined
            ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
            : undefined,
      }));
      expect(diagnostics).toEqual([
        { code: 2322, file: consumer, line: 3 },
        { code: 2322, file: consumer, line: 4 },
        { code: 2322, file: consumer, line: 5 },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('retains parsed closed-empty naming, nullability and descriptive metadata', () => {
    const result = rendered(
      {
        type: 'object',
        additionalProperties: false,
        nullable: true,
        description: 'Closed input',
        readOnly: true,
        deprecated: true,
        minProperties: 0,
        maxProperties: 0,
        default: {},
        pattern: null,
      },
      'NullableClosed',
    );
    expect(result.model).toMatchObject({
      name: 'NullableClosed',
      isDefinition: true,
      isNullable: true,
      isReadOnly: true,
      deprecated: true,
      description: 'Closed input',
      minProperties: 0,
      maxProperties: 0,
      default: {},
    });
    expect(Object.hasOwn(result.model, 'pattern')).toBe(true);
    expect(result.model.pattern).toBeUndefined();
    expect(result.source).toContain(' | null;');
  });

  it('preserves named objects, open and typed dictionaries, and unspecified schemas', () => {
    const named = rendered({
      type: 'object',
      additionalProperties: false,
      required: ['value'],
      properties: { value: { type: 'string' } },
    });
    expect(named.model.export).toBe('interface');
    expect(named.source).toContain('value: string;');
    expect(rendered({ type: 'object', additionalProperties: true }).source).toContain(
      'Record<string, any>',
    );
    expect(rendered({ type: 'object', additionalProperties: { type: 'number' } }).source).toContain(
      'Record<string, number>',
    );
    expect(rendered({}).source).toContain('export type Fixture = {\n};');
    expect(rendered({}).model.export).toBe('interface');
    expect(
      rendered({ type: 'object', properties: {}, additionalProperties: false }).model.export,
    ).toBe('interface');
  });

  it('preserves reference, enum, array and composition precedence over the closed flag', () => {
    expect(
      getModel(document, {
        type: 'object',
        additionalProperties: false,
        $ref: '#/components/schemas/Other',
      }).export,
    ).toBe('reference');
    expect(
      getModel(document, { type: 'object', additionalProperties: false, enum: ['one', 'two'] })
        .export,
    ).toBe('enum');
    expect(
      getModel(document, { type: 'array', additionalProperties: false, items: { type: 'string' } })
        .export,
    ).toBe('array');
    expect(
      getModel(document, {
        type: 'object',
        additionalProperties: false,
        oneOf: [{ type: 'string' }, { type: 'number' }],
      }).export,
    ).toBe('one-of');
  });
});

describe('native JSON consumption preservation', () => {
  it('retains string required includes at property consumption', () => {
    const model = getModel(
      {},
      { type: 'object', properties: { id: { type: 'string' } }, required: 'id' },
    );
    expect(model.properties).toHaveLength(1);
    expect(model.properties[0]).toMatchObject({ name: 'id', type: 'string', isRequired: true });
  });

  it('retains nullable type arrays and optional null pattern', () => {
    const model = getModel({}, { type: ['string', 'null'], default: 'x', pattern: null });
    expect(model).toMatchObject({
      export: 'generic',
      type: 'string',
      base: 'string',
      isNullable: true,
    });
    expect(model.pattern).toBeUndefined();
  });

  it('retains native enum extension filtering before positional selection', () => {
    const model = getModel(
      {},
      {
        type: 'string',
        enum: ['a', 'b'],
        'x-enum-varnames': ['Alpha', 42],
        'x-enum-descriptions': [null, 'Second'],
      },
    );
    expect(model.enum).toEqual([
      { name: 'Alpha', description: 'Second', value: "'a'", type: 'string' },
      { name: 'B', description: null, value: "'b'", type: 'string' },
    ]);
  });

  it('retains primitive schema boxing without a whole-schema refusal', () => {
    expect(getModel({}, 7)).toMatchObject({
      export: 'interface',
      type: 'any',
      base: 'any',
      properties: [],
    });
  });

  it('retains version and server replacement native conversion', () => {
    expect(
      parseOpenApi({
        info: { version: 5 },
        servers: [{ url: 'https://{host}/', variables: { host: { default: 42 } } }],
        paths: {},
      }),
    ).toEqual({ version: '5', server: 'https://42', models: [], services: [] });
  });

  it.each([
    ['invalid-id', 'Invalid alternate SDK composition identity'],
    ['identity-first', 'SDK composition identity mismatch: alternate'],
    ['components-first', 'SDK composition schema components mismatch: alternate'],
    ['operation', 'SDK alternate operation contract mismatch: get /x'],
  ])('retains composition refusal precedence: %s', (scenario, message) => {
    const directory = mkdtempSync(join(tmpdir(), 'sdk-composition-precedence-'));
    try {
      const id = scenario === 'invalid-id' ? '../bad' : 'alternate';
      const variant = {
        'x-stynx-composition': id,
        operationId: 'alt',
        responses: { 204: { description: 'done' } },
      };
      const contract = {
        openapi: '3.0.0',
        info: { version: '1' },
        components: { schemas: {} },
        paths: {
          '/x': {
            get: {
              operationId: 'main',
              responses: { 204: { description: 'done' } },
              'x-stynx-composition': 'main',
              'x-stynx-operation-variants': [variant],
            },
          },
        },
      };
      const composition = {
        openapi: '3.0.0',
        info: { version: '1' },
        'x-stynx-composition': scenario === 'identity-first' ? 'wrong' : id,
        components:
          scenario === 'operation'
            ? contract.components
            : { schemas: { Other: { type: 'string' } } },
        paths: { '/x': { get: { ...variant, operationId: 'different' } } },
      };
      const input = join(directory, 'openapi.json');
      writeFileSync(input, JSON.stringify(contract));
      mkdirSync(join(directory, 'openapi-compositions'));
      writeFileSync(
        join(directory, 'openapi-compositions/alternate.json'),
        JSON.stringify(composition),
      );
      expect(() => renderSdk({ input })).toThrow(new Error(message));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
