import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolveTestImport } from './support/esm-test-imports.mjs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { captureNestHttpRuntime } from '../../scripts/lib/http-runtime-census.mjs';

const root = resolve(import.meta.dirname, '../..');
const source = 'test/scripts/http-runtime-census.test.mjs';
const runtimeAnchor = join(root, 'packages/flow/package.json');
const resolveRuntime = (specifier) => resolveTestImport(specifier, runtimeAnchor);
await import(resolveRuntime('reflect-metadata'));
const {
  Controller,
  Delete,
  Get,
  Head,
  Header,
  Module,
  Options,
  Patch,
  Post,
  Version,
  VersioningType,
  VERSION_NEUTRAL,
} = (await import(resolveRuntime('@nestjs/common'))).default;
const { NestFactory } = (await import(resolveRuntime('@nestjs/core'))).default;
const adapterAnchor = resolveRuntime('@nestjs/platform-express');
const { ExpressAdapter } = (await import(adapterAnchor)).default;
const { default: express } = await import(resolveTestImport('express', adapterAnchor));
const { Permission, Public, PublicTenantRoute, ReadOnly, System } =
  await import(resolveRuntime('@stynx-nyx/auth'));
const sourceSha256 = createHash('sha256')
  .update(readFileSync(join(root, source)))
  .digest('hex');
const defaultConfiguration = {
  globalPrefix: '',
  globalPrefixOptions: {},
  versioning: null,
};

function decorate(controller, handler, ...decorators) {
  const descriptor = Object.getOwnPropertyDescriptor(controller.prototype, handler);
  for (const decorator of decorators) decorator(controller.prototype, handler, descriptor);
}
function binding(controller, overrides = {}) {
  return { controller, source, className: controller.name, sourceSha256, ...overrides };
}
async function application(controllers, configuration = defaultConfiguration, configure, routing) {
  class RuntimeFixtureModule {}
  Module({ controllers })(RuntimeFixtureModule);
  const instance = express();
  if (routing) {
    instance.set('case sensitive routing', routing.caseSensitive);
    instance.set('strict routing', routing.strict);
  }
  const app = await NestFactory.create(RuntimeFixtureModule, new ExpressAdapter(instance), {
    logger: false,
    abortOnError: false,
  });
  if (configuration.globalPrefix) {
    if (Object.keys(configuration.globalPrefixOptions).length)
      app.setGlobalPrefix(configuration.globalPrefix, configuration.globalPrefixOptions);
    else app.setGlobalPrefix(configuration.globalPrefix);
  }
  if (configuration.versioning) app.enableVersioning(configuration.versioning);
  if (configure) await configure(app);
  return app;
}
function capture(controllers, options = {}) {
  return captureNestHttpRuntime({
    createApplication: () => application(controllers),
    repoRoot: root,
    compositionId: 'inspector-real-runtime',
    bootstrapBinding: { source, sourceSha256 },
    expectedConfiguration: defaultConfiguration,
    controllerBindings: controllers.map((controller) => binding(controller)),
    ...options,
  });
}
async function endpoint(app, path, options = {}) {
  if (!app.getHttpServer().listening) await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  assert.ok(address && typeof address === 'object');
  return fetch(`http://127.0.0.1:${address.port}${path}`, options);
}
function roster(census) {
  return census.routes.map(({ method, path }) => `${method} ${path}`).sort();
}

class RuntimeBasicController {
  read() {
    return { origin: 'real-nest' };
  }
  create() {
    return { created: true };
  }
}
decorate(RuntimeBasicController, 'read', Get('item'), Permission('fixture:read'), ReadOnly());
decorate(RuntimeBasicController, 'create', Post('item'), System());
Controller('runtime')(RuntimeBasicController);

test('runtime census reconciles real Nest registrations and genuine HTTP outcomes', async () => {
  const { app, census } = await capture([RuntimeBasicController]);
  try {
    assert.equal(census.schemaVersion, '1.0.0');
    assert.equal(census.compositionId, 'inspector-real-runtime');
    assert.equal(census.registrationReconciled, true);
    assert.equal(census.complete, false);
    assert.deepEqual(census.assurance, {
      sourceBuild: 'UNVERIFIED',
      middlewareConfiguration: 'UNVERIFIED',
    });
    assert.deepEqual(census.routing, { caseSensitive: false, strict: false });
    assert.deepEqual(census.configuration, defaultConfiguration);
    assert.match(JSON.stringify(census.dependencies), /11\.2\.3/u);
    assert.match(JSON.stringify(census.dependencies), /5\.2\.1/u);
    assert.deepEqual(roster(census), ['GET /runtime/item', 'POST /runtime/item']);
    assert.equal(new Set(census.routes.map(({ id }) => id)).size, 2);
    for (const route of census.routes) {
      assert.equal(route.provenance, 'nest-registration');
      assert.deepEqual(route.mounted, {
        source,
        className: 'RuntimeBasicController',
        sourceSha256,
      });
      assert.equal(route.declaring.className, 'RuntimeBasicController');
      assert.equal(route.declaring.source, source);
      assert.equal(route.declaring.sourceSha256, sourceSha256);
    }
    const read = census.routes.find(({ method }) => method === 'GET');
    assert.equal(read.declaring.handler, 'read');
    assert.equal(read.metadata.permission, 'fixture:read');
    assert.equal(read.metadata.readOnly, true);
    assert.equal(read.metadata.public, false);
    assert.equal(census.routes.find(({ method }) => method === 'POST').metadata.system, true);
    const response = await endpoint(app, '/runtime/item');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { origin: 'real-nest' });
    assert.equal((await endpoint(app, '/unregistered')).status, 404);
  } finally {
    await app.close();
  }
});

class RuntimeVisibilityController {
  publicRoute() {}
  tenantRoute() {}
  privateRoute() {}
}
decorate(RuntimeVisibilityController, 'publicRoute', Get('public'), Public());
decorate(
  RuntimeVisibilityController,
  'tenantRoute',
  Get('tenant'),
  PublicTenantRoute({ optionalAuth: true }),
);
decorate(
  RuntimeVisibilityController,
  'privateRoute',
  Get('private'),
  Permission('fixture:private'),
);
Reflect.defineMetadata(
  Symbol('STYNX_PUBLIC_ROUTE'),
  true,
  RuntimeVisibilityController.prototype.privateRoute,
);
Controller('visibility')(RuntimeVisibilityController);
test('actual decorator identities preserve public-tenant metadata and reject lookalike Symbol authority', async () => {
  const { app, census } = await capture([RuntimeVisibilityController]);
  try {
    const routes = new Map(census.routes.map((route) => [route.declaring.handler, route]));
    assert.equal(routes.get('publicRoute').metadata.public, true);
    assert.equal(routes.get('tenantRoute').metadata.public, true);
    assert.deepEqual(routes.get('tenantRoute').metadata.publicTenant, { optionalAuth: true });
    assert.equal(routes.get('privateRoute').metadata.public, false);
    assert.equal(routes.get('privateRoute').metadata.permission, 'fixture:private');
  } finally {
    await app.close();
  }
});

class RuntimeInheritedBase {
  list() {
    return 'base-list';
  }
  get() {
    return 'base-get';
  }
  create() {}
  update() {}
  remove() {}
  restore() {}
  info() {
    return 'base-info';
  }
}
for (const [handler, decorator] of [
  ['list', Get('list')],
  ['get', Get('item/:id')],
  ['create', Post('item')],
  ['update', Patch('item/:id')],
  ['remove', Delete('item/:id')],
  ['restore', Post('item/:id/restore')],
  ['info', Get('info')],
])
  decorate(RuntimeInheritedBase, handler, decorator);
class RuntimeInheritedMount extends RuntimeInheritedBase {}
Controller('inherited')(RuntimeInheritedMount);
class RuntimeShadowMount extends RuntimeInheritedBase {
  list() {
    return 'undecorated-shadow';
  }
  get() {
    return 'mounted-override';
  }
}
decorate(RuntimeShadowMount, 'get', Get('own/:id'));
Controller('shadow')(RuntimeShadowMount);

test('all seven inherited registrations keep mounted and declaring constructors distinct', async () => {
  const { app, census } = await capture([RuntimeInheritedMount], {
    controllerBindings: [binding(RuntimeInheritedMount), binding(RuntimeInheritedBase)],
  });
  try {
    assert.equal(census.routes.length, 7);
    assert.deepEqual(census.routes.map(({ declaring }) => declaring.handler).sort(), [
      'create',
      'get',
      'info',
      'list',
      'remove',
      'restore',
      'update',
    ]);
    for (const route of census.routes) {
      assert.equal(route.mounted.className, 'RuntimeInheritedMount');
      assert.equal(route.declaring.className, 'RuntimeInheritedBase');
      assert.match(route.path, /^\/inherited(?:\/|$)/u);
    }
    assert.equal(await (await endpoint(app, '/inherited/list')).text(), 'base-list');
  } finally {
    await app.close();
  }
});

test('real Nest shadowing suppresses an undecorated inherited handler and rebinds an override', async () => {
  const { app, census } = await capture([RuntimeShadowMount], {
    controllerBindings: [binding(RuntimeShadowMount), binding(RuntimeInheritedBase)],
  });
  try {
    assert.equal(census.routes.length, 6);
    assert.equal(
      census.routes.some(({ declaring }) => declaring.handler === 'list'),
      false,
    );
    const override = census.routes.find(({ declaring }) => declaring.handler === 'get');
    assert.equal(override.path, '/shadow/own/:id');
    assert.equal(override.declaring.className, 'RuntimeShadowMount');
    assert.equal(
      census.routes.filter(({ declaring }) => declaring.className === 'RuntimeInheritedBase')
        .length,
      5,
    );
    assert.equal((await endpoint(app, '/shadow/list')).status, 404);
    assert.equal(await (await endpoint(app, '/shadow/own/123')).text(), 'mounted-override');
  } finally {
    await app.close();
  }
});

class RuntimeArrayController {
  paths() {
    return 'array-product';
  }
}
decorate(RuntimeArrayController, 'paths', Get(['left', 'right']));
Controller(['alpha', 'beta'])(RuntimeArrayController);
test('controller and handler path arrays retain their complete real registration product', async () => {
  const { app, census } = await capture([RuntimeArrayController]);
  try {
    assert.deepEqual(roster(census), [
      'GET /alpha/left',
      'GET /alpha/right',
      'GET /beta/left',
      'GET /beta/right',
    ]);
    for (const route of census.routes) {
      assert.equal((await endpoint(app, route.path)).status, 200);
    }
  } finally {
    await app.close();
  }
});

class RuntimeDuplicateController {
  first() {}
  second() {}
}
decorate(RuntimeDuplicateController, 'first', Get('same'));
decorate(RuntimeDuplicateController, 'second', Get('same'));
Controller('duplicate')(RuntimeDuplicateController);
test('duplicate real method/path registrations refuse rather than collapse a handler', async () => {
  await assert.rejects(capture([RuntimeDuplicateController]), /collision/iu);
});
class RuntimeParameterCollisionController {
  byId() {}
  byName() {}
}
decorate(RuntimeParameterCollisionController, 'byId', Get(':id'));
decorate(RuntimeParameterCollisionController, 'byName', Get(':name'));
Controller('parameter-collision')(RuntimeParameterCollisionController);
test('equivalent parameter-shaped registrations refuse their real dispatch collision', async () => {
  await assert.rejects(capture([RuntimeParameterCollisionController]), /collision/iu);
});
class RuntimeUnboundController {
  dynamic() {}
}
decorate(RuntimeUnboundController, 'dynamic', Get('dynamic'));
Controller('unbound')(RuntimeUnboundController);
test('an actual mounted dynamic controller without reviewed binding refuses', async () => {
  await assert.rejects(
    capture([RuntimeBasicController, RuntimeUnboundController], {
      controllerBindings: [binding(RuntimeBasicController)],
    }),
    /binding/iu,
  );
});
test('an inherited declaring constructor requires its independent binding', async () => {
  await assert.rejects(capture([RuntimeInheritedMount]), /binding/iu);
});

class RuntimeUriVersionController {
  versioned() {
    return 'versioned';
  }
  neutral() {
    return 'neutral';
  }
}
decorate(RuntimeUriVersionController, 'versioned', Get(['left', 'right']), Version(['1', '2']));
decorate(RuntimeUriVersionController, 'neutral', Get('neutral'), Version(VERSION_NEUTRAL));
Controller('versions')(RuntimeUriVersionController);
test('global prefix and URI version selectors match genuine runtime paths including neutral', async () => {
  const configuration = {
    globalPrefix: 'api',
    globalPrefixOptions: {},
    versioning: { type: VersioningType.URI, defaultVersion: '1' },
  };
  const { app, census } = await capture([RuntimeUriVersionController], {
    expectedConfiguration: configuration,
    createApplication: () => application([RuntimeUriVersionController], configuration),
  });
  try {
    assert.deepEqual(roster(census), [
      'GET /api/v1/versions/left',
      'GET /api/v1/versions/right',
      'GET /api/v2/versions/left',
      'GET /api/v2/versions/right',
      'GET /api/versions/neutral',
    ]);
    assert.equal((await endpoint(app, '/api/v2/versions/right')).status, 200);
    assert.equal((await endpoint(app, '/api/versions/neutral')).status, 200);
    assert.equal((await endpoint(app, '/versions/left')).status, 404);
  } finally {
    await app.close();
  }
});
for (const [name, versioning] of [
  ['header', { type: VersioningType.HEADER, header: 'x-api-version' }],
  ['media', { type: VersioningType.MEDIA_TYPE, key: 'v=' }],
  ['custom', { type: VersioningType.CUSTOM, extractor: () => '1' }],
]) {
  test(`unsupported ${name} selectors explicitly refuse without silently emitting an incomplete census`, async () => {
    const configuration = { ...defaultConfiguration, versioning };
    await assert.rejects(
      capture([RuntimeBasicController], {
        expectedConfiguration: configuration,
        createApplication: () => application([RuntimeBasicController], configuration),
      }),
      /unsupported|configuration/iu,
    );
  });
}
class RuntimeHostController {
  read() {}
}
decorate(RuntimeHostController, 'read', Get('read'));
Controller({ path: 'host', host: 'fixture.example.test' })(RuntimeHostController);
test('unsupported host selectors explicitly refuse instead of claiming unrestricted paths', async () => {
  await assert.rejects(capture([RuntimeHostController]), /unsupported/iu);
});

class RuntimeMethodsController {
  head() {}
  read() {
    return 'read';
  }
  options() {
    return 'explicit-options';
  }
}
decorate(RuntimeMethodsController, 'head', Head('explicit-head'));
decorate(RuntimeMethodsController, 'read', Get('get'));
decorate(RuntimeMethodsController, 'options', Options('explicit-options'));
Controller('methods')(RuntimeMethodsController);
test('explicit HEAD and OPTIONS keep Nest provenance while GET fallback HEAD stays separate', async () => {
  const { app, census } = await capture([RuntimeMethodsController]);
  try {
    assert.deepEqual(roster(census), [
      'GET /methods/get',
      'HEAD /methods/explicit-head',
      'OPTIONS /methods/explicit-options',
    ]);
    const get = census.routes.find(({ method }) => method === 'GET');
    assert.deepEqual(census.implicitHead, [
      {
        method: 'HEAD',
        path: '/methods/get',
        fallbackRouteId: get.id,
        provenance: 'express-get-fallback',
        samePatternEffective: true,
        reachability: 'UNKNOWN',
      },
    ]);
    assert.equal((await endpoint(app, '/methods/get', { method: 'HEAD' })).status, 200);
    assert.equal((await endpoint(app, '/methods/explicit-head', { method: 'HEAD' })).status, 200);
    const options = await endpoint(app, '/methods/explicit-options', { method: 'OPTIONS' });
    assert.equal(options.status, 200);
    assert.equal(await options.text(), 'explicit-options');
    assert.equal(census.options.reachability, 'UNKNOWN');
  } finally {
    await app.close();
  }
});
test('CORS middleware does not turn unprobed OPTIONS reachability into a false PASS', async () => {
  const { app, census } = await capture([RuntimeBasicController], {
    createApplication: () =>
      application([RuntimeBasicController], defaultConfiguration, (app) => {
        app.enableCors();
      }),
  });
  try {
    assert.equal(census.options.reachability, 'UNKNOWN');
    assert.equal(
      census.routes.some(({ method }) => method === 'OPTIONS'),
      false,
    );
  } finally {
    await app.close();
  }
});

test('real adapter routes without Nest controller provenance refuse reconciliation', async () => {
  await assert.rejects(
    capture([RuntimeBasicController], {
      createApplication: () =>
        application([RuntimeBasicController], defaultConfiguration, (app) => {
          app.getHttpAdapter().get('/adapter-only', (_request, response) => response.send('extra'));
        }),
    }),
    /adapter|collision|registration/iu,
  );
});
for (const [name, mutate] of [
  [
    'missing stack',
    (instance) => {
      instance.router.stack = undefined;
    },
  ],
  [
    'unsupported route shape',
    (instance) => {
      const layer = instance.router.stack.find((entry) => entry.route);
      layer.route.methods = null;
    },
  ],
]) {
  test(`actual Express ${name} refuses instead of producing an empty green census`, async () => {
    await assert.rejects(
      capture([RuntimeBasicController], {
        createApplication: () =>
          application([RuntimeBasicController], defaultConfiguration, (app) => {
            // Deliberate negative adapter witness after real Nest registration. The
            // original initializer still executes; no handler/provider is replaced.
            // NestFactory's proxy ignores assignment. Define the call-through
            // on the actual target and preserve its original method receiver.
            const initialize = Object.getPrototypeOf(app).init;
            Object.defineProperty(app, 'init', {
              configurable: true,
              value: async function (...args) {
                const initialized = await Reflect.apply(initialize, this, args);
                mutate(this.getHttpAdapter().getInstance());
                return initialized;
              },
            });
          }),
      }),
      /adapter|unsupported/iu,
    );
  });
}
test('configuration drift refuses when actual bootstrap prefix differs from its reviewed binding', async () => {
  await assert.rejects(
    capture([RuntimeBasicController], {
      createApplication: () =>
        application([RuntimeBasicController], {
          ...defaultConfiguration,
          globalPrefix: 'unexpected-prefix',
        }),
    }),
    /configuration/iu,
  );
});
test('stale controller and bootstrap source hashes each refuse before claiming candidate custody', async () => {
  await assert.rejects(
    capture([RuntimeBasicController], {
      controllerBindings: [binding(RuntimeBasicController, { sourceSha256: '0'.repeat(64) })],
    }),
    /source|binding/iu,
  );
  await assert.rejects(
    capture([RuntimeBasicController], {
      bootstrapBinding: { source, sourceSha256: '0'.repeat(64) },
    }),
    /source|binding/iu,
  );
});
test('constructor identity must match its reviewed source class binding', async () => {
  await assert.rejects(
    capture([RuntimeBasicController], {
      controllerBindings: [binding(RuntimeBasicController, { className: 'DifferentController' })],
    }),
    /source|binding/iu,
  );
});
class RuntimeSourceDriftController {
  read() {}
}
decorate(RuntimeSourceDriftController, 'read', Get('read'));
Controller('source-drift')(RuntimeSourceDriftController);
test('source changes during actual application creation refuse the second custody check', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'stynx runtime ç-'));
  const fixtureSource = 'controller.mjs';
  const content = 'class RuntimeSourceDriftController { read() {} }\n';
  const digest = createHash('sha256').update(content).digest('hex');
  writeFileSync(join(fixture, fixtureSource), content);
  let created;
  let closeCalls = 0;
  try {
    await assert.rejects(
      capture([RuntimeSourceDriftController], {
        repoRoot: fixture,
        bootstrapBinding: { source: fixtureSource, sourceSha256: digest },
        controllerBindings: [
          binding(RuntimeSourceDriftController, {
            source: fixtureSource,
            sourceSha256: digest,
          }),
        ],
        createApplication: async () => {
          created = await application([RuntimeSourceDriftController]);
          const close = Object.getPrototypeOf(created).close;
          Object.defineProperty(created, 'close', {
            configurable: true,
            value: async function (...args) {
              closeCalls += 1;
              return Reflect.apply(close, this, args);
            },
          });
          writeFileSync(
            join(fixture, fixtureSource),
            content + '// changed after capture admission\n',
          );
          return created;
        },
      }),
      /source|binding/iu,
    );
    assert.equal(closeCalls, 1, 'failed capture must close its actual created app');
  } finally {
    await created?.close();
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('failed cleanup preserves both the original refusal and actual cleanup failure, then releases capture', async () => {
  let created;
  const cleanupFailure = new Error('INSPECTOR_CLEANUP_FAILURE');
  try {
    await assert.rejects(
      capture([RuntimeUnboundController], {
        controllerBindings: [],
        createApplication: async () => {
          created = await application([RuntimeUnboundController]);
          const close = Object.getPrototypeOf(created).close;
          Object.defineProperty(created, 'close', {
            configurable: true,
            value: async function (...args) {
              // Real cleanup executes first. Only its reported failure is injected.
              await Reflect.apply(close, this, args);
              throw cleanupFailure;
            },
          });
          return created;
        },
      }),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.equal(error.errors.length, 2);
        assert.match(error.errors[0].message, /binding/iu);
        assert.equal(error.errors[1], cleanupFailure);
        return true;
      },
    );
    const next = await capture([RuntimeBasicController]);
    try {
      assert.equal(next.census.registrationReconciled, true);
      assert.deepEqual(roster(next.census), ['GET /runtime/item', 'POST /runtime/item']);
    } finally {
      await next.app.close();
    }
  } finally {
    if (created) {
      Object.defineProperty(created, 'close', {
        configurable: true,
        value: Object.getPrototypeOf(created).close,
      });
      await created.close();
    }
  }
});
class RuntimePortableController {
  read() {}
}
decorate(RuntimePortableController, 'read', Get('read'));
Controller('portable')(RuntimePortableController);
test('a literal dot-dot filename inside a spaces and non-ASCII repository remains portable', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'stynx runtime portable ç-'));
  const fixtureSource = '..named-controller ç.mjs';
  const content = RuntimePortableController.toString() + '\n';
  const digest = createHash('sha256').update(content).digest('hex');
  writeFileSync(join(fixture, fixtureSource), content);
  let result;
  try {
    result = await capture([RuntimePortableController], {
      repoRoot: fixture,
      bootstrapBinding: { source: fixtureSource, sourceSha256: digest },
      controllerBindings: [
        binding(RuntimePortableController, { source: fixtureSource, sourceSha256: digest }),
      ],
    });
    assert.deepEqual(roster(result.census), ['GET /portable/read']);
    assert.equal(result.census.routes[0].mounted.source, fixtureSource);
  } finally {
    await result?.app.close();
    rmSync(fixture, { recursive: true, force: true });
  }
});
test('actual parent-directory escape remains forbidden despite literal dot-dot filename support', async () => {
  await assert.rejects(
    capture([RuntimeBasicController], {
      controllerBindings: [
        binding(RuntimeBasicController, { source: '../escaped-controller.mjs' }),
      ],
    }),
    /source|binding|escape/iu,
  );
});

test('adapter inner handler method must agree with its registered route and actual HTTP dispatch', async () => {
  let created;
  let observedStatus;
  try {
    await assert.rejects(
      capture([RuntimeBasicController], {
        createApplication: async () => {
          created = await application([RuntimeBasicController]);
          const initialize = Object.getPrototypeOf(created).init;
          Object.defineProperty(created, 'init', {
            configurable: true,
            value: async function (...args) {
              const initialized = await Reflect.apply(initialize, this, args);
              const layer = this.getHttpAdapter()
                .getInstance()
                .router.stack.find((entry) => entry.route?.methods.get);
              // Preserve actual path, outer methods and callback identity while
              // breaking Express's inner dispatch method. GET must now be 404.
              layer.route.stack[0].method = 'post';
              observedStatus = (await endpoint(created, '/runtime/item')).status;
              assert.equal(observedStatus, 404);
              return initialized;
            },
          });
          return created;
        },
      }),
      /adapter|unsupported/iu,
    );
  } finally {
    await created?.close();
  }
});

function afterInitialization(app, observe) {
  const initialize = Object.getPrototypeOf(app).init;
  Object.defineProperty(app, 'init', {
    configurable: true,
    value: async function (...args) {
      const initialized = await Reflect.apply(initialize, this, args);
      await observe();
      return initialized;
    },
  });
}
class RuntimeGetBeforeHeadController {
  get() {}
  head() {}
}
decorate(RuntimeGetBeforeHeadController, 'get', Get('same'), Header('x-handler-origin', 'get'));
decorate(RuntimeGetBeforeHeadController, 'head', Head('same'), Header('x-handler-origin', 'head'));
Controller('head-shadow')(RuntimeGetBeforeHeadController);
test('GET registered before explicit HEAD refuses the real Express HEAD shadow', async () => {
  let created;
  try {
    await assert.rejects(
      capture([RuntimeGetBeforeHeadController], {
        createApplication: async () => {
          created = await application([RuntimeGetBeforeHeadController]);
          afterInitialization(created, async () => {
            const response = await endpoint(created, '/head-shadow/same', { method: 'HEAD' });
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('x-handler-origin'), 'get');
          });
          return created;
        },
      }),
      /collision|shadow|unsupported/iu,
    );
  } finally {
    await created?.close();
  }
});
class RuntimeCaseCollisionController {
  upper() {
    return 'upper';
  }
  lower() {
    return 'lower';
  }
}
decorate(RuntimeCaseCollisionController, 'upper', Get('Foo'));
decorate(RuntimeCaseCollisionController, 'lower', Get('foo'));
Controller('case-collision')(RuntimeCaseCollisionController);
test('case-insensitive Express route collisions cannot produce two independently reachable registrations', async () => {
  let created;
  try {
    await assert.rejects(
      capture([RuntimeCaseCollisionController], {
        createApplication: async () => {
          created = await application([RuntimeCaseCollisionController]);
          afterInitialization(created, async () => {
            const response = await endpoint(created, '/case-collision/foo');
            assert.equal(response.status, 200);
            assert.equal(await response.text(), 'upper');
          });
          return created;
        },
      }),
      /collision|unsupported/iu,
    );
  } finally {
    await created?.close();
  }
});
test('terminating mounted middleware without reviewed provenance refuses an incomplete HTTP census', async () => {
  let created;
  try {
    await assert.rejects(
      capture([RuntimeBasicController], {
        createApplication: async () => {
          created = await application([RuntimeBasicController], defaultConfiguration, (app) => {
            app.use('/hidden', (_request, response) => response.json({ origin: 'middleware' }));
          });
          afterInitialization(created, async () => {
            const response = await endpoint(created, '/hidden');
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), { origin: 'middleware' });
          });
          return created;
        },
      }),
      /middleware|unsupported|adapter/iu,
    );
  } finally {
    await created?.close();
  }
});

test('reviewed case-sensitive Express routing preserves Foo and foo as genuinely distinct routes', async () => {
  const { app, census } = await capture([RuntimeCaseCollisionController], {
    expectedRouting: { caseSensitive: true, strict: false },
    createApplication: () =>
      application([RuntimeCaseCollisionController], defaultConfiguration, undefined, {
        caseSensitive: true,
        strict: false,
      }),
  });
  try {
    assert.deepEqual(census.routing, { caseSensitive: true, strict: false });
    assert.deepEqual(roster(census), ['GET /case-collision/Foo', 'GET /case-collision/foo']);
    assert.equal(await (await endpoint(app, '/case-collision/Foo')).text(), 'upper');
    assert.equal(await (await endpoint(app, '/case-collision/foo')).text(), 'lower');
  } finally {
    await app.close();
  }
});
test('unreviewed actual Express routing configuration refuses an otherwise valid registration', async () => {
  await assert.rejects(
    capture([RuntimeBasicController], {
      createApplication: () =>
        application([RuntimeBasicController], defaultConfiguration, undefined, {
          caseSensitive: true,
          strict: false,
        }),
    }),
    /routing|configuration|binding/iu,
  );
});
class RuntimeHeadBeforeGetController {
  head() {}
  get() {}
}
decorate(RuntimeHeadBeforeGetController, 'head', Head('same'), Header('x-handler-origin', 'head'));
decorate(RuntimeHeadBeforeGetController, 'get', Get('same'), Header('x-handler-origin', 'get'));
Controller('head-first')(RuntimeHeadBeforeGetController);
test('earlier explicit HEAD keeps provenance and records the GET fallback as shadowed', async () => {
  const { app, census } = await capture([RuntimeHeadBeforeGetController]);
  try {
    assert.deepEqual(roster(census), ['GET /head-first/same', 'HEAD /head-first/same']);
    const get = census.routes.find(({ method }) => method === 'GET');
    const head = census.routes.find(({ method }) => method === 'HEAD');
    assert.deepEqual(census.implicitHead, [
      {
        method: 'HEAD',
        path: '/head-first/same',
        fallbackRouteId: get.id,
        provenance: 'express-get-fallback',
        samePatternEffective: false,
        reachability: 'UNKNOWN',
        shadowedByRouteId: head.id,
      },
    ]);
    const headResponse = await endpoint(app, '/head-first/same', { method: 'HEAD' });
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get('x-handler-origin'), 'head');
    assert.equal((await endpoint(app, '/head-first/same')).headers.get('x-handler-origin'), 'get');
  } finally {
    await app.close();
  }
});

class RuntimeHeadPatternOverlapController {
  parameterHead() {}
  fixedGet() {
    return 'fixed-get';
  }
}
decorate(
  RuntimeHeadPatternOverlapController,
  'parameterHead',
  Head(':id'),
  Header('x-handler-origin', 'parameter-head'),
);
decorate(
  RuntimeHeadPatternOverlapController,
  'fixedGet',
  Get('fixed'),
  Header('x-handler-origin', 'fixed-get'),
);
Controller('head-overlap')(RuntimeHeadPatternOverlapController);
test('overlapping unequal HEAD patterns leave fallback reachability UNKNOWN despite same-pattern order', async () => {
  const { app, census } = await capture([RuntimeHeadPatternOverlapController]);
  try {
    const head = await endpoint(app, '/head-overlap/fixed', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('x-handler-origin'), 'parameter-head');
    const response = await endpoint(app, '/head-overlap/fixed');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-handler-origin'), 'fixed-get');
    assert.equal(await response.text(), 'fixed-get');
    const get = census.routes.find(({ method }) => method === 'GET');
    assert.deepEqual(census.implicitHead, [
      {
        method: 'HEAD',
        path: '/head-overlap/fixed',
        fallbackRouteId: get.id,
        provenance: 'express-get-fallback',
        samePatternEffective: true,
        reachability: 'UNKNOWN',
      },
    ]);
  } finally {
    await app.close();
  }
});

test('temporary router flag drift during real registration refuses even when final flags match', async () => {
  let created;
  try {
    await assert.rejects(
      capture([RuntimeBasicController], {
        expectedRouting: { caseSensitive: true, strict: false },
        createApplication: async () => {
          created = await application([RuntimeBasicController], defaultConfiguration, undefined, {
            caseSensitive: true,
            strict: false,
          });
          const initialize = Object.getPrototypeOf(created).init;
          Object.defineProperty(created, 'init', {
            configurable: true,
            value: async function (...args) {
              const router = this.getHttpAdapter().getInstance().router;
              router.caseSensitive = false;
              const initialized = await Reflect.apply(initialize, this, args);
              router.caseSensitive = true;
              // Existing layers preserve the registration-time false flag even
              // though the final router property claims true again.
              assert.equal((await endpoint(created, '/runtime/ITEM')).status, 200);
              return initialized;
            },
          });
          return created;
        },
      }),
      /routing|configuration|binding/iu,
    );
  } finally {
    await created?.close();
  }
});

test('an unreviewed adapter registration method override refuses even when it calls through', async () => {
  await assert.rejects(
    capture([RuntimeBasicController], {
      createApplication: () =>
        application([RuntimeBasicController], defaultConfiguration, (app) => {
          const adapter = app.getHttpAdapter();
          const register = adapter.get;
          // This explicit negative witness preserves real Nest registration;
          // executable method custody must still reject the unknown wrapper.
          adapter.get = function (...args) {
            return Reflect.apply(register, this, args);
          };
        }),
    }),
    /adapter|unsupported|registration/iu,
  );
});
