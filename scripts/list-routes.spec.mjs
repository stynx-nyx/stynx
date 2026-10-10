import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { collectRoutes, formatCsv, formatReport } from './list-routes.mjs';

function writeFixtureController(workspace) {
  const packageDir = join(workspace, 'packages', 'alpha');
  const srcDir = join(packageDir, 'src');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(
    join(packageDir, 'package.json'),
    `${JSON.stringify({ name: '@fixture/alpha' }, null, 2)}\n`,
  );
  writeFileSync(
    join(srcDir, 'alpha.controller.ts'),
    `
import { Controller, Get, Post } from '@nestjs/common';
import { Permission } from '@stynx-nyx/auth';
import { RateLimit } from '@stynx-nyx/ratelimit';

@Controller('/alpha')
export class AlphaController {
  @Permission('alpha:read')
  @Get()
  list() {
    return [];
  }

  @Post(':id')
  @RateLimit({
    bucket: 'tenant',
    scope: 'alpha.create',
  })
  @Permission('alpha:write')
  create() {
    return {};
  }
}
`,
  );
}

test('collectRoutes inventories controller base paths, method paths, permissions, and rate limits', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'stynx-list-routes-'));
  try {
    writeFixtureController(workspace);

    const routes = collectRoutes({ repoRoot: workspace });

    assert.deepEqual(
      routes.map((route) => [route.method, route.path]),
      [
        ['GET', '/alpha'],
        ['POST', '/alpha/:id'],
      ],
    );
    assert.deepEqual(
      routes.map((route) => route.permissions),
      ['alpha:read', 'alpha:write'],
    );
    assert.equal(routes[1].rateLimitClass, 'tenant:alpha.create');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('collectRoutes supports package and controller filters', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'stynx-list-routes-'));
  try {
    writeFixtureController(workspace);

    assert.equal(collectRoutes({ repoRoot: workspace, packageFilter: 'alpha' }).length, 2);
    assert.equal(
      collectRoutes({ repoRoot: workspace, controllerFilter: 'AlphaController' }).length,
      2,
    );
    assert.equal(collectRoutes({ repoRoot: workspace, packageFilter: 'beta' }).length, 0);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('formatters emit the W2 CSV and report shapes', () => {
  const routes = [
    {
      package: '@fixture/alpha',
      controller: 'AlphaController',
      method: 'GET',
      path: '/alpha',
      permissions: 'alpha:read',
      rateLimitClass: '',
    },
  ];

  assert.equal(
    formatCsv(routes),
    'package,controller,method,path,permissions,rate-limit-class\n@fixture/alpha,AlphaController,GET,/alpha,alpha:read,\n',
  );
  assert.match(formatReport(routes), /total-routes: 1\ncontrollers: 1\n/);
  assert.match(formatReport(routes), /@fixture\/alpha: 1\n/);
});

function writeSource(workspace, source) {
  const sourceDir = join(workspace, 'packages', 'alpha', 'src');
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(
    join(workspace, 'packages', 'alpha', 'package.json'),
    JSON.stringify({ name: '@fixture/alpha' }),
  );
  writeFileSync(
    join(sourceDir, 'alpha.controller.ts'),
    `import { Controller, Get, Post, Put, Patch, Delete, HttpCode } from '@nestjs/common';\nimport { NoIdempotent } from '@stynx-nyx/idempotency';\n${source}`,
  );
}

test('collectRoutes preserves all inline Preferences and SessionControl route declarations', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'stynx-list-routes-inline-'));
  try {
    writeSource(
      workspace,
      `
@Controller('profile')
export class PreferencesController {
  @Get() async profile() { return {}; }
  @Patch() @NoIdempotent() async patchProfile() { return {}; }
  @Get('preferences') async get() { return {}; }
  @Put('preferences') @NoIdempotent() async put() { return {}; }
  @Patch('preferences') @NoIdempotent() async patch() { return {}; }
  @Delete('preferences') @HttpCode(200) async reset() { return {}; }
  @Delete('preferences/:category') @HttpCode(200) async resetCategory() { return {}; }
}
@Controller('auth')
export class SessionControlController {
  @Get('sessions') async list() { return []; }
  @Delete('sessions/:sid') @HttpCode(200) async revoke() { return {}; }
  @Post('sessions/revoke-others') @NoIdempotent() @HttpCode(200) async others() { return {}; }
  @Post('sessions/logout-current') @NoIdempotent() @HttpCode(200) async logout() { return {}; }
  @Post('sessions/revoke-all') @NoIdempotent() @HttpCode(200) async all() { return {}; }
  @Get('session-operations/:operationId') async operation() { return {}; }
}
`,
    );
    const routes = collectRoutes({ repoRoot: workspace });
    assert.deepEqual(
      routes
        .map(({ controller, handler, method, path }) => ({ controller, handler, method, path }))
        .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
      [
        ['PreferencesController', 'profile', 'GET', '/profile'],
        ['PreferencesController', 'patchProfile', 'PATCH', '/profile'],
        ['PreferencesController', 'get', 'GET', '/profile/preferences'],
        ['PreferencesController', 'put', 'PUT', '/profile/preferences'],
        ['PreferencesController', 'patch', 'PATCH', '/profile/preferences'],
        ['PreferencesController', 'reset', 'DELETE', '/profile/preferences'],
        ['PreferencesController', 'resetCategory', 'DELETE', '/profile/preferences/:category'],
        ['SessionControlController', 'list', 'GET', '/auth/sessions'],
        ['SessionControlController', 'revoke', 'DELETE', '/auth/sessions/:sid'],
        ['SessionControlController', 'others', 'POST', '/auth/sessions/revoke-others'],
        ['SessionControlController', 'logout', 'POST', '/auth/sessions/logout-current'],
        ['SessionControlController', 'all', 'POST', '/auth/sessions/revoke-all'],
        ['SessionControlController', 'operation', 'GET', '/auth/session-operations/:operationId'],
      ]
        .map(([controller, handler, method, path]) => ({ controller, handler, method, path }))
        .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('collectRoutes excludes decorator-shaped documentation inside a template literal', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'stynx-list-routes-comments-'));
  try {
    writeSource(
      workspace,
      "const example = `\n@Controller('/ghost')\nexport class GhostController {\n@Get()\nlist() {}\n}\n`;\n@Controller('/real')\nexport class RealController {\n@Get()\nlist() { return []; }\n}\n",
    );
    assert.deepEqual(
      collectRoutes({ repoRoot: workspace }).map(({ controller, method, path }) => ({
        controller,
        method,
        path,
      })),
      [{ controller: 'RealController', method: 'GET', path: '/real' }],
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('collectRoutes resolves imported aliases and namespace metadata without changing CSV fields', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'stynx-list-routes-alias-'));
  try {
    writeSource(
      workspace,
      `
import { Controller as Endpoint, Get as Read } from '@nestjs/common';
import * as Authorization from '@stynx-nyx/auth';
@Endpoint('/aliased')
export class AliasedController {
  @Authorization.Permission('alias:read')
  @Authorization.ReadOnly()
  @Read(':id')
  async read() { return {}; }
}
`,
    );
    const routes = collectRoutes({ repoRoot: workspace });
    assert.deepEqual(
      routes.map(({ controller, handler, method, path, permissions }) => ({
        controller,
        handler,
        method,
        path,
        permissions,
      })),
      [
        {
          controller: 'AliasedController',
          handler: 'read',
          method: 'GET',
          path: '/aliased/:id',
          permissions: 'alias:read;readonly',
        },
      ],
    );
    assert.match(
      formatCsv(routes),
      /^package,controller,method,path,permissions,rate-limit-class\n/u,
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('collectRoutes includes every static controller and method path array registration', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'stynx-list-routes-arrays-'));
  try {
    writeSource(
      workspace,
      `
@Controller(['/first', '/second'])
export class ArraysController {
  @Get(['items', 'entries'])
  list() { return []; }
}
`,
    );
    assert.deepEqual(
      collectRoutes({ repoRoot: workspace }).map(({ method, path }) => ({ method, path })),
      ['/first/entries', '/first/items', '/second/entries', '/second/items'].map((path) => ({
        method: 'GET',
        path,
      })),
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('declaration metadata retains static controller selectors and explicit HEAD OPTIONS ALL methods', async () => {
  const { parseNestControllerDeclarations } = await import('./lib/nest-route-declarations.mjs');
  const declarations = parseNestControllerDeclarations(
    `
import * as Nest from '@nestjs/common';
@Nest.Controller({ path: ['/one', '/two'], version: ['1', '2'], host: 'tenant.example.test' })
export class SelectorsController {
  @Nest.Head('head') head() {}
  @Nest.Options('options') options() {}
  @Nest.All('all') all() {}
}
`,
    { file: 'selectors.controller.ts' },
  );
  assert.equal(declarations.length, 1);
  assert.deepEqual(declarations[0].paths, ['/one', '/two']);
  assert.deepEqual(declarations[0].options, { version: ['1', '2'], host: 'tenant.example.test' });
  assert.deepEqual(
    declarations[0].methods.flatMap(({ registrations }) => registrations),
    [
      { method: 'HEAD', path: 'head' },
      { method: 'OPTIONS', path: 'options' },
      { method: 'ALL', path: 'all' },
    ],
  );
});

test('declaration discovery refuses computed controller and method paths without executing source', async () => {
  const { parseNestControllerDeclarations } = await import('./lib/nest-route-declarations.mjs');
  for (const source of [
    "import { Controller, Get } from '@nestjs/common'; @Controller(computePath()) export class ComputedController { @Get() list() {} }",
    "import { Controller, Get } from '@nestjs/common'; @Controller('/valid') export class ComputedController { @Get(computePath()) list() {} }",
    "import { Controller, Get } from '@nestjs/common'; @Controller({path:'/valid',version: computeVersion()}) export class ComputedController { @Get() list() {} }",
  ]) {
    assert.throws(
      () => parseNestControllerDeclarations(source, { file: 'computed.controller.ts' }),
      /computed\.controller\.ts/u,
    );
  }
});
