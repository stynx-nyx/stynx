// vi.hoisted bundle: declarations referenced by vi.mock factories must be
// hoisted alongside the mock call (Vitest only hoists vi.mock + vi.hoisted).
const { stop, connect, end, query, tx, withSystemContext, close, init, get, containers, FakeContainer } = vi.hoisted(() => {
  const stop = vi.fn(async () => undefined);
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
  const containers: Array<{
    image: string;
    environments: Record<string, string>[];
    exposedPorts: number[][];
    waitStrategies: unknown[];
  }> = [];
  class FakeContainer {
    readonly environments: Record<string, string>[] = [];
    readonly exposedPorts: number[][] = [];
    readonly waitStrategies: unknown[] = [];
    constructor(readonly image: string) {
      containers.push(this);
    }
    withEnvironment(environment: Record<string, string>) {
      this.environments.push(environment);
      return this;
    }
    withExposedPorts(...ports: number[]) {
      this.exposedPorts.push(ports);
      return this;
    }
    withWaitStrategy(strategy: unknown) {
      this.waitStrategies.push(strategy);
      return this;
    }
    async start() {
      return {
        stop,
        getHost: () => '127.0.0.1',
        getMappedPort: (port: number) => port + 10_000,
      };
    }
  }
  return { stop, connect, end, query, tx, withSystemContext, close, init, get, containers, FakeContainer };
});

vi.mock('testcontainers', () => ({
  GenericContainer: FakeContainer,
  Wait: {
    forLogMessage: vi.fn(() => 'log-wait'),
    forListeningPorts: vi.fn(() => 'port-wait'),
  },
}));

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

import { createTestApp } from '../src/create-test-app';
import type { TestSqlStep } from '../src/types';
import { Wait } from 'testcontainers';

describe('createTestApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    containers.length = 0;
  });

  it('starts optional services, applies SQL steps, exposes tx/admin helpers, and tears down', async () => {
    const sqlStep: TestSqlStep = async (client) => {
      await client.query('select 2');
    };
    class ExtraModule {}
    const app = await createTestApp({
      localstack: { enabled: false },
      cognito: { enabled: true, image: 'cognito-test:latest' },
      migrations: ['select 1', sqlStep],
      seeds: ['select 3'],
      overrides: {
        controllers: [class DemoController {}],
        providers: [{ provide: 'demo', useValue: true }],
        imports: [{ module: ExtraModule }],
      },
    });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith('select 1');
    expect(query).toHaveBeenCalledWith('select 2');
    expect(query).toHaveBeenCalledWith('select 3');
    await expect(app.tx(async () => 'ok')).resolves.toBe('ok');
    const admin = await app.adminClient();
    expect(admin).toEqual({ connect, query, end });
    await app.teardown();
    expect(close).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(3);
    expect(withSystemContext).toHaveBeenCalledWith('stynx testing harness', expect.any(Function));
    expect(tx).toHaveBeenCalledWith(expect.any(Function), {
      role: 'owner',
      readonly: false,
      replica: false,
    });
  });

  it('uses default LocalStack services and omits Cognito when disabled', async () => {
    const app = await createTestApp();

    expect(app.localstack).toEqual(
      expect.objectContaining({
        endpoint: 'http://127.0.0.1:14566',
        region: 'us-east-1',
      }),
    );
    expect(app.cognito).toBe(undefined);
    expect(containers.map((container) => ({
      image: container.image,
      environments: container.environments,
      exposedPorts: container.exposedPorts,
    }))).toEqual([
      {
        image: 'postgres:16-alpine',
        environments: [{
          GLOG_minloglevel: '2',
          POSTGRES_DB: 'postgres',
          POSTGRES_USER: 'postgres',
          POSTGRES_PASSWORD: 'postgres',
        }],
        exposedPorts: [[5432]],
      },
      {
        image: 'redis:7-alpine',
        environments: [{ GLOG_minloglevel: '2' }],
        exposedPorts: [[6379]],
      },
      {
        image: 'localstack/localstack:3.8.1',
        environments: [{
          GLOG_minloglevel: '2',
          SERVICES: 's3,kms',
          AWS_DEFAULT_REGION: 'us-east-1',
        }],
        exposedPorts: [[4566]],
      },
    ]);
    expect(app.postgres.connectionString).toBe('postgresql://postgres:postgres@127.0.0.1:15432/postgres');
    expect(app.postgres.adminConnectionString).toBe('postgresql://postgres:postgres@127.0.0.1:15432/postgres');
    expect(app.redis.url).toBe('redis://127.0.0.1:16379');
    await app.teardown();
  });

  it('uses exact Cognito defaults and exposes its complete connection contract', async () => {
    const app = await createTestApp({
      localstack: { enabled: false },
      cognito: { enabled: true },
    });

    const cognito = containers.find((container) => container.image === 'jagregory/cognito-local:latest');
    expect(cognito).toEqual(expect.objectContaining({
      environments: [{
        GLOG_minloglevel: '2',
        AWS_DEFAULT_REGION: 'us-east-1',
        COGNITO_LOCAL_PORT: '9229',
        COGNITO_LOCAL_USER_POOLS: JSON.stringify([{
          Id: 'local_testing_pool',
          Name: 'stynx-testing',
          Clients: [{ ClientId: 'local_testing_client', ClientName: 'stynx-testing-client' }],
        }]),
      }],
      exposedPorts: [[9229]],
    }));
    expect(app.cognito).toEqual(expect.objectContaining({
      endpoint: 'http://127.0.0.1:19229',
      region: 'us-east-1',
      userPoolId: 'local_testing_pool',
      clientId: 'local_testing_client',
    }));

    await app.teardown();
  });

  it('waits for the final Postgres server readiness event', async () => {
    const app = await createTestApp({ localstack: { enabled: false } });

    expect(Wait.forLogMessage).toHaveBeenCalledWith(
      /database system is ready to accept connections/u,
      2,
    );
    await app.teardown();
  });

  it('starts LocalStack with caller-provided services', async () => {
    const app = await createTestApp({
      localstack: { services: ['sqs'] },
    });

    expect(app.localstack).toEqual(
      expect.objectContaining({
        endpoint: 'http://127.0.0.1:14566',
        region: 'us-east-1',
      }),
    );
    await app.teardown();
  });

  it('applies seed-only SQL setup without requiring migrations', async () => {
    const app = await createTestApp({
      localstack: { enabled: false },
      seeds: ['select seed_only'],
    });

    expect(query).toHaveBeenCalledWith('select seed_only');
    await app.teardown();
  });

  it('stops started containers when app initialization fails', async () => {
    init.mockRejectedValueOnce(new Error('init failed'));

    await expect(createTestApp({ cognito: { enabled: true } })).rejects.toThrow('init failed');
    expect(close).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(4);
  });

  it('preserves the initialization error when cleanup also fails', async () => {
    init.mockRejectedValueOnce(new Error('init failed'));
    close.mockRejectedValueOnce(new Error('close failed'));
    stop
      .mockRejectedValueOnce(new Error('cognito stop failed'))
      .mockRejectedValueOnce(new Error('localstack stop failed'))
      .mockRejectedValueOnce(new Error('redis stop failed'))
      .mockRejectedValueOnce(new Error('postgres stop failed'));

    await expect(createTestApp({ cognito: { enabled: true } })).rejects.toThrow('init failed');
    expect(close).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(4);
  });
});
