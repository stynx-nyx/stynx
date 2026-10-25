import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyOpenApiContract } from '../../packages/cli/engines/openapi-contract.mjs';

function operation() {
  return {
    operationId: 'read',
    tags: ['fixture'],
    'x-stynx-source': 'fixture.ts:1',
    security: [],
    responses: {
      200: {
        content: {
          'application/json': {
            schema: { type: 'string' },
            examples: { default: { value: 'ok' } },
          },
        },
      },
      400: {},
      401: {},
      403: {},
      404: {},
      default: {},
    },
  };
}
function document() {
  return {
    openapi: '3.1.0',
    components: {
      securitySchemes: { bearerAuth: {}, tenantHeader: {} },
      schemas: { ProblemDetails: {}, UnknownJson: {}, JsonValue: {}, JsonObject: {} },
    },
    paths: { '/fixture': { get: operation() } },
  };
}
function observe(contract, allowlist) {
  const root = mkdtempSync(join(tmpdir(), 'stynx-openapi-native-'));
  try {
    const openapiPath = join(root, 'contract.json');
    writeFileSync(openapiPath, JSON.stringify(contract, null, 2));
    if (allowlist !== undefined)
      writeFileSync(join(root, 'allowlist.json'), JSON.stringify(allowlist));
    return verifyOpenApiContract({
      root,
      openapiPath,
      genericResponseAllowlistPath: 'allowlist.json',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function genericDocument() {
  const value = document();
  value.paths['/fixture'].get.responses['200'].content['application/json'].schema = {
    $ref: '#/components/schemas/JsonObject',
  };
  return value;
}
const genericFailure =
  'GET /fixture: generic 200 response #/components/schemas/JsonObject is not allowlisted';

test('native OpenAPI valid document retains totals and source line lookup', () => {
  const value = document();
  const result = observe(value);
  assert.equal(result.paths, 1);
  assert.equal(result.operations, 1);
  assert.deepEqual(result.failures, []);
  const expected =
    JSON.stringify(value, null, 2)
      .split('\n')
      .findIndex((line) => line.includes('"/fixture":')) + 1;
  assert.equal(result.lineOf('/fixture'), expected);
  assert.equal(result.lineOf('/missing'), 1);
  assert.equal(result.lineOf(undefined), 1);
});

test('native OpenAPI aggregates structural failures in original order', () => {
  const result = observe({ paths: { '/fixture': { post: {} } } });
  assert.deepEqual(result.failures, [
    'openapi must be 3.1.0, got (missing)',
    'missing security scheme bearerAuth',
    'missing security scheme tenantHeader',
    'missing schema ProblemDetails',
    'missing schema UnknownJson',
    'missing schema JsonValue',
    'missing schema JsonObject',
    'POST /fixture: missing operationId',
    'POST /fixture: missing tags',
    'POST /fixture: missing x-stynx-source',
    'POST /fixture: missing explicit security declaration',
    'POST /fixture: missing requestBody or x-stynx-no-request-body',
    'POST /fixture: missing 200 response',
    'POST /fixture: missing 400 response',
    'POST /fixture: missing 401 response',
    'POST /fixture: missing 403 response',
    'POST /fixture: missing 404 response',
    'POST /fixture: missing default response',
    'POST /fixture: missing default 200 response example',
  ]);
});

test('native OpenAPI scalar root retains default missing-field diagnostics', () => {
  const result = observe(17);
  assert.equal(result.paths, 0);
  assert.equal(result.operations, 0);
  assert.deepEqual(result.failures, [
    'openapi must be 3.1.0, got (missing)',
    'missing security scheme bearerAuth',
    'missing security scheme tenantHeader',
    'missing schema ProblemDetails',
    'missing schema UnknownJson',
    'missing schema JsonValue',
    'missing schema JsonObject',
  ]);
});

test('native OpenAPI null root retains TypeError', () =>
  assert.throws(() => observe(null), TypeError));

test('native OpenAPI scalar paths and null items retain empty iteration', () => {
  const value = document();
  value.paths = 17;
  assert.equal(observe(value).operations, 0);
  value.paths = { '/fixture': null };
  assert.equal(observe(value).operations, 0);
  assert.equal(observe(value).paths, 1);
});

test('native OpenAPI null operation retains TypeError', () => {
  const value = document();
  value.paths['/fixture'].get = null;
  assert.throws(() => observe(value), TypeError);
});

test('native OpenAPI required path parameter matching handles native scalar entries', () => {
  const value = document();
  const op = operation();
  value.paths = { '/fixture/{id}': { get: op } };
  op.parameters = [null, 17, { in: 'path', name: 'id', required: true }];
  assert.deepEqual(observe(value).failures, []);
  op.parameters = [null, 17];
  assert.deepEqual(observe(value).failures, [
    'GET /fixture/{id}: missing required path parameter id',
  ]);
  op.parameters = {};
  assert.throws(() => observe(value), TypeError);
});

test('native OpenAPI numeric request source metadata retains RegExp coercion', () => {
  const value = document();
  value.paths['/fixture'].get.requestBody = {
    content: {
      'application/json': {
        'x-stynx-source-type': 17,
        schema: { $ref: '#/components/schemas/UnknownJson' },
      },
    },
  };
  assert.deepEqual(observe(value).failures, [
    'GET /fixture: typed request body 17 fell back to UnknownJson',
    'GET /fixture: request body must use a concrete schema',
    'GET /fixture: request body schema UnknownJson missing x-stynx-source',
  ]);
});

for (const [name, allowlist, expected] of [
  ['absent file', undefined, [genericFailure]],
  ['empty allowlist', {}, [genericFailure]],
  ['null allow', { allow: null }, [genericFailure]],
  [
    'valid match',
    { allow: [{ pathPattern: '^/fixture$', methods: ['get'], reason: 'explicit exception' }] },
    [],
  ],
  [
    'iterable string methods',
    { allow: [{ pathPattern: '^/fixture$', methods: 'get', reason: 'reason' }] },
    [genericFailure],
  ],
  [
    'numeric reason',
    { allow: [{ pathPattern: '^/fixture$', methods: ['get'], reason: 17 }] },
    [genericFailure],
  ],
  [
    'empty reason',
    { allow: [{ pathPattern: '^/fixture$', methods: ['get'], reason: '' }] },
    [genericFailure],
  ],
  ['numeric entry', { allow: [17] }, [genericFailure]],
  [
    'null pattern',
    { allow: [{ pathPattern: null, methods: ['get'], reason: 'reason' }] },
    [genericFailure],
  ],
]) {
  test(`native OpenAPI allowlist ${name}`, () =>
    assert.deepEqual(observe(genericDocument(), allowlist).failures, expected));
}
for (const [name, allowlist, ErrorType] of [
  ['null root', null, TypeError],
  ['nonarray allow', { allow: 'text' }, TypeError],
  ['null entry', { allow: [null] }, TypeError],
  [
    'invalid RegExp precedes noniterable methods',
    { allow: [{ pathPattern: '[', methods: 17 }] },
    SyntaxError,
  ],
  [
    'noniterable methods after valid RegExp',
    { allow: [{ pathPattern: '^/fixture$', methods: 17 }] },
    TypeError,
  ],
]) {
  test(`native OpenAPI allowlist ${name}`, () =>
    assert.throws(() => observe(genericDocument(), allowlist), ErrorType));
}
