import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');

function discover(source, { refuse = false } = {}) {
  const fixture = mkdtempSync(join(tmpdir(), 'stynx-api-discovery-'));
  try {
    mkdirSync(join(fixture, 'packages', 'fixture', 'src'), { recursive: true });
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({ type: 'module' }));
    writeFileSync(
      join(fixture, 'packages', 'fixture', 'src', 'fixture.controller.ts'),
      `import { Controller, Get, Post } from '@nestjs/common';\nimport { Public, PublicTenantRoute, Permission } from '@stynx-nyx/auth';\n${source}`,
    );
    const result = spawnSync(
      process.execPath,
      [join(root, 'scripts', 'verify-api-coverage.mjs'), '--write-openapi', '--json'],
      {
        cwd: fixture,
        encoding: 'utf8',
        timeout: 10000,
      },
    );
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    if (refuse) {
      assert.notEqual(result.status, 0, 'unresolved operation must refuse generation');
      assert.match(result.stderr, /fixture\.controller\.ts/u);
      return;
    }
    assert.equal(result.status, 0, result.stderr);
    const contract = JSON.parse(
      readFileSync(join(fixture, 'docs', 'framework', 'contracts', 'openapi.json'), 'utf8'),
    );
    return Object.entries(contract.paths).flatMap(([path, item]) =>
      Object.entries(item).map(([method, operation]) => ({
        method,
        path,
        isPublic: operation.security.length === 0,
        operationId: operation.operationId,
        operation,
      })),
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

function publicRoster(source) {
  return discover(source).map(({ method, path, isPublic }) => ({ method, path, isPublic }));
}

test('API discovery attaches Public only to its own method, preserving the following protected operation', () => {
  assert.deepEqual(
    publicRoster(`
@Controller('/probes')
export class ProbesController {
  @Public()
  @Get('/public')
  publicProbe() { return {}; }
  @Permission('probe:read')
  @Get('/protected')
  protectedProbe() { return {}; }
}
`),
    [
      { method: 'get', path: '/probes/protected', isPublic: false },
      { method: 'get', path: '/probes/public', isPublic: true },
    ],
  );
});

test('API discovery honors class Public independently of intervening source length', () => {
  assert.deepEqual(
    publicRoster(`
@Public()
@Controller('/public-class')
export class PublicController {
  constructor() { /* ${'legitimate constructor documentation '.repeat(30)} */ }
  @Get('/first')
  first() { return {}; }
  @Get('/second')
  second() { return {}; }
}
`),
    [
      { method: 'get', path: '/public-class/first', isPublic: true },
      { method: 'get', path: '/public-class/second', isPublic: true },
    ],
  );
});

test('API discovery does not turn documentation or another class Public into route authority', () => {
  assert.deepEqual(
    publicRoster(`
@Public()
@Controller('/public')
export class PublicController {
  @Get()
  open() { return {}; }
}
@Controller('/private')
export class PrivateController {
  // The @Public() example documents a different policy; this route is protected.
  @Get()
  privateRead() { return {}; }
}
`),
    [
      { method: 'get', path: '/private', isPublic: false },
      { method: 'get', path: '/public', isPublic: true },
    ],
  );
});

test('API discovery preserves PublicTenantRoute isolation and inline handler identity', () => {
  assert.deepEqual(
    discover(`
@Controller('/tenant')
export class TenantController {
  @PublicTenantRoute() @Get('/public') async publicRead() { return {}; }
  @Permission('tenant:read') @Get('/protected') async protectedRead() { return {}; }
}
`).map(({ method, path, operationId, isPublic }) => ({ method, path, operationId, isPublic })),
    [
      {
        method: 'get',
        path: '/tenant/protected',
        operationId: 'Tenant-get-tenant-protected-protectedRead',
        isPublic: false,
      },
      {
        method: 'get',
        path: '/tenant/public',
        operationId: 'Tenant-get-tenant-public-publicRead',
        isPublic: true,
      },
    ],
  );
});

test('API discovery ignores decorator-shaped comments and template text', () => {
  assert.deepEqual(
    publicRoster(
      "/* @Controller('/comment') @Get('/ghost') */\nconst text = `@Post('/ghost')`;\n@Controller('/real')\nexport class RealController {\n@Get()\nlist() { return []; }\n}\n",
    ),
    [{ method: 'get', path: '/real', isPublic: false }],
  );
});

test('API discovery resolves aliased route and public markers by their imported identities', () => {
  assert.deepEqual(
    publicRoster(`
import { Controller as Endpoint, Get as Read } from '@nestjs/common';
import { Public as Anonymous } from '@stynx-nyx/auth';
@Endpoint('/alias')
export class AliasController {
  @Anonymous() @Read() read() { return {}; }
}
`),
    [{ method: 'get', path: '/alias', isPublic: true }],
  );
});

test('API discovery expands every static path-array registration', () => {
  assert.deepEqual(
    publicRoster(`
@Controller(['/a', '/b'])
export class ArrayController {
  @Get(['first', 'second'])
  read() { return {}; }
}
`),
    ['/a/first', '/a/second', '/b/first', '/b/second'].map((path) => ({
      method: 'get',
      path,
      isPublic: false,
    })),
  );
});

test('API generation refuses unresolved ALL rather than losing its operation population', () => {
  discover(
    `
import { All } from '@nestjs/common';
@Controller('/all')
export class AllController {
  @All() all() { return {}; }
}
`,
    { refuse: true },
  );
});

test('API generation refuses computed registration values with source diagnostics', () => {
  discover(
    `
@Controller('/valid')
export class ComputedController {
  @Get(computePath()) read() { return {}; }
}
`,
    { refuse: true },
  );
});

test('API metadata preserves whole-body DTOs through renamed and namespace Body imports', () => {
  for (const parameter of [
    '@Payload() input: CreateFixtureDto',
    '@Nest.Body() input: CreateFixtureDto',
  ]) {
    const operations = discover(`
import { Body as Payload } from '@nestjs/common';
import * as Nest from '@nestjs/common';
export interface CreateFixtureDto { title: string; count: number; }
@Controller('/body')
export class BodyController {
  @Post() create(${parameter}) { return input; }
}
`);
    assert.equal(operations.length, 1);
    assert.deepEqual(operations[0].operation.requestBody, {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CreateFixtureDto' },
          'x-stynx-source-type': 'CreateFixtureDto',
          examples: { default: { value: { count: 1, title: 'example' } } },
        },
      },
    });
    assert.equal(operations[0].operation['x-stynx-no-request-body'], undefined);
  }
});

test('API metadata preserves whole-query object semantics through renamed and namespace Query imports', () => {
  for (const parameter of [
    '@Search() query: Record<string, unknown>',
    '@Nest.Query() query: Record<string, unknown>',
  ]) {
    const operations = discover(`
import { Query as Search } from '@nestjs/common';
import * as Nest from '@nestjs/common';
@Controller('/query')
export class QueryController {
  @Get() list(${parameter}) { return []; }
}
`);
    assert.equal(operations.length, 1);
    assert.equal(operations[0].operation['x-stynx-query-object'], true);
    assert.equal(operations[0].operation.requestBody, undefined);
    assert.equal(operations[0].operation.parameters, undefined);
  }
});

test('API metadata preserves named query parameters through renamed and namespace Query imports', () => {
  const operations = discover(`
import { Query as Search } from '@nestjs/common';
import * as Nest from '@nestjs/common';
@Controller('/query')
export class QueryController {
  @Get() list(@Search('limit') limit?: number, @Nest.Query('cursor') cursor?: string) { return []; }
}
`);
  assert.equal(operations.length, 1);
  assert.deepEqual(
    operations[0].operation.parameters.map(({ name, in: location, required }) => ({
      name,
      location,
      required,
    })),
    [
      { name: 'cursor', location: 'query', required: false },
      { name: 'limit', location: 'query', required: false },
    ],
  );
  assert.equal(operations[0].operation['x-stynx-query-object'], undefined);
  assert.equal(operations[0].operation.requestBody, undefined);
});

test('API discovery refuses bare public/auth factory decorators rather than inventing metadata', () => {
  for (const decoration of ['@Public', '@Permission', '@PublicTenantRoute']) {
    discover(
      `
@Controller('/factory')
export class FactoryController {
  ${decoration}
  @Get() read() { return {}; }
}
`,
      { refuse: true },
    );
  }
});

test('API discovery refuses an untrusted decorator import sharing a public factory name', () => {
  discover(
    `
import { Public as HostPublic } from './untrusted-host';
@Controller('/untrusted')
export class UntrustedController {
  @HostPublic()
  @Get() read() { return {}; }
}
`,
    { refuse: true },
  );
});
