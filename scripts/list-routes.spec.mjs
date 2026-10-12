import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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

const requireFromBackend = createRequire(
  new URL('../packages/backend/package.json', import.meta.url),
);

test('namespace and named-alias controller options retain actual Nest version and lifetime identities', async () => {
  const { parseNestControllerDeclarations } = await import('./lib/nest-route-declarations.mjs');
  const Nest = requireFromBackend('@nestjs/common');
  const constants = requireFromBackend('@nestjs/common/constants');
  class RuntimeController {}
  Nest.Controller({
    path: ['/one', '/two'],
    version: [Nest.VERSION_NEUTRAL, '2'],
    host: ['first.example.test', 'second.example.test'],
    scope: Nest.Scope.REQUEST,
    durable: true,
  })(RuntimeController);
  assert.deepEqual(Reflect.getMetadata(constants.PATH_METADATA, RuntimeController), [
    '/one',
    '/two',
  ]);
  assert.deepEqual(Reflect.getMetadata(constants.VERSION_METADATA, RuntimeController), [
    Nest.VERSION_NEUTRAL,
    '2',
  ]);
  assert.deepEqual(Reflect.getMetadata(constants.SCOPE_OPTIONS_METADATA, RuntimeController), {
    scope: Nest.Scope.REQUEST,
    durable: true,
  });
  const expected = {
    version: [{ symbol: 'VERSION_NEUTRAL', importSource: '@nestjs/common' }, '2'],
    host: ['first.example.test', 'second.example.test'],
    scope: { symbol: 'Scope.REQUEST', importSource: '@nestjs/common' },
    durable: true,
  };
  for (const [imports, neutral, scope] of [
    ["import * as Nest from '@nestjs/common';", 'Nest.VERSION_NEUTRAL', 'Nest.Scope.REQUEST'],
    [
      "import { Controller as Endpoint, Get as Read, VERSION_NEUTRAL as Neutral, Scope as Lifetime } from '@nestjs/common';",
      'Neutral',
      'Lifetime.REQUEST',
    ],
  ]) {
    const namespace = neutral.startsWith('Nest.');
    const declarations = parseNestControllerDeclarations(
      `${imports}
@${namespace ? 'Nest.Controller' : 'Endpoint'}({path:['/one','/two'],version:[${neutral},'2'],host:['first.example.test','second.example.test'],scope:${scope},durable:true})
class OptionsController { @${namespace ? 'Nest.Get' : 'Read'}() read() {} }`,
      { file: 'options.controller.ts' },
    );
    assert.deepEqual(declarations[0].paths, ['/one', '/two']);
    assert.deepEqual(declarations[0].options, expected);
    assert.deepEqual(declarations[0].methods[0].registrations, [{ method: 'GET', path: '' }]);
  }
});

for (const [name, options] of [
  ['boolean version', 'version:true'],
  ['mixed boolean version array', "version:['1',false]"],
  ['nested version array', "version:[['1']]"],
  ['boolean host', 'host:false'],
  ['mixed boolean host array', "host:['example.test',true]"],
  ['string scope', "scope:'REQUEST'"],
  ['scope array', 'scope:[Scope.REQUEST]'],
  ['string durable flag', "durable:'true'"],
  ['durable flag array', 'durable:[true]'],
  ['scope symbol in version', 'version:Scope.REQUEST'],
  ['version symbol in scope', 'scope:VERSION_NEUTRAL'],
  ['version symbol in host', 'host:VERSION_NEUTRAL'],
]) {
  test(`controller declaration refuses invalid ${name} instead of certifying malformed selector metadata`, async () => {
    const { parseNestControllerDeclarations } = await import('./lib/nest-route-declarations.mjs');
    assert.throws(
      () =>
        parseNestControllerDeclarations(
          `import {Controller,Get,Scope,VERSION_NEUTRAL} from '@nestjs/common';
@Controller({path:'/typed',${options}}) class TypedController { @Get() read() {} }`,
          { file: 'typed-options.controller.ts' },
        ),
      /typed-options\.controller\.ts:\d+:\d+:.*(?:option|version|host|scope|durable)/iu,
    );
  });
}

test('namespace option support does not accept lookalike neutral or scope imports', async () => {
  const { parseNestControllerDeclarations } = await import('./lib/nest-route-declarations.mjs');
  for (const expression of ['Other.VERSION_NEUTRAL', 'Other.Scope.REQUEST']) {
    assert.throws(
      () =>
        parseNestControllerDeclarations(
          `import {Controller,Get} from '@nestjs/common'; import * as Other from './untrusted';
@Controller({path:'/origin',${expression.includes('VERSION') ? 'version' : 'scope'}:${expression}})
class OriginController { @Get() read() {} }`,
          { file: 'origin.controller.ts' },
        ),
      /origin\.controller\.ts:\d+:\d+:.*(?:unsupported|unresolved|origin)/iu,
    );
  }
});

// Bounded source admission may refuse an unresolved factory or HTTP shape.
// It must never return a successful census silently omitting its registration.
async function assertDeclaredOrRefused(source, expected, file) {
  const { parseNestControllerDeclarations } = await import('./lib/nest-route-declarations.mjs');
  let declarations;
  try {
    declarations = parseNestControllerDeclarations(source, { file });
  } catch (error) {
    assert.match(error.message, new RegExp(`${file.replaceAll('.', '\\.')}:\\d+:\\d+:`, 'u'));
    assert.match(error.message, /unsupported|unresolved|unknown|refus/iu);
    return;
  }
  assert.deepEqual(
    declarations.flatMap((controller) =>
      controller.methods.flatMap((method) =>
        method.registrations.map((registration) => ({
          controller: controller.name,
          handler: method.name,
          ...registration,
        })),
      ),
    ),
    expected,
  );
}

for (const [name, imports, decorators] of [
  [
    'local controller factory alias',
    "import {Controller,Get} from '@nestjs/common'; const Endpoint=Controller;",
    "@Endpoint('/factory') class FactoryController { @Get('item') read() {} }",
  ],
  [
    'local route factory alias',
    "import {Controller,Get} from '@nestjs/common'; const Read=Get;",
    "@Controller('/factory') class FactoryController { @Read('item') read() {} }",
  ],
  [
    'parenthesized controller factory',
    "import {Controller,Get} from '@nestjs/common';",
    "@(Controller)('/factory') class FactoryController { @Get('item') read() {} }",
  ],
  [
    'namespace element controller factory',
    "import * as Nest from '@nestjs/common';",
    "@(Nest['Controller'])('/factory') class FactoryController { @Nest.Get('item') read() {} }",
  ],
  [
    'namespace element route factory',
    "import * as Nest from '@nestjs/common';",
    "@Nest.Controller('/factory') class FactoryController { @(Nest['Get'])('item') read() {} }",
  ],
]) {
  test(`declaration discovery admits or explicitly refuses ${name} without dropping routes`, async () => {
    await assertDeclaredOrRefused(
      `${imports}\n${decorators}`,
      [{ controller: 'FactoryController', handler: 'read', method: 'GET', path: 'item' }],
      'factory.controller.ts',
    );
  });
}

for (const [decorator, method] of [
  ['QueryMethod', 'QUERY'],
  ['Propfind', 'PROPFIND'],
  ['Proppatch', 'PROPPATCH'],
  ['Mkcol', 'MKCOL'],
  ['Copy', 'COPY'],
  ['Move', 'MOVE'],
  ['Lock', 'LOCK'],
  ['Unlock', 'UNLOCK'],
]) {
  test(`installed Nest ${decorator} registration is represented or explicitly refused`, async () => {
    const Nest = requireFromBackend('@nestjs/common');
    const constants = requireFromBackend('@nestjs/common/constants');
    class RuntimeController {
      read() {}
    }
    Nest[decorator]('item')(
      RuntimeController.prototype,
      'read',
      Object.getOwnPropertyDescriptor(RuntimeController.prototype, 'read'),
    );
    assert.equal(
      Reflect.getMetadata(constants.METHOD_METADATA, RuntimeController.prototype.read),
      Nest.RequestMethod[method],
    );
    await assertDeclaredOrRefused(
      `import {Controller,${decorator}} from '@nestjs/common';
@Controller('/verbs') class VerbsController { @${decorator}('item') read() {} }`,
      [{ controller: 'VerbsController', handler: 'read', method, path: 'item' }],
      'verbs.controller.ts',
    );
  });
}

test('generic Nest RequestMapping is represented or refused rather than silently excluded', async () => {
  await assertDeclaredOrRefused(
    `import {Controller,RequestMapping,RequestMethod} from '@nestjs/common';
@Controller('/generic') class GenericController {
 @RequestMapping({path:'item',method:RequestMethod.POST}) write() {}
}`,
    [{ controller: 'GenericController', handler: 'write', method: 'POST', path: 'item' }],
    'generic.controller.ts',
  );
});
