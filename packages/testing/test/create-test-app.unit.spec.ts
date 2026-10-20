// vi.hoisted bundle: declarations referenced by vi.mock factories must be
// hoisted alongside the mock call (Vitest only hoists vi.mock + vi.hoisted).
const { connect, end, query, tx, withSystemContext, close, init, get } = vi.hoisted(() => {
  const connect = vi.fn(async () => undefined);
  const end = vi.fn(async () => undefined);
  const query = vi.fn(async (_sql?: unknown, _params?: unknown[]) => ({ rows: [] }));
  const tx = vi.fn(async (callback: (trx: unknown) => Promise<unknown>) => callback({}));
  const withSystemContext = vi.fn(async (_label: string, callback: () => Promise<unknown>) =>
    callback(),
  );
  const close = vi.fn(async () => undefined);
  const init = vi.fn(async () => undefined);
  const get = vi.fn((token: unknown) => {
    if (typeof token === 'function' && token.name === 'Database') {
      return { withSystemContext, tx };
    }
    return { runWithRequestContext: vi.fn() };
  });
  return { connect, end, query, tx, withSystemContext, close, init, get };
});

vi.mock('@nestjs/testing', () => ({
  Test: {
    createTestingModule: vi.fn(() => ({
      compile: vi.fn(async () => ({
        createNestApplication: () => ({ init, close }),
        get,
      })),
    })),
  },
}));

vi.mock('@stynx-nyx/data', () => ({
  createStynxPgClient: vi.fn(() => ({ connect, query, end })),
  Database: class Database {},
  StynxDataModule: {
    forRoot: vi.fn((options) => ({ module: 'StynxDataModule', options })),
  },
}));

vi.mock('@stynx-nyx/core', () => ({
  RequestContextMutator: class RequestContextMutator {},
}));

import { createStynxPgClient, StynxDataModule } from '@stynx-nyx/data';
import { createTestApp } from '../src/create-test-app.js';
import { MISSING_DATABASE_URL_MESSAGE } from '../src/runtime.js';
import type { TestSqlStep } from '../src/types.js';

const ADMIN_URL = 'postgresql://admin:s3cr%27t@db.test:6543/maintenance';
const DATABASE_NAME = /^create database "(stynx_testapp_[0-9a-f]{16})"$/u;

function sqlCalls(): string[] {
  return query.mock.calls.map(([sql]) => String(sql));
}

function createdDatabase(pattern = DATABASE_NAME): string {
  const name = sqlCalls().map((sql) => pattern.exec(sql)?.[1]).find(Boolean);
  expect(name).toMatch(/_testapp_[0-9a-f]{16}$/u);
  return name!;
}

function dataModuleOptions() {
  const options = vi.mocked(StynxDataModule.forRoot).mock.calls.at(-1)?.[0];
  expect(options?.appRoleName).toMatch(/_app$/u);
  return options!;
}

function connectionUrls() {
  const { connections } = dataModuleOptions();
  return {
    owner: new URL(connections.owner.connectionString!),
    app: new URL(connections.app!.connectionString!),
    reader: new URL(connections.reader!.connectionString!),
  };
}

describe('createTestApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DATABASE_URL', ADMIN_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('runs on the supplied DATABASE_URL, applies SQL steps, exposes tx/admin helpers, and tears down', async () => {
    const sqlStep: TestSqlStep = async (client) => {
      await client.query('select 2');
    };
    class ExtraModule {}
    const app = await createTestApp({
      migrations: ['select 1', sqlStep],
      seeds: ['select 3'],
      overrides: {
        controllers: [class DemoController {}],
        providers: [{ provide: 'demo', useValue: true }],
        imports: [{ module: ExtraModule }],
      },
    });

    // The role bind and the database creation each use one maintenance
    // client on DATABASE_URL; one admin client applies the SQL steps.
    expect(vi.mocked(createStynxPgClient).mock.calls.slice(0, 2)).toEqual([
      [{ connectionString: ADMIN_URL }],
      [{ connectionString: ADMIN_URL }],
    ]);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenCalledWith("select pg_advisory_xact_lock(hashtext('@stynx-nyx/testing:role-login'))");
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/create role stynx_app login noinherit nobypassrls/u));
    expect(query).toHaveBeenCalledWith("alter role stynx_app with login password 's3cr''t'");
    expect(query).toHaveBeenCalledWith('commit');
    const database = createdDatabase();
    expect(app.postgres.database).toBe(database);
    expect(query).toHaveBeenCalledWith('select 1');
    expect(query).toHaveBeenCalledWith('select 2');
    expect(query).toHaveBeenCalledWith('select 3');
    await expect(app.tx(async () => 'ok')).resolves.toBe('ok');
    const admin = await app.adminClient();
    expect(admin).toEqual({ connect, query, end });
    expect(vi.mocked(createStynxPgClient)).toHaveBeenLastCalledWith({
      connectionString: app.postgres.adminConnectionString,
    });

    query.mockClear();
    await app.teardown();
    expect(close).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/pg_terminate_backend/u), [database]);
    expect(query).toHaveBeenLastCalledWith(`drop database if exists "${database}"`);
    expect(withSystemContext).toHaveBeenCalledWith('stynx testing harness', expect.any(Function));
    expect(tx).toHaveBeenCalledWith(expect.any(Function), {
      role: 'owner',
      readonly: false,
      replica: false,
    });
  });

  it('connects every pool to the per-app database on the DATABASE_URL server', async () => {
    const app = await createTestApp();
    const database = createdDatabase();
    const urls = connectionUrls();

    for (const [pool, url] of Object.entries(urls)) {
      expect([url.host, url.pathname]).toEqual(['db.test:6543', `/${database}`]);
      expect(url.searchParams.get('application_name')).toBe(`@stynx-nyx/testing:${pool}`);
    }
    expect([urls.owner.username, urls.reader.username]).toEqual(['admin', 'admin']);
    const admin = new URL(app.postgres.connectionString);
    expect([admin.username, admin.host, admin.pathname]).toEqual(['admin', 'db.test:6543', `/${database}`]);
    expect(app.postgres.adminConnectionString).toBe(app.postgres.connectionString);
    await app.teardown();
  });

  it('bootstraps and connects as the given product roles (SM-06)', async () => {
    const app = await createTestApp({
      roles: { owner: 'demo_owner', app: 'demo_app', reader: 'demo_reader' },
    });

    expect(query).toHaveBeenCalledWith(expect.stringMatching(/rolname = 'demo_app'/u));
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/create role demo_app login noinherit nobypassrls/u));
    expect(query).toHaveBeenCalledWith("alter role demo_app with login password 's3cr''t'");
    expect(createdDatabase(/^create database "(demo_testapp_[0-9a-f]{16})"$/u)).toMatch(/^demo_/u);
    expect(query).not.toHaveBeenCalledWith(expect.stringMatching(/stynx_/u));
    const options = dataModuleOptions();
    expect(options.migrations).toEqual({ enabled: true, rolePrefix: 'demo' });
    expect(options.appRoleName).toBe('demo_app');
    const appUrl = connectionUrls().app;
    expect([appUrl.username, decodeURIComponent(appUrl.password)]).toEqual(['demo_app', "s3cr't"]);
    await app.teardown();
  });

  it('defaults to the stynx platform roles', async () => {
    const app = await createTestApp();

    const options = dataModuleOptions();
    expect(options.migrations).toEqual({ enabled: true, rolePrefix: 'stynx' });
    expect(options.appRoleName).toBe('stynx_app');
    const appUrl = connectionUrls().app;
    expect([appUrl.username, decodeURIComponent(appUrl.password)]).toEqual(['stynx_app', "s3cr't"]);
    await app.teardown();
  });

  it('refuses role names that do not share one product prefix before connecting', async () => {
    await expect(
      createTestApp({ roles: { owner: 'demo_owner', app: 'demo_app', reader: 'other_reader' } }),
    ).rejects.toThrow('Invalid test app roles');
    expect(connect).not.toHaveBeenCalled();
  });

  it('fails closed without DATABASE_URL and starts nothing', async () => {
    vi.stubEnv('DATABASE_URL', '');

    await expect(createTestApp()).rejects.toThrow(MISSING_DATABASE_URL_MESSAGE);
    expect(MISSING_DATABASE_URL_MESSAGE).toMatch(/starts no database/u);
    expect(createStynxPgClient).not.toHaveBeenCalled();
    expect(StynxDataModule.forRoot).not.toHaveBeenCalled();
  });

  it('refuses a DATABASE_URL that is not a PostgreSQL URI', async () => {
    vi.stubEnv('DATABASE_URL', 'mysql://root@localhost/db');

    await expect(createTestApp()).rejects.toThrow('DATABASE_URL must be a postgres:// or postgresql:// connection URI');
    expect(createStynxPgClient).not.toHaveBeenCalled();
  });

  it('names the unreachable endpoint without its credentials', async () => {
    connect.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    const failure = createTestApp();
    await expect(failure).rejects.toThrow(
      'createTestApp could not reach PostgreSQL at db.test:6543 (DATABASE_URL): connect ECONNREFUSED. Start PostgreSQL for the declared runtime.',
    );
    await expect(failure).rejects.not.toThrow(/s3cr/u);
    expect(end).toHaveBeenCalledTimes(1);
    expect(StynxDataModule.forRoot).not.toHaveBeenCalled();
  });

  it('keeps a Unix-socket DATABASE_URL and binds the default role password when it has none', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://me@/postgres?host=%2Ftmp%2Fpg');

    const app = await createTestApp();
    const database = createdDatabase();

    expect(query).toHaveBeenCalledWith("alter role stynx_app with login password 'stynx_test_role'");
    const { connections } = dataModuleOptions();
    expect(connections.app!.connectionString).toBe(
      `postgresql://stynx_app:stynx_test_role@/${database}?host=%2Ftmp%2Fpg&application_name=%40stynx-nyx%2Ftesting%3Aapp`,
    );
    expect(connections.owner.connectionString).toBe(
      `postgresql://me@/${database}?host=%2Ftmp%2Fpg&application_name=%40stynx-nyx%2Ftesting%3Aowner`,
    );
    connect.mockRejectedValueOnce(new Error('no socket'));
    await expect(app.teardown()).rejects.toThrow('could not reach PostgreSQL at socket /tmp/pg');
  });

  it('drops query-string credentials from the application login', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://db.test/postgres?user=admin&password=pw&sslmode=disable');

    const app = await createTestApp();

    expect(query).toHaveBeenCalledWith("alter role stynx_app with login password 'pw'");
    const appUrl = connectionUrls().app;
    expect([appUrl.protocol, appUrl.username, appUrl.password]).toEqual(['postgres:', 'stynx_app', 'pw']);
    expect([appUrl.searchParams.get('user'), appUrl.searchParams.get('password')]).toEqual([null, null]);
    expect(appUrl.searchParams.get('sslmode')).toBe('disable');
    expect(connectionUrls().owner.searchParams.get('user')).toBe('admin');
    await app.teardown();
  });

  it('starts no service and exposes only the endpoints the runtime supplies', async () => {
    const bare = await createTestApp();
    expect(bare.redis).toBe(undefined);
    expect(bare.localstack).toBe(undefined);
    expect(bare.cognito).toBe(undefined);
    await bare.teardown();

    const supplied = await createTestApp({
      redis: { url: 'redis://cache.test:6379' },
      localstack: { endpoint: 'http://aws.test:4566' },
      cognito: { endpoint: 'http://cognito.test:9229' },
    });
    expect(supplied.redis).toEqual({ url: 'redis://cache.test:6379' });
    expect(supplied.localstack).toEqual({ endpoint: 'http://aws.test:4566', region: 'us-east-1' });
    expect(supplied.cognito).toEqual({
      endpoint: 'http://cognito.test:9229',
      region: 'us-east-1',
      userPoolId: 'local_testing_pool',
      clientId: 'local_testing_client',
    });
    await supplied.teardown();

    const explicit = await createTestApp({
      localstack: { enabled: false, endpoint: 'http://aws.test:4566' },
      cognito: {
        endpoint: 'http://cognito.test:9229',
        region: 'sa-east-1',
        userPoolId: 'pool',
        clientId: 'client',
      },
    });
    expect(explicit.localstack).toBe(undefined);
    expect(explicit.cognito).toEqual({
      endpoint: 'http://cognito.test:9229',
      region: 'sa-east-1',
      userPoolId: 'pool',
      clientId: 'client',
    });
    await explicit.teardown();
  });

  it('refuses an enabled service without a supplied endpoint before connecting', async () => {
    await expect(createTestApp({ localstack: { enabled: true } })).rejects.toThrow(
      'createTestApp starts no containers: localstack.enabled requires localstack.endpoint from the runtime',
    );
    await expect(createTestApp({ cognito: { enabled: true } })).rejects.toThrow(
      'createTestApp starts no containers: cognito.enabled requires cognito.endpoint from the runtime',
    );
    expect(createStynxPgClient).not.toHaveBeenCalled();
  });

  it('applies seed-only SQL setup without requiring migrations', async () => {
    const app = await createTestApp({
      seeds: ['select seed_only'],
    });

    expect(query).toHaveBeenCalledWith('select seed_only');
    await app.teardown();
  });

  it('rolls back the role bind and creates no database when it fails', async () => {
    query.mockImplementation(async (sql?: unknown) => {
      if (String(sql).startsWith('alter role')) throw new Error('bind failed');
      return { rows: [] };
    });

    try {
      await expect(createTestApp()).rejects.toThrow('bind failed');
      expect(query).toHaveBeenCalledWith('rollback');
      expect(sqlCalls().some((sql) => sql.startsWith('create database'))).toBe(false);
      expect(sqlCalls().some((sql) => sql.startsWith('drop database'))).toBe(false);
    } finally {
      query.mockImplementation(async () => ({ rows: [] }));
    }
  });

  it('closes the app and drops the created database when initialization fails', async () => {
    init.mockRejectedValueOnce(new Error('init failed'));

    await expect(createTestApp()).rejects.toThrow('init failed');
    const database = createdDatabase();
    expect(close).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenLastCalledWith(`drop database if exists "${database}"`);
  });

  it('preserves the initialization error when cleanup also fails', async () => {
    init.mockRejectedValueOnce(new Error('init failed'));
    close.mockRejectedValueOnce(new Error('close failed'));
    query.mockImplementation(async (sql?: unknown) => {
      if (String(sql).startsWith('drop database')) throw new Error('drop failed');
      return { rows: [] };
    });

    try {
      await expect(createTestApp()).rejects.toThrow('init failed');
      expect(close).toHaveBeenCalledTimes(1);
      expect(sqlCalls().some((sql) => sql.startsWith('drop database'))).toBe(true);
    } finally {
      query.mockImplementation(async () => ({ rows: [] }));
    }
  });

  it('reports a non-Error connection failure even when closing the client also fails', async () => {
    connect.mockRejectedValueOnce('refused');
    end.mockRejectedValueOnce(new Error('end failed'));

    await expect(createTestApp()).rejects.toThrow(
      'createTestApp could not reach PostgreSQL at db.test:6543 (DATABASE_URL): refused.',
    );
  });

  it('names the default socket when DATABASE_URL has neither host nor socket directory', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://');
    connect.mockRejectedValueOnce(new Error('no server'));

    await expect(createTestApp()).rejects.toThrow('could not reach PostgreSQL at the default socket');
  });

  it('keeps an anonymous login on a path-less DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://db.test:5432');

    const app = await createTestApp();
    const database = createdDatabase();

    expect(query).toHaveBeenCalledWith("alter role stynx_app with login password 'stynx_test_role'");
    expect(dataModuleOptions().connections.owner.connectionString).toBe(
      `postgresql://db.test:5432/${database}?application_name=%40stynx-nyx%2Ftesting%3Aowner`,
    );
    await app.teardown();
  });

  it('omits Cognito when it is disabled even with an endpoint', async () => {
    const app = await createTestApp({ cognito: { enabled: false, endpoint: 'http://cognito.test:9229' } });

    expect(app.cognito).toBe(undefined);
    await app.teardown();
  });

  it('applies migration-only SQL setup without requiring seeds', async () => {
    const app = await createTestApp({ migrations: ['select migration_only'] });

    expect(query).toHaveBeenCalledWith('select migration_only');
    await app.teardown();
  });

  it('preserves the role bind error when its rollback also fails', async () => {
    query.mockImplementation(async (sql?: unknown) => {
      if (String(sql).startsWith('alter role')) throw new Error('bind failed');
      if (sql === 'rollback') throw new Error('rollback failed');
      return { rows: [] };
    });

    try {
      await expect(createTestApp()).rejects.toThrow('bind failed');
      expect(end).toHaveBeenCalledTimes(1);
    } finally {
      query.mockImplementation(async () => ({ rows: [] }));
    }
  });
});
