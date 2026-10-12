import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

// ADR-PERF-0001: execute the actual private-app sources against explicit unit
// ports. This proves bootstrap orchestration, not the normal AppModule's HTTP
// population, source/build custody, storage admission or production readiness.
const root = resolve(import.meta.dirname, '../..');
const requireApi = createRequire(join(root, 'reference/api/package.json'));
const requireAdapter = createRequire(requireApi.resolve('@nestjs/platform-express'));
const express = requireAdapter('express');
const cors = requireAdapter('cors');
const ts = requireApi('typescript');
const protocol = 'stynx-reference-api-startup-v1';
const filenames = Object.fromEntries(
  ['bootstrap', 'main', 'security-headers'].map((name) => [
    name,
    join(root, `reference/api/src/${name}.ts`),
  ]),
);
const sources = Object.fromEntries(
  Object.entries(filenames).map(([name, filename]) => [name, readFileSync(filename, 'utf8')]),
);
const clone = (value) => JSON.parse(JSON.stringify(value));

function evaluate(name, load, processPort, consolePort) {
  const compiled = ts.transpileModule(sources[name], {
    fileName: filenames[name],
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(
    (compiled.diagnostics ?? []).filter(({ category }) => category === ts.DiagnosticCategory.Error),
    [],
  );
  const module = { exports: {} };
  runInNewContext(
    compiled.outputText,
    { exports: module.exports, module, require: load, process: processPort, console: consolePort },
    { filename: filenames[name] },
  );
  return module.exports;
}

function unitPorts(options = {}) {
  const events = [];
  const records = [];
  const output = { log: [], error: [] };
  const processPort = { env: { ...options.env }, exitCode: undefined };
  const consolePort = {
    log: (...values) => output.log.push(values),
    error: (...values) => output.error.push(values),
  };
  class ExplicitAppModuleUnitFixture {}
  const app = {
    use(middleware) {
      events.push('security');
      if (options.securityFailure) throw options.securityFailure;
      if (options.express) options.express.use(middleware);
    },
    enableCors(configuration) {
      events.push('cors');
      if (options.corsFailure) throw options.corsFailure;
      app.cors = clone(configuration);
      if (options.express) options.express.use(cors(configuration));
    },
    async listen(...arguments_) {
      events.push('listen');
      app.listenArguments = arguments_;
      if (options.listenFailure) throw options.listenFailure;
    },
    getHttpAdapter() {
      events.push('route-inspection');
      if (options.adapterFailure) throw options.adapterFailure;
      return {
        getInstance: () => ({
          router: {
            stack:
              options.stack ??
              ['/healthz', '/readyz', '/_reference/demo-tenants'].map((path) => ({
                route: { path, methods: { get: true } },
              })),
          },
        }),
      };
    },
  };
  const creation = [];
  const load = (specifier) => {
    events.push(`import:${specifier}`);
    if (options.importFailure?.specifier === specifier) throw options.importFailure.error;
    if (specifier === 'reflect-metadata') return {};
    if (specifier === '@nestjs/core') {
      return {
        NestFactory: {
          async create(...arguments_) {
            events.push('create');
            creation.push(arguments_);
            if (options.createFailure) throw options.createFailure;
            return app;
          },
        },
      };
    }
    if (specifier === './app.module.js') return { AppModule: ExplicitAppModuleUnitFixture };
    if (specifier === './security-headers.js') {
      return evaluate('security-headers', load, processPort, consolePort);
    }
    if (specifier === 'helmet') return requireApi('helmet');
    if (specifier === './bootstrap.js') return factory;
    throw new Error(`Unadmitted unit dependency: ${specifier}`);
  };
  const factory = evaluate('bootstrap', load, processPort, consolePort);
  return {
    events,
    records,
    output,
    app,
    creation,
    factory,
    load,
    processPort,
    consolePort,
    AppModuleUnitFixture: ExplicitAppModuleUnitFixture,
  };
}

const operations = (fixture) => fixture.events.filter((event) => !event.startsWith('import:'));
const corsDefaults = {
  origin: ['http://127.0.0.1:3100', 'http://localhost:3100'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'Idempotency-Key',
    'X-Request-Id',
    'X-Tenant-Id',
  ],
  exposedHeaders: ['X-Request-Id', 'X-Stynx-Auth-Verify-Ms'],
};

test('private factory preserves exact creation options and callback identity before security/CORS', async () => {
  const fixture = unitPorts();
  const app = await fixture.factory.createReferenceApplication({
    onNestCreated(created) {
      assert.equal(created, fixture.app);
      assert.deepEqual(operations(fixture), ['create']);
      fixture.events.push('callback');
    },
  });
  assert.equal(app, fixture.app);
  assert.equal(fixture.creation.length, 1);
  assert.equal(fixture.creation[0][0], fixture.AppModuleUnitFixture);
  assert.deepEqual(clone(fixture.creation[0][1]), { bufferLogs: true });
  assert.equal(fixture.creation[0].length, 2, 'default adapter creation must be preserved');
  assert.deepEqual(operations(fixture), ['create', 'callback', 'security', 'cors']);
  assert.deepEqual(app.cors, corsDefaults);
  assert.deepEqual(fixture.records, []);
  assert.deepEqual(fixture.output, { log: [], error: [] });
});

test('private factory has no automatic initialization, listener or startup protocol side effects', async () => {
  const fixture = unitPorts();
  assert.deepEqual(fixture.events, []);
  await fixture.factory.createReferenceApplication();
  assert.deepEqual(operations(fixture), ['create', 'security', 'cors']);
  assert.equal(fixture.app.listenArguments, undefined);
  assert.deepEqual(fixture.records, []);
  assert.deepEqual(fixture.output, { log: [], error: [] });
});

for (const [field, expectedOperations] of [
  ['createFailure', ['create']],
  ['securityFailure', ['create', 'callback', 'security']],
  ['corsFailure', ['create', 'callback', 'security', 'cors']],
]) {
  test(`private factory preserves original ${field} without advancing configuration`, async () => {
    const failure = new Error(`explicit unit ${field}`);
    const fixture = unitPorts({ [field]: failure });
    await assert.rejects(
      fixture.factory.createReferenceApplication({
        onNestCreated: () => fixture.events.push('callback'),
      }),
      (error) => error === failure,
    );
    assert.deepEqual(operations(fixture), expectedOperations);
    assert.equal(fixture.app.listenArguments, undefined);
  });
}

test('private factory propagates callback failure before installing any application middleware', async () => {
  const failure = new Error('explicit callback refusal');
  const fixture = unitPorts();
  await assert.rejects(
    fixture.factory.createReferenceApplication({
      onNestCreated() {
        fixture.events.push('callback');
        throw failure;
      },
    }),
    (error) => error === failure,
  );
  assert.deepEqual(operations(fixture), ['create', 'callback']);
  assert.equal(fixture.app.listenArguments, undefined);
});

for (const specifier of ['@nestjs/core', './app.module.js', './security-headers.js']) {
  test(`private factory preserves ${specifier} import refusal before creating an application`, async () => {
    const error = new Error('explicit module import refusal');
    const fixture = unitPorts({ importFailure: { specifier, error } });
    await assert.rejects(
      fixture.factory.createReferenceApplication(),
      (caught) => caught === error,
    );
    assert.deepEqual(fixture.creation, []);
    assert.deepEqual(operations(fixture), []);
  });
}

for (const [raw, origins] of [
  [undefined, corsDefaults.origin],
  [
    ' https://one.test, ,https://two.test,https://one.test ',
    ['https://one.test', 'https://two.test', 'https://one.test'],
  ],
  ['', []],
]) {
  test(`factory CORS retains ${raw === undefined ? 'default' : raw === '' ? 'explicit empty' : 'trimmed ordered'} origins and complete headers/methods`, async () => {
    const fixture = unitPorts({
      env: raw === undefined ? {} : { STYNX_REFERENCE_WEB_ORIGINS: raw },
    });
    await fixture.factory.createReferenceApplication();
    assert.deepEqual(fixture.app.cors, { ...corsDefaults, origin: origins });
  });
}

for (const [environment, hsts] of [
  [{}, null],
  [{ NODE_ENV: 'production' }, 'max-age=31536000; includeSubDomains'],
  [{ STYNX_ENVIRONMENT: 'production' }, 'max-age=31536000; includeSubDomains'],
  [{ STYNX_ENVIRONMENT: 'prod' }, 'max-age=31536000; includeSubDomains'],
  [{ NODE_ENV: 'test', STYNX_ENVIRONMENT: 'development' }, null],
]) {
  test(`actual Helmet/CORS middleware on an explicit Express unit fixture honors ${JSON.stringify(environment)}`, async () => {
    const application = express();
    const fixture = unitPorts({ env: environment, express: application });
    await fixture.factory.createReferenceApplication();
    application.get('/unit-probe', (_request, response) => response.json({ probe: 'unit' }));
    const server = createServer(application);
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const url = `http://127.0.0.1:${server.address().port}/unit-probe`;
      const response = await fetch(url, { headers: { Origin: corsDefaults.origin[0] } });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { probe: 'unit' });
      assert.equal(
        response.headers.get('content-security-policy'),
        "default-src 'none';base-uri 'none';form-action 'none';frame-ancestors 'none'",
      );
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(response.headers.get('strict-transport-security'), hsts);
      assert.equal(response.headers.get('access-control-allow-origin'), corsDefaults.origin[0]);
      assert.equal(
        response.headers.get('access-control-expose-headers'),
        corsDefaults.exposedHeaders.join(','),
      );
      const preflight = await fetch(url, {
        method: 'OPTIONS',
        headers: {
          Origin: corsDefaults.origin[0],
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': corsDefaults.allowedHeaders.join(','),
        },
      });
      assert.equal(preflight.status, 204);
      assert.equal(
        preflight.headers.get('access-control-allow-methods'),
        corsDefaults.methods.join(','),
      );
      assert.equal(
        preflight.headers.get('access-control-allow-headers'),
        corsDefaults.allowedHeaders.join(','),
      );
      const unlisted = await fetch(url, { headers: { Origin: 'https://unlisted.test' } });
      assert.equal(unlisted.status, 200);
      assert.equal(unlisted.headers.get('access-control-allow-origin'), null);
      assert.equal(fixture.app.listenArguments, undefined, 'only the test owns this listener');
    } finally {
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    assert.equal(server.listening, false);
  });
}

async function executeMain(options = {}) {
  const fixture = unitPorts(options);
  let terminal;
  const completion = new Promise((resolve) => {
    terminal = resolve;
  });
  if (options.noIpc) {
    for (const method of ['log', 'error']) {
      const record = fixture.consolePort[method];
      fixture.consolePort[method] = (...values) => {
        record(...values);
        terminal();
      };
    }
  } else {
    fixture.processPort.send = (record) => {
      fixture.events.push(`ipc:${record.state}`);
      fixture.records.push(clone(record));
      if (record.state === 'bootstrap-failed' || record.state.startsWith('runtime-route-table-'))
        terminal();
      if (options.ipcFailure) throw new Error('explicit disconnected IPC unit port');
    };
  }
  evaluate('main', fixture.load, fixture.processPort, fixture.consolePort);
  await completion;
  return fixture;
}

for (const [env, expectedArguments] of [
  [{}, [3000]],
  [{ PORT: '32123' }, [32123]],
  [{ PORT: '0', STYNX_REFERENCE_API_HELPER_MANAGED: '1' }, [0, '127.0.0.1']],
  [{ STYNX_REFERENCE_API_HELPER_MANAGED: '0', STYNX_REFERENCE_API_OWNED_DIAGNOSTIC: '1' }, [3000]],
]) {
  test(`actual main unit execution preserves reflect-first IPC and listener binding ${JSON.stringify(env)}`, async () => {
    const fixture = await executeMain({ env });
    assert.deepEqual(
      fixture.records,
      ['bootstrap-entered', 'nest-created', 'listening', 'runtime-route-table-present'].map(
        (state) => ({ protocol, state }),
      ),
    );
    assert.deepEqual(fixture.events.slice(0, 3), [
      'ipc:bootstrap-entered',
      'import:reflect-metadata',
      'import:./bootstrap.js',
    ]);
    assert.deepEqual(operations(fixture), [
      'ipc:bootstrap-entered',
      'create',
      'ipc:nest-created',
      'security',
      'cors',
      'listen',
      'ipc:listening',
      'route-inspection',
      'ipc:runtime-route-table-present',
    ]);
    assert.deepEqual(fixture.app.listenArguments, expectedArguments);
    assert.deepEqual(fixture.output, { log: [['reference-api startup listening']], error: [] });
    assert.equal(fixture.processPort.exitCode, undefined);
  });
}

for (const [field, reason, expectedStates] of [
  ['createFailure', 'nest-initialization', ['bootstrap-entered', 'bootstrap-failed']],
  [
    'securityFailure',
    'pre-listen-configuration',
    ['bootstrap-entered', 'nest-created', 'bootstrap-failed'],
  ],
  [
    'corsFailure',
    'pre-listen-configuration',
    ['bootstrap-entered', 'nest-created', 'bootstrap-failed'],
  ],
  ['listenFailure', 'listen', ['bootstrap-entered', 'nest-created', 'bootstrap-failed']],
]) {
  test(`actual main bounds ${field} to its unchanged failure phase without raw errors`, async () => {
    const fixture = await executeMain({
      [field]: new Error('raw private credential unit sentinel'),
    });
    assert.deepEqual(
      fixture.records.map(({ state }) => state),
      expectedStates,
    );
    assert.deepEqual(fixture.records.at(-1), { protocol, state: 'bootstrap-failed', reason });
    assert.deepEqual(fixture.output, {
      log: [],
      error: [[`reference-api startup failed: ${reason}`]],
    });
    assert.equal(fixture.processPort.exitCode, 1);
    assert.equal(fixture.events.includes('route-inspection'), false);
    assert.doesNotMatch(
      JSON.stringify({ records: fixture.records, output: fixture.output }),
      /raw|private|credential/u,
    );
  });
}

for (const specifier of ['reflect-metadata', './bootstrap.js', '@nestjs/core', './app.module.js']) {
  test(`actual main retains initialization failure classification for ${specifier} import errors`, async () => {
    const fixture = await executeMain({
      importFailure: { specifier, error: new Error('raw import unit sentinel') },
    });
    assert.deepEqual(fixture.records, [
      { protocol, state: 'bootstrap-entered' },
      { protocol, state: 'bootstrap-failed', reason: 'nest-initialization' },
    ]);
    assert.deepEqual(fixture.creation, []);
    assert.deepEqual(fixture.output, {
      log: [],
      error: [['reference-api startup failed: nest-initialization']],
    });
    assert.equal(fixture.processPort.exitCode, 1);
  });
}

test('actual main retains ordinary no-IPC CLI startup and default listener behavior', async () => {
  const fixture = await executeMain({ noIpc: true });
  assert.deepEqual(fixture.records, []);
  assert.deepEqual(operations(fixture), [
    'create',
    'security',
    'cors',
    'listen',
    'route-inspection',
  ]);
  assert.deepEqual(fixture.app.listenArguments, [3000]);
  assert.deepEqual(fixture.output, { log: [['reference-api startup listening']], error: [] });
  assert.equal(fixture.processPort.exitCode, undefined);
});

for (const [stack, expected] of [
  [[], 'runtime-route-table-absent'],
  [[{ route: { path: '/healthz', methods: { get: true } } }], 'runtime-route-table-indeterminate'],
  [[{ route: null }], 'runtime-route-table-indeterminate'],
  [
    [{ route: { path: '/healthz', methods: { get: 'true' } } }],
    'runtime-route-table-indeterminate',
  ],
]) {
  test(`actual main retains honest unit route diagnostics for ${JSON.stringify(stack)}`, async () => {
    const fixture = await executeMain({ stack });
    assert.deepEqual(fixture.records.at(-1), { protocol, state: expected });
    assert.equal(fixture.records[2].state, 'listening');
    assert.equal(fixture.processPort.exitCode, undefined);
  });
}

test('actual main contains adapter inspection errors without relabeling them as a startup failure', async () => {
  const fixture = await executeMain({ adapterFailure: new Error('explicit unknown unit adapter') });
  assert.deepEqual(fixture.records.at(-1), {
    protocol,
    state: 'runtime-route-table-indeterminate',
  });
  assert.equal(fixture.processPort.exitCode, undefined);
  assert.deepEqual(fixture.output.error, []);
});

test('actual main preserves listener/configuration behavior when its IPC unit port disconnects', async () => {
  const fixture = await executeMain({ ipcFailure: true });
  assert.deepEqual(
    fixture.records.map(({ state }) => state),
    ['bootstrap-entered', 'nest-created', 'listening', 'runtime-route-table-present'],
  );
  assert.deepEqual(fixture.app.cors, corsDefaults);
  assert.deepEqual(fixture.app.listenArguments, [3000]);
  assert.equal(fixture.processPort.exitCode, undefined);
});
